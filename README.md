# 知图复习 MindReview

面向中学生的轻量级"知识点拆解 + 思维导图 + 主动复习系统"。

支持数学、物理、化学、历史、道法五个学科。

## 技术栈

- **前端**：Next.js + React + TypeScript + Tailwind CSS
- **脑图**：React Flow (@xyflow/react)
- **后端**：Next.js API Routes（全栈）
- **数据库**：PostgreSQL + pgvector
- **ORM**：Prisma
- **LLM**：DeepSeek API
- **TTS**：豆包语音 / 火山引擎 TTS
- **图片生成**：Doubao Seedream 5.0
- **部署**：Docker + docker-compose

## 快速开始

### 1. 环境配置

```bash
cp .env.example .env
# 编辑 .env 填入真实的 API Key
```

### 2. 数据库启动

```bash
# Docker方式
docker-compose up -d db

# 或使用本地 PostgreSQL + pgvector
```

### 3. 安装依赖 & 迁移

```bash
npm install
npx prisma migrate dev --name init
npx prisma db seed
```

### 4. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

### 5. Docker 完整部署

```bash
docker-compose up -d
```

## 项目结构

```
src/
├── app/
│   ├── api/           # API Routes
│   │   ├── knowledge/ # 知识点拆解CRUD
│   │   ├── mindmap/   # 思维导图数据
│   │   ├── review/    # 复习调度
│   │   ├── mistakes/  # 错题管理
│   │   ├── tts/       # 文字转语音
│   │   ├── image/     # 图片生成
│   │   ├── ai/        # AI出题/分析
│   │   ├── subjects/  # 学科管理
│   │   └── chapters/  # 章节管理
│   ├── dashboard/     # 仪表盘
│   ├── subjects/      # 学科列表/详情
│   ├── chapters/      # 章节详情
│   ├── mindmap/       # 思维导图页
│   ├── cards/         # 知识卡片详页
│   ├── practice/      # 练习页
│   ├── mistakes/      # 错题本
│   ├── review/        # 每日复习
│   ├── logs/          # AI生成记录
│   └── settings/      # 设置页
├── components/
│   ├── layout/        # Navbar等布局
│   ├── ui/            # Button/Badge/Card等
│   ├── mindmap/       # React Flow脑图
│   ├── knowledge/     # 知识点组件
│   └── review/        # 复习任务组件
├── lib/
│   ├── prisma.ts      # Prisma客户端
│   ├── llm-client.ts  # DeepSeek LLM封装
│   ├── tts-client.ts  # 豆包TTS封装
│   ├── image-client.ts# Seedream图片封装
│   └── utils.ts       # 工具函数
└── types/index.ts     # 类型定义
```

## 核心功能

1. **知识点拆解** - AI将教材内容拆解为最小可复习知识点
2. **思维导图** - React Flow展示知识点关系网络
3. **ICAP学习任务** - Passive/Active/Constructive/Interactive四层递进
4. **认知负荷控制** - 基础/标准/挑战三种模式，每卡一知识点
5. **学科表征系统** - 理科重图示公式，文科重时间线因果链
6. **错题系统** - AI分析错因，关联知识点，更新掌握度
7. **复习调度** - 基于掌握度的间隔复习规则，预留FSRS接口

## 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `DEEPSEEK_API_KEY` | DeepSeek API密钥 | 是 |
| `DATABASE_URL` | PostgreSQL连接串 | 是 |
| `DOUBAO_TTS_APP_ID` | 豆包TTS（可选） | 否 |
| `SEEDREAM_API_KEY` | 图片生成（可选） | 否 |

## License

MIT
