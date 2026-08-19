#!/usr/bin/env node
// ---------------------------------------------------------------------------
// rebuild-textbook-content.mjs — 用经人工核验的人教版教材目录
// （data/textbook-catalog.json）重建 学科→章节→知识点 内容树。
//
// 背景：库内原内容为 LLM 批量生成——单元名虚构、每章固定 4 个知识点、
// 学期标签错乱（化学挂在八年级、地理挂在九年级）。本脚本按核验目录
// 全量替换 8 个初中学科的章节与知识点；"通用"学科与用户数据不动。
//
// 用法：
//   node scripts/rebuild-textbook-content.mjs           # 演练：只校验+打印计划
//   node scripts/rebuild-textbook-content.mjs --apply   # 实际执行
//
// 影响面（执行前务必已 pg_dump 备份）：
//   - 删除并重建 8 科的 Chapter / KnowledgeNode；
//   - 级联删除：KnowledgeEdge / KnowledgeCard / Question / ReviewTask /
//     UserKnowledgeProgress（挂在被删节点上）；
//   - 自动置空：Mistake / MistakeLog / ReviewLog 的 knowledgeNodeId
//     （错题正文等用户数据保留，仅解除与旧节点的关联）；
//   - Chapter.gradeLevel 同步写入（20260812 迁移新增列）。
// ---------------------------------------------------------------------------
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const catalogPath = process.argv.includes('--catalog')
  ? process.argv[process.argv.indexOf('--catalog') + 1]
  : path.join(process.cwd(), 'data', 'textbook-catalog.json');

const GRADE_ORDER = ['七年级上', '七年级下', '八年级上', '八年级下', '九年级上', '九年级下'];
// 学科开设矩阵：物理八年级起、化学九年级起、生物地理八年级止
const SUBJECT_GRADE_LEVELS = {
  语文: GRADE_ORDER,
  数学: GRADE_ORDER,
  历史: GRADE_ORDER,
  道法: GRADE_ORDER,
  物理: ['八年级上', '八年级下', '九年级上', '九年级下'],
  化学: ['九年级上', '九年级下'],
  生物: ['七年级上', '七年级下', '八年级上', '八年级下'],
  地理: ['七年级上', '七年级下', '八年级上', '八年级下'],
};
const SUBJECT_STYLE = {
  语文: { icon: '📖', colorClass: 'bg-orange-100 text-orange-700 border-orange-300' },
  数学: { icon: '📐', colorClass: 'bg-blue-100 text-blue-700 border-blue-300' },
  物理: { icon: '⚡', colorClass: 'bg-purple-100 text-purple-700 border-purple-300' },
  化学: { icon: '🧪', colorClass: 'bg-green-100 text-green-700 border-green-300' },
  历史: { icon: '📜', colorClass: 'bg-amber-100 text-amber-700 border-amber-300' },
  道法: { icon: '⚖️', colorClass: 'bg-red-100 text-red-700 border-red-300' },
  地理: { icon: '🌍', colorClass: 'bg-teal-100 text-teal-700 border-teal-300' },
  生物: { icon: '🧬', colorClass: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
};

function validate(catalog) {
  const errors = [];
  for (const [subject, byGrade] of Object.entries(catalog)) {
    const allowed = SUBJECT_GRADE_LEVELS[subject];
    if (!allowed) { errors.push(`未知学科 "${subject}"（不在开设矩阵内）`); continue; }
    for (const [gradeLevel, vol] of Object.entries(byGrade)) {
      if (!allowed.includes(gradeLevel)) {
        errors.push(`${subject} ${gradeLevel}：该学期不开设此学科（矩阵外）`);
        continue;
      }
      if (!vol || typeof vol !== 'object') { errors.push(`${subject} ${gradeLevel}：卷数据缺失`); continue; }
      if (!vol.edition) errors.push(`${subject} ${gradeLevel}：缺 edition 版本标注`);
      if (!Array.isArray(vol.chapters)) { errors.push(`${subject} ${gradeLevel}：chapters 非数组`); continue; }
      const seenCh = new Set();
      for (const ch of vol.chapters) {
        const t = (ch.title || '').trim();
        if (!t) { errors.push(`${subject} ${gradeLevel}：存在空章标题`); continue; }
        if (seenCh.has(t)) errors.push(`${subject} ${gradeLevel}：章标题重复 "${t}"`);
        seenCh.add(t);
        if (!Array.isArray(ch.sections)) { errors.push(`${subject} ${gradeLevel} ${t}：sections 非数组`); continue; }
        const seenSec = new Set();
        for (const s of ch.sections) {
          const st = (s || '').trim();
          if (!st) errors.push(`${subject} ${gradeLevel} ${t}：存在空节标题`);
          else if (seenSec.has(st)) errors.push(`${subject} ${gradeLevel} ${t}：节标题重复 "${st}"`);
          else seenSec.add(st);
        }
      }
    }
  }
  return errors;
}

const rawCatalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
// 文件带 {version, subjects} 包装；兼容裸 subjects 映射
const catalog = rawCatalog.subjects ?? rawCatalog;
const errors = validate(catalog);
if (errors.length) {
  console.error('目录校验失败：');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

const prisma = new PrismaClient();

async function rebuildSubject(tx, subject, byGrade) {
  const prismaClient = tx;
  const style = SUBJECT_STYLE[subject];
  const subjectRow = await prismaClient.subject.upsert({
    where: { name: subject },
    update: {
      icon: style.icon,
      colorClass: style.colorClass,
      description: '人教版教材内容（2026-08 按现行教材目录核验重建）',
    },
    create: {
      name: subject,
      icon: style.icon,
      colorClass: style.colorClass,
      description: '人教版教材内容（2026-08 按现行教材目录核验重建）',
    },
  });

  const before = {
    chapters: await prismaClient.chapter.count({ where: { subjectId: subjectRow.id } }),
    nodes: await prismaClient.knowledgeNode.count({ where: { subjectId: subjectRow.id } }),
  };

  // 删节点（DB 级联清 edges/cards/questions/reviewTasks/progress，
  // mistakes/logs 自动 SET NULL），再删章节
  await prismaClient.knowledgeNode.deleteMany({ where: { subjectId: subjectRow.id } });
  await prismaClient.chapter.deleteMany({ where: { subjectId: subjectRow.id } });

  let chapters = 0;
  let nodes = 0;
  let edges = 0;
  const perVolume = [];
  for (const gradeLevel of GRADE_ORDER) {
    const vol = byGrade[gradeLevel];
    if (!vol) continue;
    let volNodes = 0;
    for (const [ci, ch] of vol.chapters.entries()) {
      const chapter = await prismaClient.chapter.create({
        data: {
          subjectId: subjectRow.id,
          title: ch.title.trim(),
          sortOrder: ci + 1,
          gradeLevel,
        },
      });
      chapters += 1;
      let prevNode = null;
      for (const secTitle of ch.sections) {
        const title = secTitle.trim();
        const node = await prismaClient.knowledgeNode.create({
          data: {
            subjectId: subjectRow.id,
            chapterId: chapter.id,
            title,
            summary: `人教版《${subject}》${gradeLevel} · ${ch.title.trim()}`,
            gradeLevel,
          },
        });
        nodes += 1;
        volNodes += 1;
        if (prevNode) {
          await prismaClient.knowledgeEdge.create({
            data: {
              fromId: prevNode.id,
              toId: node.id,
              relationType: 'prerequisite',
              label: `${prevNode.title} → ${node.title}`,
            },
          });
          edges += 1;
        }
        prevNode = node;
      }
    }
    perVolume.push(`${gradeLevel}[${vol.edition}] ${vol.chapters.length}章/${volNodes}节`);
  }
  return { before, after: { chapters, nodes, edges }, perVolume };
}

console.log(`${APPLY ? '【执行】' : '【演练】'}目录：${catalogPath}`);
const subjects = Object.keys(catalog);
for (const subject of subjects) {
  if (APPLY) {
    // 每科一个事务：单科失败不波及其他科；失败后中止并提示从备份恢复
    try {
      const r = await prisma.$transaction(
        (tx) => rebuildSubject(tx, subject, catalog[subject]),
        { timeout: 120000, maxWait: 15000 },
      );
      console.log(`✔ ${subject}：删 ${r.before.chapters}章/${r.before.nodes}点 → 建 ${r.after.chapters}章/${r.after.nodes}点/${r.after.edges}边`);
      for (const v of r.perVolume) console.log(`    ${v}`);
    } catch (err) {
      console.error(`✘ ${subject} 重建失败，已回滚本科：`, err);
      process.exitCode = 1;
      break;
    }
  } else {
    for (const gradeLevel of GRADE_ORDER) {
      const vol = catalog[subject][gradeLevel];
      if (!vol) continue;
      const secCount = vol.chapters.reduce((n, c) => n + c.sections.length, 0);
      console.log(`${subject} ${gradeLevel} [${vol.edition}] ${vol.chapters.length}章/${secCount}节`);
    }
  }
}
await prisma.$disconnect();
console.log(APPLY ? '完成。' : '演练完成（未写库）。加 --apply 执行。');
