import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 创建默认用户
  const passwordHash = await bcrypt.hash('password123', 10);
  await prisma.user.upsert({
    where: { username: 'demo' },
    update: {},
    create: {
      username: 'demo',
      email: 'demo@mindreview.local',
      passwordHash,
      name: '演示用户',
      grade: '初二',
    },
  });
  console.log('  👤 Default user: demo / password123');

  // 创建学科
  const subjects = await Promise.all([
    prisma.subject.upsert({
      where: { name: '语文' },
      update: {},
      create: { name: '语文', icon: '📖', colorClass: 'bg-orange-100 text-orange-700 border-orange-300', description: '中学语文知识体系' },
    }),
    prisma.subject.upsert({
      where: { name: '数学' },
      update: {},
      create: { name: '数学', icon: '📐', colorClass: 'bg-blue-100 text-blue-700 border-blue-300', description: '中学数学知识体系' },
    }),
    prisma.subject.upsert({
      where: { name: '物理' },
      update: {},
      create: { name: '物理', icon: '⚡', colorClass: 'bg-purple-100 text-purple-700 border-purple-300', description: '中学物理知识体系' },
    }),
    prisma.subject.upsert({
      where: { name: '化学' },
      update: {},
      create: { name: '化学', icon: '🧪', colorClass: 'bg-green-100 text-green-700 border-green-300', description: '中学化学知识体系' },
    }),
    prisma.subject.upsert({
      where: { name: '历史' },
      update: {},
      create: { name: '历史', icon: '📜', colorClass: 'bg-amber-100 text-amber-700 border-amber-300', description: '中学历史知识体系' },
    }),
    prisma.subject.upsert({
      where: { name: '道法' },
      update: {},
      create: { name: '道法', icon: '⚖️', colorClass: 'bg-red-100 text-red-700 border-red-300', description: '中学道德与法治知识体系' },
    }),
  ]);

  const mathSubject = subjects[0];

  // 创建示例章节和知识点
  const chapter = await prisma.chapter.create({
    data: {
      subjectId: mathSubject.id,
      title: '一元二次方程',
      sortOrder: 1,
    },
  });

  // 创建示例知识点
  const node1 = await prisma.knowledgeNode.create({
    data: {
      subjectId: mathSubject.id,
      chapterId: chapter.id,
      title: '一元二次方程的定义',
      summary: '一元二次方程是只含有一个未知数（元），并且未知数的最高次数是2（次）的整式方程。一般形式为 ax² + bx + c = 0 (a≠0)，其中a、b、c为常数，x为未知数。',
      keywords: ['一元二次方程', '二次项', '一次项', '常数项', '一般形式'],
      prerequisites: ['一元一次方程', '多项式', '平方根'],
      commonMistakes: ['忘记 a≠0 的条件', '将二次项系数与一次项系数混淆', '移项时符号出错'],
      typicalQuestions: ['判断是否为一元二次方程', '化为一般形式', '指出各项系数'],
      difficulty: 2,
      cognitiveLoad: 2,
      icapLevel: 'Active',
      masteryLevel: 0,
    },
  });

  const node2 = await prisma.knowledgeNode.create({
    data: {
      subjectId: mathSubject.id,
      chapterId: chapter.id,
      parentId: node1.id,
      title: '配方法解一元二次方程',
      summary: '配方法是将一元二次方程通过配方变形为 (x+p)² = q 的形式，然后直接开平方求解。步骤：移项、配方、变形、开方、求解。',
      keywords: ['配方法', '完全平方', '配方', '开平方'],
      prerequisites: ['完全平方公式', '平方根', '等式性质'],
      commonMistakes: ['配方时只在一边加常数', '开方时忘记正负号', '配方计算错误'],
      typicalQuestions: ['用配方法解方程', '将方程配方变形', '求最值问题'],
      difficulty: 3,
      cognitiveLoad: 3,
      icapLevel: 'Active',
      masteryLevel: 0,
    },
  });

  const node3 = await prisma.knowledgeNode.create({
    data: {
      subjectId: mathSubject.id,
      chapterId: chapter.id,
      parentId: node1.id,
      title: '求根公式法',
      summary: '对于一元二次方程 ax² + bx + c = 0 (a≠0)，当判别式 Δ = b² - 4ac ≥ 0 时，方程的根为 x = [-b ± √(b² - 4ac)] / (2a)。',
      keywords: ['求根公式', '判别式', 'Δ', '实数根'],
      prerequisites: ['配方法', '平方根', '代数运算'],
      commonMistakes: ['公式中分母写错', '判别式计算错误', '符号处理错误'],
      typicalQuestions: ['用公式法解方程', '判别根的情况', '含参数的方程'],
      difficulty: 3,
      cognitiveLoad: 3,
      icapLevel: 'Constructive',
      masteryLevel: 0,
    },
  });

  // 创建关系
  await prisma.knowledgeEdge.createMany({
    data: [
      { fromId: node1.id, toId: node2.id, relationType: 'contains', label: '解法' },
      { fromId: node1.id, toId: node3.id, relationType: 'contains', label: '解法' },
      { fromId: node2.id, toId: node3.id, relationType: 'prerequisite', label: '配方法是公式法的基础' },
    ],
  });

  // 创建知识卡片
  await prisma.knowledgeCard.createMany({
    data: [
      {
        knowledgeNodeId: node1.id,
        cardType: 'summary',
        title: '一元二次方程定义',
        content: '只含有一个未知数且未知数最高次数为2的整式方程。一般形式：ax² + bx + c = 0 (a≠0)',
      },
      {
        knowledgeNodeId: node2.id,
        cardType: 'formula',
        title: '配方法步骤',
        content: '1. 移项：将常数项移到等号右边\n2. 配方：两边加上一次项系数一半的平方\n3. 变形：左边写成完全平方\n4. 开方：两边开平方\n5. 求解：解两个一元一次方程',
      },
      {
        knowledgeNodeId: node3.id,
        cardType: 'formula',
        title: '求根公式',
        content: 'x = [-b ± √(b² - 4ac)] / (2a)\n其中 Δ = b² - 4ac 称为判别式\nΔ > 0：两个不等实根\nΔ = 0：两个相等实根\nΔ < 0：无实数根',
      },
    ],
  });

  console.log('✅ Seed completed!');
  console.log(`  - 1 default user`);
  console.log(`  - ${subjects.length} subjects`);
  console.log(`  - 1 chapter: ${chapter.title}`);
  console.log(`  - 3 knowledge nodes`);
  console.log(`  - 3 edges`);
  console.log(`  - 3 knowledge cards`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
