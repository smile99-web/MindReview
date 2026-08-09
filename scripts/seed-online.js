async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const bcryptModule = await import('bcryptjs');
  const bcrypt = bcryptModule.default ?? bcryptModule;
  const prisma = new PrismaClient();

  console.log('🌱 Seeding database...');

  const hash = await bcrypt.hash('password123', 10);
  await prisma.user.upsert({
    where: { username: 'demo' },
    update: {},
    create: {
      username: 'demo',
      email: 'demo@mindreview.local',
      passwordHash: hash,
      name: '演示用户',
      grade: '初二',
    },
  });
  console.log('  👤 Default user: demo / password123');

  const names = [
    { name: '语文', icon: '📖', colorClass: 'bg-orange-100 text-orange-700 border-orange-300', description: '中学语文知识体系' },
    { name: '数学', icon: '📐', colorClass: 'bg-blue-100 text-blue-700 border-blue-300', description: '中学数学知识体系' },
    { name: '物理', icon: '⚡', colorClass: 'bg-purple-100 text-purple-700 border-purple-300', description: '中学物理知识体系' },
    { name: '化学', icon: '🧪', colorClass: 'bg-green-100 text-green-700 border-green-300', description: '中学化学知识体系' },
    { name: '历史', icon: '📜', colorClass: 'bg-amber-100 text-amber-700 border-amber-300', description: '中学历史知识体系' },
    { name: '道法', icon: '⚖️', colorClass: 'bg-red-100 text-red-700 border-red-300', description: '中学道德与法治知识体系' },
  ];
  for (const s of names) {
    await prisma.subject.upsert({ where: { name: s.name }, update: {}, create: s });
  }
  console.log(`  📚 ${names.length} subjects`);

  const math = await prisma.subject.findUnique({ where: { name: '数学' } });

  // 幂等：章节/节点/边/卡片全部按业务键 findFirst → 不存在才 create。
  // 此前除 user/subjects 外都是无条件 create，二次运行会产生两套
  // 重复的"一元二次方程"章节+节点+边+卡片。
  let ch = await prisma.chapter.findFirst({
    where: { subjectId: math.id, title: '一元二次方程', parentId: null },
  });
  if (!ch) {
    ch = await prisma.chapter.create({
      data: { subjectId: math.id, title: '一元二次方程', sortOrder: 1 },
    });
  }
  console.log(`  📂 Chapter: ${ch.title}`);

  // title 在此 seed 范围内即业务键；已存在时直接复用（data 不再写入）
  async function ensureNode(title, data) {
    const found = await prisma.knowledgeNode.findFirst({
      where: { subjectId: math.id, title },
    });
    return found ?? prisma.knowledgeNode.create({ data });
  }

  const n1 = await ensureNode('一元二次方程的定义', {
    subjectId: math.id, chapterId: ch.id,
    title: '一元二次方程的定义',
    summary: '一元二次方程是只含有一个未知数（元），并且未知数的最高次数是2（次）的整式方程。一般形式为 ax² + bx + c = 0 (a≠0)。',
    keywords: ['一元二次方程', '二次项', '一次项', '常数项'],
    prerequisites: ['一元一次方程', '多项式'],
    commonMistakes: ['忘记 a≠0 的条件', '将二次项系数与一次项系数混淆'],
    typicalQuestions: ['判断是否为一元二次方程', '化为一般形式'],
    difficulty: 2, cognitiveLoad: 2, icapLevel: 'Active', masteryLevel: 0,
  });

  const n2 = await ensureNode('配方法解一元二次方程', {
    subjectId: math.id, chapterId: ch.id, parentId: n1.id,
    title: '配方法解一元二次方程',
    summary: '配方法是将一元二次方程配方变形为 (x+p)² = q 的形式，然后直接开平方求解。',
    keywords: ['配方法', '完全平方', '开平方'],
    prerequisites: ['完全平方公式', '平方根'],
    commonMistakes: ['配方时只在一边加常数', '开方时忘记正负号'],
    typicalQuestions: ['用配方法解方程', '将方程配方变形'],
    difficulty: 3, cognitiveLoad: 3, icapLevel: 'Active', masteryLevel: 0,
  });

  const n3 = await ensureNode('求根公式法', {
    subjectId: math.id, chapterId: ch.id, parentId: n1.id,
    title: '求根公式法',
    summary: '对于 ax² + bx + c = 0 (a≠0)，当判别式 Δ = b² - 4ac ≥ 0 时，x = [-b ± √(b² - 4ac)] / (2a)。',
    keywords: ['求根公式', '判别式', 'Δ'],
    prerequisites: ['配方法', '平方根'],
    commonMistakes: ['公式分母写错', '判别式计算错误'],
    typicalQuestions: ['用公式法解方程', '判别根的情况'],
    difficulty: 3, cognitiveLoad: 3, icapLevel: 'Constructive', masteryLevel: 0,
  });
  console.log('  🧩 3 knowledge nodes');

  const edges = [
    { fromId: n1.id, toId: n2.id, relationType: 'contains', label: '解法' },
    { fromId: n1.id, toId: n3.id, relationType: 'contains', label: '解法' },
    { fromId: n2.id, toId: n3.id, relationType: 'prerequisite', label: '配方法是公式法的基础' },
  ];
  for (const e of edges) {
    const found = await prisma.knowledgeEdge.findFirst({
      where: { fromId: e.fromId, toId: e.toId, relationType: e.relationType },
    });
    if (!found) await prisma.knowledgeEdge.create({ data: e });
  }

  const cards = [
    { knowledgeNodeId: n1.id, cardType: 'summary', title: '一元二次方程定义', content: '只含有一个未知数且未知数最高次数为2的整式方程。一般形式：ax² + bx + c = 0 (a≠0)' },
    { knowledgeNodeId: n2.id, cardType: 'formula', title: '配方法步骤', content: '1. 移项 2. 配方 3. 变形 4. 开方 5. 求解' },
    { knowledgeNodeId: n3.id, cardType: 'formula', title: '求根公式', content: 'x = [-b ± √(b² - 4ac)] / (2a)，其中 Δ = b² - 4ac' },
  ];
  for (const c of cards) {
    const found = await prisma.knowledgeCard.findFirst({
      where: { knowledgeNodeId: c.knowledgeNodeId, title: c.title },
    });
    if (!found) await prisma.knowledgeCard.create({ data: c });
  }

  console.log('✅ Seed complete!');
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
