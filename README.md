# MindReview / 知图复习

面向中学生的轻量级「知识点拆解 + 思维导图 + 主动复习」系统。

支持数学、物理、化学、历史、道法五个学科。

## 技术栈

- **前端**: Next.js 16 + React 19 + TypeScript + Tailwind CSS 4
- **脑图**: React Flow (@xyflow/react v12)
- **后端**: Next.js API Routes (全栈)
- **数据库**: PostgreSQL 16 + pgvector (向量检索)
- **ORM**: Prisma
- **LLM**: DeepSeek API (知识点拆解、题目生成、错因分析)
- **TTS**: 豆包语音 / 火山引擎 TTS
- **图片生成**: Doubao Seedream 5.0
- **部署**: Docker + docker-compose

## 核心功能

1. **知识点拆解** — AI 将教材内容拆解为最小可复习知识点，含关键词、前置知识、易错点、典型题型
2. **思维导图** — React Flow 可视化 8 种关系类型（包含、前置、因果、对比、公式推导等）
3. **ICAP 学习** — 四层递进：被动阅读 → 主动回忆 → 构建理解 → 互动深化
4. **认知负荷控制** — 基础/标准/挑战三模式，每卡一知识点，动态调整难度
5. **学科表征** — 数学公式步骤、物理受力图、化学方程式、历史时间线、道法答题模板
6. **错题系统** — AI 分析错因，关联知识点，生成同类/变式题，更新掌握度
7. **复习调度** — SM-2 间隔重复 + 艾宾浩斯遗忘曲线混合调度，预留 FSRS 接口
8. **语音朗读** — 豆包 TTS 将知识卡片、题目解析转为语音
9. **图片生成** — Seedream 生成配图、实验图、历史事件图

## 快速开始

### 前置要求
- Node.js 20+
- Docker & Docker Compose
- DeepSeek API Key (可选，不影响基础功能)

### 安装运行

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env 填入 API Key

# 2. 安装依赖
npm install

# 3. 启动 PostgreSQL
docker-compose up -d db

# 4. 数据库迁移
npx prisma migrate dev

# 5. 启动开发服务器
npm run dev
# 访问 http://localhost:3000
```

### Docker 部署

```bash
docker-compose up -d
# 访问 http://localhost:3300
```

## 项目结构

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # API Routes
│   │   ├── ai/             # LLM 题目生成/错因分析/总结/日志
│   │   ├── cards/          # 知识卡片 CRUD
│   │   ├── chapters/       # 章节管理
│   │   ├── dashboard/      # 仪表盘聚合统计
│   │   ├── image/          # 图片生成
│   │   ├── knowledge/      # 知识点 CRUD + AI 拆解
│   │   ├── mindmap/        # 思维导图数据
│   │   ├── mistakes/       # 错题管理
│   │   ├── practice/       # 主动练习 + 会话管理
│   │   ├── review/         # 复习调度 (SM-2)
│   │   ├── search/         # 语义搜索 (pgvector)
│   │   ├── settings/       # API Key 管理 + 连接测试
│   │   ├── subjects/       # 学科管理
│   │   └── tts/            # 语音合成
│   ├── auth/               # 登录/注册页
│   ├── cards/              # 知识卡片详情页
│   ├── chapters/           # 章节详情页
│   ├── dashboard/          # 仪表盘首页
│   ├── logs/               # AI 生成记录页
│   ├── mindmap/            # 思维导图页
│   ├── mistakes/           # 错题本页
│   ├── practice/           # 主动练习页 + ICAP 训练
│   ├── review/             # 每日复习页
│   ├── settings/           # 设置页
│   └── subjects/           # 学科列表页
├── components/
│   ├── auth/               # 认证上下文
│   ├── knowledge/          # 知识卡片视图、表征可视化、拆解表单
│   ├── layout/             # 导航栏
│   ├── mindmap/            # React Flow 脑图 + 自定义节点卡片
│   ├── practice/           # ICAP 学习管道
│   ├── review/             # 复习任务卡片、认知负荷管理器
│   └── ui/                 # Badge, Button, Card, MasteryBar, ErrorBoundary 等
├── lib/
│   ├── llm-client.ts       # DeepSeek LLM 封装
│   ├── tts-client.ts       # 豆包 TTS 封装
│   ├── image-client.ts     # Seedream 图片生成封装
│   ├── embedding.ts        # 向量嵌入与语义搜索
│   ├── sm2.ts              # SM-2 + 艾宾浩斯调度算法
│   ├── cognitive-load.ts   # 认知负荷管理工具
│   ├── auth.ts             # JWT 认证
│   ├── prisma.ts           # Prisma 客户端单例
│   ├── secrets.ts          # API Key AES-256 加密
│   └── utils.ts            # 工具函数
├── types/index.ts          # 全局类型定义
└── middleware.ts           # JWT 认证中间件
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | 是 | PostgreSQL 连接字符串 |
| `JWT_SECRET_KEY` | 是 | JWT 签名密钥 |
| `NEXTAUTH_SECRET` | 是 | NextAuth 密钥 |
| `DEEPSEEK_API_KEY` | 推荐 | DeepSeek API Key |
| `DEEPSEEK_BASE_URL` | 否 | API 地址 (默认 https://api.deepseek.com) |
| `DEEPSEEK_MODEL` | 否 | 模型名称 (默认 deepseek-chat) |
| `DOUBAO_TTS_API_KEY` | 否 | 豆包 TTS API Key |
| `DOUBAO_TTS_RESOURCE_ID` | 否 | TTS Resource ID (默认 seed-tts-2.0) |
| `DOUBAO_TTS_VOICE_TYPE` | 否 | 音色类型 |
| `SEEDREAM_API_KEY` | 否 | Seedream API Key |
| `SEEDREAM_ENDPOINT` | 否 | 端点地址 |
| `SEEDREAM_MODEL` | 否 | 模型名称 |
| `NEXTAUTH_URL` | 否 | NextAuth URL |
| `AUTH_CORS_ORIGINS` | 否 | CORS 白名单 |
| `NEXT_PUBLIC_AUTH_API` | 否 | Auth 服务地址 |

## 开发命令

```bash
npm run dev          # 启动开发服务器
npm run build        # 构建生产版本
npm run lint         # 代码检查
npx prisma migrate dev   # 数据库迁移
npx prisma db seed       # 填充种子数据
npx prisma studio        # Prisma Studio
```

## 数据库模型

- **User** — 用户账户
- **Subject** — 学科 (数学/物理/化学/历史/道法)
- **Chapter** — 章节 (支持嵌套层级)
- **KnowledgeNode** — 知识点 (含 SM-2 调度字段)
- **KnowledgeEdge** — 知识点关系边
- **KnowledgeCard** — 知识卡片
- **Question** — 练习题
- **Mistake** / **MistakeLog** — 错题记录
- **ReviewTask** / **ReviewLog** — 复习任务与日志
- **AiGenerationLog** — AI 调用记录
- **AudioAsset** / **ImageAsset** — 语音/图片资产

## License

MIT
