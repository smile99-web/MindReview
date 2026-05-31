# MindReview / 知图复习

面向中学生的轻量级「知识点拆解 + 思维导图 + 主动复习」系统。

支持语文、数学、物理、化学、历史、道法六个学科。

## 技术栈

- **前端**: Next.js 16 + React 19 + TypeScript + Tailwind CSS 4
- **脑图**: React Flow (@xyflow/react v12)
- **后端**: Next.js API Routes (全栈)
- **数据库**: PostgreSQL 16 + pgvector (向量检索)
- **ORM**: Prisma 6
- **LLM**: DeepSeek API (知识点拆解、题目生成、错因分析、苏格拉底辅导)
- **TTS**: 豆包语音 / 火山引擎 TTS
- **图片生成**: Doubao Seedream 5.0
- **部署**: Docker + docker-compose

## 核心功能

### Phase 1 — 基础学习系统
1. **知识点拆解** — AI 将教材内容拆解为最小可复习知识点，含关键词、前置知识、易错点、典型题型
2. **思维导图** — React Flow 可视化 9 种关系类型（包含、前置、因果、对比、公式推导、实验验证、易错关联、题型关联、图式成员）
3. **ICAP 学习管道** — 四层递进：被动阅读 → 主动回忆 → 构建理解 → 互动深化
4. **认知负荷控制** — 基础/标准/挑战三模式，动态评估负载、建议休息、调节每批任务数
5. **学科表征系统** — 数学公式步骤、物理受力图、化学方程式、历史时间线、道法答题模板、概念关系图等 11 种表征类型
6. **错题系统** — AI 分析错因（概念/计算/粗心/应用），关联知识点，生成同类/变式题
7. **复习调度** — SM-2 间隔重复 + 艾宾浩斯遗忘曲线混合调度
8. **语音朗读** — 豆包 TTS 将知识卡片、题目解析转为语音
9. **图片生成** — Seedream 生成配图、实验图、历史事件图

### Phase 2 — ICAP 增强 & 学习路径
10. **结构化 ICAP 任务** — Constructive（自我解释提示 + 评价标准）和 Interactive（苏格拉底追问 + 变式题 + 情境挑战）
11. **前置知识门控** — 基于 KnowledgeEdge prerequisite 关系的可访问性检查，支持递归和批量模式
12. **学习路径生成** — 拓扑排序 DAG 生成最优学习序列，按 prerequisite 和难度排序
13. **路径自适应** — 基于表现数据动态调整 ICAP 层级和插入补救节点

### Phase 3 — 认知理论与学习分析
14. **样例教学（Worked Example）** — 认知负荷理论驱动的逐步推理示例 + 相似练习题
15. **提示渐隐（Hint Fading）** — 三级渐进式提示（完全引导→部分引导→最小引导），随掌握度自动撤除
16. **AI 导师（Socratic Tutor）** — 苏格拉底式多轮对话、ICAP 层级评估、认知缺口检测
17. **学习者画像** — 综合分析认知偏好、强项/弱项学科、学习速度、错题模式、注意力档案
18. **可操作建议** — 基于画像自动生成针对性学习步骤（纠错、画图、练习、系统学习）

### Phase 4 — 知识表征与图式
19. **AI 表征检测** — 自动判断知识点最适合的可视化表征类型
20. **AI 表征生成** — 为 11 种表征类型生成结构化数据（公式变量、受力分析、时间线事件、反应方程等）
21. **BOUNDARY 字段** — 所有表征类型包含适用边界/假设条件/失效场景说明
22. **表征视图组件** — FormulaView, ForceDiagram, TimelineView, ReactionView, CausalChainView 等
23. **知识图式库（Schema Library）** — AI 从关联知识点中识别可构成图式的节点子集
24. **图式构建** — 生成统一图式描述、核心洞见、应用范围、迁移提示
25. **跨域迁移检测** — 检测图式在其他学科/领域的应用机会

### Phase 5 — 体验与安全
26. **多表征视图** — 同一知识点的多种表示形式相互切换
27. **跨章节知识图谱** — 全局视角查看跨章节知识点关系
28. **渐进式信息披露** — 根据认知负荷自动调节显示内容的详细程度
29. **自适应 UI 密度** — sparse/comfortable/compact 三级密度
30. **Onboarding 预备知识诊断** — 新用户年级前置概念快速诊断，自动推荐起点
31. **Auth 加固** — JWT access token + refresh token 机制、AES-256-GCM API Key 加密、URL 安全校验
32. **系统设置** — 可视化配置 LLM/TTS/Image API Key，连接测试
33. **正文生成** — AI 根据学科和年级生成教材内容

## 快速开始

### 前置要求
- Node.js 20+
- Docker & Docker Compose
- DeepSeek API Key (可选，不影响基础功能)

### 安装运行

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env 填入 API Key (如无 .env.example，参考下方环境变量表自建)

# 2. 安装依赖
npm install

# 3. 启动 PostgreSQL (pgvector)
docker compose up -d db

# 4. 数据库迁移
npx prisma migrate dev

# 5. (可选) 填充种子数据
npx prisma db seed

# 6. 启动开发服务器
npm run dev
# 访问 http://localhost:3000
```

### Docker 部署

```bash
docker compose up -d
# 访问 http://localhost:3300
```

## 项目结构

```
MindReview/
├── docker-compose.yml          # Docker 编排 (pgvector + app)
├── Dockerfile                  # Next.js standalone 构建
├── package.json                # 依赖与脚本
├── tsconfig.json               # TypeScript 配置
├── .env.example                # 环境变量模板 (需要自行创建)
├── .gitignore
├── .dockerignore
├── AGENTS.md                   # AI 代理参考
├── CLAUDE.md                   # Claude Code 配置
├── prisma/
│   ├── schema.prisma           # 数据库模型 (13 个模型)
│   ├── seed.ts                 # 种子数据
│   └── migrations/             # 迁移历史 (5 次)
├── src/
│   ├── middleware.ts (proxy.ts) # JWT 认证中间件
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx          # 根布局
│   │   ├── page.tsx            # 首页 (登录引导)
│   │   ├── api/                # API Routes (40 个文件)
│   │   │   ├── ai/             # LLM 调用与日志
│   │   │   ├── auth/           # 认证 (login/register/refresh/me)
│   │   │   ├── cards/          # 知识卡片 CRUD
│   │   │   ├── chapters/       # 章节管理 + 层级
│   │   │   ├── dashboard/      # 仪表盘聚合统计
│   │   │   ├── image/          # Seedream 图片生成
│   │   │   ├── knowledge/      # 知识点 CRUD + AI 拆解
│   │   │   ├── learner/        # 学习画像 + 预备诊断
│   │   │   ├── mindmap/        # 思维导图数据
│   │   │   ├── mistakes/       # 错题管理 + 分析
│   │   │   ├── path/           # 学习路径 (生成/自适应/前置检查)
│   │   │   ├── practice/       # ICAP 练习 + 会话管理
│   │   │   ├── representation/ # 表征检测 + AI 生成
│   │   │   ├── review/         # SM-2 复习调度 + 任务
│   │   │   ├── schema/         # 图式库 (建议/构建/列表)
│   │   │   ├── search/         # 语义搜索
│   │   │   ├── settings/       # API Key 管理 + 连接测试
│   │   │   ├── subjects/       # 学科管理
│   │   │   ├── textbook/       # AI 教材内容生成
│   │   │   ├── tts/            # 豆包语音合成
│   │   │   └── tutor/          # AI 导师 (对话/评估/历史)
│   │   ├── auth/               # 登录/注册页面
│   │   ├── cards/              # 知识卡片详情页
│   │   ├── chapters/           # 章节详情页
│   │   ├── dashboard/          # 仪表盘首页
│   │   ├── logs/               # AI 生成记录页
│   │   ├── mindmap/            # 思维导图页 (React Flow)
│   │   ├── mistakes/           # 错题本页
│   │   ├── practice/           # ICAP 训练页
│   │   ├── review/             # 每日复习页
│   │   ├── schemas/            # 图式库管理页
│   │   ├── search/             # 语义搜索页
│   │   ├── settings/           # 系统设置页
│   │   └── subjects/           # 学科列表页
│   ├── components/
│   │   ├── auth/               # AuthProvider 认证上下文
│   │   ├── knowledge/          # 知识卡片视图 (FormulaView, ForceDiagram, TimelineView 等)
│   │   ├── layout/             # Navbar 导航栏
│   │   ├── learner/            # LearnerProfileCard
│   │   ├── mindmap/            # MindMap 脑图 + KnowledgeNodeCard
│   │   ├── practice/           # IcapPipeline 四层学习管道
│   │   ├── review/             # ReviewTaskCard + CognitiveLoadManager
│   │   └── ui/                 # Badge, Button, Card, EmptyState, ErrorBoundary, LatexRenderer, MasteryBar, DensityProvider
│   ├── lib/
│   │   ├── ai-tutor.ts         # 苏格拉底导师 (对话/ICAP评估/认知缺口)
│   │   ├── auth.ts             # JWT 认证 (客户端)
│   │   ├── cognitive-load.ts   # 认知负荷评估与管理
│   │   ├── embedding.ts        # pgvector 嵌入生成与语义搜索
│   │   ├── icap-enhancer.ts    # ICAP 增强引擎 (Constructive/Interactive 任务设计)
│   │   ├── image-client.ts     # Seedream 图片生成 API 封装
│   │   ├── learner-model.ts    # 学习者画像 + 预备诊断 + 前置评估
│   │   ├── learning-path.ts    # 学习路径引擎 (拓扑排序 + 前置门控)
│   │   ├── llm-client.ts       # DeepSeek LLM 封装 (拆解/题目/错因/样例)
│   │   ├── prisma.ts           # Prisma 客户端单例
│   │   ├── representation-engine.ts # 表征检测 + AI 生成 + 保存 (11 种类型)
│   │   ├── schema-builder.ts   # 图式库引擎 (建议/构建/跨域迁移)
│   │   ├── secrets.ts          # AES-256-GCM API Key 加密/解密
│   │   ├── server-auth.ts      # 服务端 JWT 验证 + extractUserIdFromRequest
│   │   ├── sm2.ts              # SM-2 + 艾宾浩斯调度 + Hint Fading 系统
│   │   ├── tts-client.ts       # 豆包 TTS 语音合成 API 封装
│   │   ├── tutor-persistence.ts # 导师对话持久化 (sessions + history)
│   │   ├── ui-density.ts       # 自适应 UI 密度 + 渐进披露
│   │   ├── url-security.ts     # URL 安全校验 (禁止内网地址)
│   │   ├── user-context.ts     # 用户身份解析 (resolves JWT userId)
│   │   └── utils.ts            # JSON 清洗、日期格式化、掌握度标签
│   └── types/
│       └── index.ts            # 全局类型定义 (学科/ICAP/表征/API 接口)
└── next.config.ts              # Next.js 配置
```

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `DATABASE_URL` | 是 | - | PostgreSQL 连接字符串 |
| `JWT_SECRET_KEY` | 生产环境 | `mindreview-dev-secret-change-me` | JWT 签名密钥（生产必须更换） |
| `DEEPSEEK_API_KEY` | 推荐 | - | DeepSeek API Key |
| `DEEPSEEK_BASE_URL` | 否 | `https://api.deepseek.com` | API 地址 |
| `DEEPSEEK_MODEL` | 否 | `deepseek-chat` | 模型名称 |
| `EMBEDDING_MODEL` | 否 | `text-embedding-3-small` | 嵌入模型 (需 OpenAI 兼容端点) |
| `DOUBAO_TTS_API_KEY` | 否 | - | 豆包 TTS API Key |
| `DOUBAO_TTS_RESOURCE_ID` | 否 | `seed-tts-2.0` | TTS Resource ID |
| `DOUBAO_TTS_VOICE_TYPE` | 否 | `zh_female_vv_uranus_bigtts` | 音色类型 |
| `SEEDREAM_API_KEY` | 否 | - | Seedream 图片生成 API Key |
| `SEEDREAM_ENDPOINT` | 否 | `https://ark.cn-beijing.volces.com/api/v3` | 端点地址 |
| `SEEDREAM_MODEL` | 否 | `doubao-seedream-5-0` | 图片生成模型 |
| `API_KEY_ENCRYPTION_SECRET` | 否 | fallback to JWT_SECRET_KEY | API Key 加密密钥 |

## 开发命令

```bash
npm run dev          # 启动开发服务器
npm run build        # 构建生产版本
npm run start        # 启动生产服务器
npm run lint         # 代码检查
npm run db:migrate   # 数据库迁移 (npx prisma migrate dev)
npm run db:seed      # 填充种子数据
npm run db:studio    # Prisma Studio 可视化
npm run docker:up    # Docker Compose 启动
npm run docker:down  # Docker Compose 停止
npm run docker:build # Docker Compose 构建
```

## 数据库模型 (13 个)

| 模型 | 说明 |
|------|------|
| **User** | 用户账户 (含年级) |
| **RefreshToken** | JWT Refresh Token 持久化 |
| **Subject** | 学科 (语文/数学/物理/化学/历史/道法) |
| **Chapter** | 章节 (支持嵌套层级) |
| **KnowledgeNode** | 知识点 (含 SM-2 调度字段、ICAP 层级、表征数据、pgvector 嵌入) |
| **KnowledgeEdge** | 知识点关系边 (9 种关系类型) |
| **KnowledgeCard** | 知识卡片 (摘要/公式/图表/时间线/模板/错题) |
| **Question** | 练习题 (选择题/填空/判断/简答/变式题，含 ICAP 层级) |
| **Mistake** | 错题记录 (含 AI 错因分析) |
| **MistakeLog** | 错题日志 (严重程度、触发次数) |
| **ReviewTask** | 复习任务 (ICAP 分层，含 AI 反馈) |
| **ReviewLog** | 复习日志 (含 SM-2 快照、质量评分) |
| **AiGenerationLog** | AI 调用审计日志 |
| **AudioAsset** | 语音资产 |
| **ImageAsset** | 图片资产 |
| **ApiKey** | 加密存储的外部服务 API Key |

## License

MIT
