# MindReview 最终交付报告

日期: 2026-05-30

---

## 1. 修改文件清单

### Phase 1 — 基础学习系统 (初始化)

| 文件 | 操作 | 说明 |
|------|------|------|
| `package.json` | 创建 | 项目依赖与脚本 |
| `prisma/schema.prisma` | 创建 | 完整数据库模型 (13 model) |
| `prisma/migrations/20260524014257_init/migration.sql` | 创建 | 初始迁移 |
| `docker-compose.yml` | 创建 | Docker 编排 |
| `Dockerfile` | 创建 | Next.js standalone 构建 |
| `src/app/layout.tsx` | 创建 | 根布局 |
| `src/app/page.tsx` | 创建 | 首页 |
| `src/app/dashboard/page.tsx` | 创建 | 仪表盘 |
| `src/app/subjects/page.tsx` | 创建 | 学科列表 |
| `src/app/subjects/[id]/page.tsx` | 创建 | 学科详情 |
| `src/app/chapters/[id]/page.tsx` | 创建 | 章节详情 |
| `src/app/cards/[id]/page.tsx` | 创建 | 卡片详情 |
| `src/app/mindmap/page.tsx` | 创建 | 思维导图 |
| `src/app/practice/page.tsx` | 创建 | 练习页 |
| `src/app/review/page.tsx` | 创建 | 复习页 |
| `src/app/mistakes/page.tsx` | 创建 | 错题本 |
| `src/app/logs/page.tsx` | 创建 | AI 日志 |
| `src/app/settings/page.tsx` | 创建 | 设置页 |
| `src/app/search/page.tsx` | 创建 | 搜索页 |
| `src/app/schemas/page.tsx` | 创建 | 图式库 |
| `src/app/auth/login/page.tsx` | 创建 | 登录页 |
| `src/app/auth/register/page.tsx` | 创建 | 注册页 |
| `src/lib/prisma.ts` | 创建 | Prisma 客户端单例 |
| `src/lib/llm-client.ts` | 创建 | DeepSeek LLM 封装 |
| `src/lib/sm2.ts` | 创建 | SM-2 + 艾宾浩斯调度算法 |
| `src/lib/cognitive-load.ts` | 创建 | 认知负荷管理 |
| `src/lib/embedding.ts` | 创建 | 向量嵌入与语义搜索 |
| `src/lib/secrets.ts` | 创建 | AES-256-GCM 加密 |
| `src/lib/server-auth.ts` | 创建 | 服务端 JWT 认证 |
| `src/lib/utils.ts` | 创建 | 工具函数 |
| `src/lib/url-security.ts` | 创建 | URL 安全校验 |
| `src/lib/user-context.ts` | 创建 | 用户上下文解析 |
| `src/lib/ui-density.ts` | 创建 | 自适应 UI 密度 |
| `src/types/index.ts` | 创建 | 全局类型定义 |
| `src/proxy.ts` | 创建 | JWT 认证中间件 |
| `src/components/auth/AuthProvider.tsx` | 创建 | 认证上下文 |
| `src/components/layout/Navbar.tsx` | 创建 | 导航栏 |
| `src/components/ui/` (8 files) | 创建 | Badge/Button/Card/EmptyState/ErrorBoundary/LatexText(er)/MasteryBar/DensityProvider |
| `src/components/mindmap/` (2 files) | 创建 | MindMap + KnowledgeNodeCard |
| `src/components/review/` (2 files) | 创建 | ReviewTaskCard + CognitiveLoadManager |
| `src/components/knowledge/DecomposeForm.tsx` | 创建 | 拆解表单 |
| `src/components/knowledge/TextbookGenerateForm.tsx` | 创建 | 教材生成表单 |
| `src/components/practice/IcapPipeline.tsx` | 创建 | ICAP 四级管道 |
| `src/app/api/subjects/route.ts` | 创建 | 学科 API |
| `src/app/api/chapters/route.ts` | 创建 | 章节列表 API |
| `src/app/api/chapters/[id]/route.ts` | 创建 | 章节 CRUD API |
| `src/app/api/knowledge/route.ts` | 创建 | 知识点列表 API |
| `src/app/api/knowledge/[id]/route.ts` | 创建 | 知识点 CRUD API |
| `src/app/api/knowledge/decompose/route.ts` | 创建 | AI 拆解 API |
| `src/app/api/cards/route.ts` | 创建 | 卡片列表 API |
| `src/app/api/cards/[id]/route.ts` | 创建 | 卡片 CRUD API |
| `src/app/api/mindmap/route.ts` | 创建 | 思维导图 API |
| `src/app/api/mistakes/route.ts` | 创建 | 错题列表 API |
| `src/app/api/mistakes/[id]/route.ts` | 创建 | 错题 CRUD API |
| `src/app/api/review/route.ts` | 创建 | 复习调度 API |
| `src/app/api/practice/route.ts` | 创建 | 练习 API |
| `src/app/api/dashboard/route.ts` | 创建 | 仪表盘 API |
| `src/app/api/ai/route.ts` | 创建 | AI 调用与日志 API |
| `src/app/api/search/route.ts` | 创建 | 语义搜索 API |
| `src/app/api/settings/route.ts` | 创建 | 设置管理 API |
| `src/app/api/settings/test-llm/route.ts` | 创建 | LLM 测试 API |
| `src/app/api/settings/test-tts/route.ts` | 创建 | TTS 测试 API |
| `src/app/api/settings/test-image/route.ts` | 创建 | 图片测试 API |
| `src/app/api/tts/route.ts` | 创建 | TTS 语音 API |
| `src/app/api/image/route.ts` | 创建 | 图片生成 API |
| `src/app/api/auth/login/route.ts` | 创建 | 登录 API |
| `src/app/api/auth/register/route.ts` | 创建 | 注册 API |
| `src/app/api/auth/refresh/route.ts` | 创建 | Token 刷新 API |
| `src/app/api/auth/me/route.ts` | 创建 | 用户信息 API |

### Phase 2 — ICAP 增强 & 学习路径

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/icap-enhancer.ts` | 创建 | ICAP 增强引擎 |
| `src/lib/learning-path.ts` | 创建 | 学习路径引擎 |
| `src/app/api/path/generate/route.ts` | 创建 | 路径生成 API |
| `src/app/api/path/adapt/route.ts` | 创建 | 路径自适应 API |
| `src/app/api/path/prerequisites/route.ts` | 创建 | 前置知识检查 API |
| `src/app/api/practice/session/route.ts` | 创建 | 练习会话管理 API |
| `src/app/api/representation/detect/route.ts` | 创建 | 表征类型检测 API |
| `src/app/api/representation/generate/route.ts` | 创建 | 表征内容生成 API |
| `src/lib/representation-engine.ts` | 创建 | 表征引擎 |
| `src/components/knowledge/FormulaView.tsx` | 创建 | 公式表征视图 |
| `src/components/knowledge/ForceDiagram.tsx` | 创建 | 受力分析视图 |
| `src/components/knowledge/TimelineView.tsx` | 创建 | 时间线视图 |
| `src/components/knowledge/CausalChainView.tsx` | 创建 | 因果链视图 |
| `src/components/knowledge/ReactionView.tsx` | 创建 | 化学反应视图 |
| `src/components/knowledge/RepresentationView.tsx` | 创建 | 表征路由视图 |
| `src/components/knowledge/BoundaryCallout.tsx` | 创建 | 边界条件提示 |
| `src/components/knowledge/MentalModelExercise.tsx` | 创建 | 心智模型练习 |
| `src/components/knowledge/SchemaApplyExercise.tsx` | 创建 | 图式应用练习 |
| `src/components/knowledge/KnowledgeCardView.tsx` | 创建 | 知识卡片多视图 |

### Phase 3 — 认知理论 & AI 导师

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/ai-tutor.ts` | 创建 | 苏格拉底 AI 导师 |
| `src/lib/tutor-persistence.ts` | 创建 | 导师对话持久化 |
| `src/app/api/tutor/chat/route.ts` | 创建 | 导师对话 API |
| `src/app/api/tutor/assess/route.ts` | 创建 | ICAP 评估 API |
| `src/app/api/tutor/history/route.ts` | 创建 | 对话历史 API |
| `src/app/api/textbook/generate/route.ts` | 创建 | 教材生成 API |
| `src/lib/llm-client.ts` | 修改 | 新增 `generateWorkedExample` 函数 |
| `src/lib/sm2.ts` | 修改 | 新增 Hint Fading 系统 |

### Phase 4 — 知识图式库

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/schema-builder.ts` | 创建 | 图式库引擎 |
| `src/app/api/schema/suggest/route.ts` | 创建 | 图式建议 API |
| `src/app/api/schema/build/route.ts` | 创建 | 图式构建 API |
| `src/app/api/schema/list/route.ts` | 创建 | 图式列表 API |
| `src/types/index.ts` | 修改 | 新增 `schema_member` 关系类型 |

### Phase 5 — 学习者画像 & 自适应

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/learner-model.ts` | 创建 | 学习者画像模型 |
| `src/app/api/learner/profile/route.ts` | 创建 | 学习者画像 API |
| `src/components/learner/LearnerProfileCard.tsx` | 创建 | 画像卡片组件 |

### Phase 6 — 安全加固

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/proxy.ts` | 修改 | 完善 JWT 认证中间件，区分公开/受保护路由 |
| `src/lib/url-security.ts` | 创建 | URL 安全校验 |
| `prisma/migrations/20260524024900_sm2_memory/migration.sql` | 创建 | SM-2 字段迁移 |
| `prisma/migrations/20260524030116_api_keys/migration.sql` | 创建 | API Key 表迁移 |
| `prisma/migrations/20260525000000_add_vector_search/migration.sql` | 创建 | pgvector 迁移 |

---

## 2. 新增功能清单

### Phase 1 — 基础系统
1. 用户认证 (JWT access + refresh token)
2. 学科管理 (6 学科 CRUD)
3. 章节管理 (嵌套层级支持)
4. AI 知识点拆解 (文本 → 结构化知识图谱)
5. 知识卡片 CRUD
6. React Flow 思维导图 (9 种关系类型可视化)
7. ICAP 四级学习管道 (Passive/Active/Constructive/Interactive)
8. 认知负荷控制 (基础/标准/挑战三模式)
9. 学科表征 (11 种类型: formula/image/step/timeline/causal/force/reaction/mindmap/template/comparison/concept_map)
10. AI 错因分析 (conceptual/calculation/careless/application)
11. SM-2 + 艾宾浩斯混合复习调度
12. 豆包 TTS 语音朗读
13. Seedream 图片生成
14. pgvector 语义搜索
15. AI 调用审计日志

### Phase 2 — ICAP 增强
16. 结构化 ICAP Constructive 任务 (4 维度自我解释提示 + 加权评价标准)
17. 结构化 ICAP Interactive 任务 (苏格拉底追问 + 变式题 + 情境挑战)
18. 自我解释验证 (AI 评分 + 缺失概念 + 误解检测)
19. 学习路径生成 (拓扑排序 DAG，尊重 prerequisite 依赖)
20. 路径自适应 (基于表现数据动态调整 ICAP 级别 + 插入补救节点)
21. 前置知识门控 (递归检查所有传递前置知识掌握度)

### Phase 3 — 认知理论
22. 样例教学 (Worked Example) — 提供逐步推理 + 相似练习
23. 提示渐隐 (Hint Fading) — 三级从完全引导到最小引导自动过渡
24. 苏格拉底 AI 导师 — 多轮对话、认知冲突法
25. ICAP 层级 AI 评估 — 基于前置知识表现自动推荐适合的 ICAP 起点
26. 认知缺口检测 — 4 类缺口 (missing_concept/superficial/inability_to_transfer/misconception)

### Phase 4 — 知识表征与图式
27. AI 表征类型自动检测 — 根据学科和内容选择最佳可视化
28. AI 表征内容生成 — 11 种类型全量结构化数据生成
29. Boundary 字段 — 全部表征含适用边界与假设条件说明
30. 知识图式库 (Schema Library) — AI 从知识图谱中识别候选图式子集
31. 图式构建 — 生成统一描述、核心洞见、应用范围、迁移提示
32. 跨域迁移检测 — 检测图式在其他学科的应用机会

### Phase 5 — 学习者画像
33. 综合学习者画像 — 认知偏好、强项弱项、学习速度、错题模式、注意力
34. 可操作建议 — 自动生成针对性学习步骤 (优先级排序)
35. Settings 推荐 — 基于画像推荐最优模式/批次/ICAP 起点
36. 预备知识诊断 (Onboarding) — 新用户年级前置概念快速评估
37. 前置知识评估 — 根据已学内容判断现有水平

### Phase 6 — 体验与安全
38. 渐进式信息披露 — 根据认知负荷调节显示内容量
39. 自适应 UI 密度 — sparse/comfortable/compact 三级
40. AES-256-GCM API Key 加密存储
41. HTTPS-only 外部 URL 安全校验
42. JWT 认证中间件 (cookie + Bearer 双通道)

---

## 3. API 清单

### 认证 API (公开 — 无需认证)
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 用户注册 |
| POST | `/api/auth/login` | 用户登录 (返回 access + refresh token) |
| POST | `/api/auth/refresh` | 刷新 access token |
| GET | `/api/auth/me` | 当前用户信息 |

### 学科与章节 API (需认证)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/subjects` | 获取所有学科 |
| POST | `/api/subjects` | 创建学科 |
| GET | `/api/chapters` | 获取章节列表 (支持 subjectId 过滤) |
| POST | `/api/chapters` | 创建章节 |
| GET | `/api/chapters/[id]` | 获取章节详情 (含子章节和知识点) |
| DELETE | `/api/chapters/[id]` | 删除章节 |

### 知识点 API (需认证)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/knowledge` | 获取知识点列表 (分页 + 排序) |
| POST | `/api/knowledge` | 创建知识点 |
| GET | `/api/knowledge/[id]` | 获取知识点详情 |
| PATCH | `/api/knowledge/[id]` | 更新知识点 |
| DELETE | `/api/knowledge/[id]` | 删除知识点 |
| POST | `/api/knowledge/decompose` | AI 拆解知识点 |

### 知识卡片 API (需认证)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/cards` | 获取卡片列表 |
| POST | `/api/cards` | 创建卡片 |
| GET | `/api/cards/[id]` | 获取卡片详情 |
| PATCH | `/api/cards/[id]` | 更新卡片 |
| DELETE | `/api/cards/[id]` | 删除卡片 |

### 思维导图 API (需认证)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/mindmap` | 获取思维导图数据 |
| POST | `/api/mindmap` | 添加/更新关系边 |

### 复习调度 API (需认证)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/review` | 获取待复习任务 |
| POST | `/api/review` | 提交复习结果 (质量评分 + SM-2 计算) |

### 练习 API (需认证)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/practice` | 获取练习内容 |
| POST | `/api/practice` | 提交练习结果 |
| POST | `/api/practice/session` | 管理练习会话 |

### 错题 API (需认证)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/mistakes` | 获取错题列表 |
| POST | `/api/mistakes` | 记录错题 + AI 分析 |
| PATCH | `/api/mistakes/[id]` | 更新错题状态 |
| DELETE | `/api/mistakes/[id]` | 删除错题 |

### 学习路径 API (需认证)
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/path/generate` | 生成学习路径 (拓扑排序) |
| POST | `/api/path/adapt` | 自适应调整路径 |
| POST | `/api/path/prerequisites` | 检查前置知识门控 |

### 表征 API (需认证)
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/representation/detect` | AI 检测最佳表征类型 |
| POST | `/api/representation/generate` | AI 生成表征结构化数据 |

### 图式库 API (需认证)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/schema/suggest` | AI 建议图式候选子集 |
| POST | `/api/schema/build` | 构建知识图式 |
| GET | `/api/schema/list` | 列出所有图式 |

### AI 导师 API (需认证)
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/tutor/chat` | 苏格拉底对话 |
| POST | `/api/tutor/assess` | ICAP 层级评估 |
| GET | `/api/tutor/history` | 对话历史 |
| DELETE | `/api/tutor/history` | 删除对话会话 |

### 学习者 API (需认证)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/learner/profile` | 获取学习者画像 |
| POST | `/api/learner/profile` | 运行预备知识诊断 |

### 多媒体 API (需认证)
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/tts` | 文字转语音 |
| GET | `/api/image` | 获取图片记录 |
| POST | `/api/image` | AI 图片生成 |

### 教材与仪表盘 API (需认证)
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/textbook/generate` | AI 教材内容生成 |
| GET | `/api/dashboard` | 仪表盘聚合统计 |
| GET | `/api/search` | 语义搜索 |
| GET | `/api/ai` | AI 生成记录 |
| POST | `/api/ai` | 通用 AI 调用 |

### 设置 API (需认证)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/settings` | 获取已配置的 API Key (脱敏) |
| POST | `/api/settings` | 保存 API Key (加密存储) |
| DELETE | `/api/settings` | 删除 API Key |
| POST | `/api/settings/test-llm` | 测试 LLM 连接 |
| POST | `/api/settings/test-tts` | 测试 TTS 连接 |
| POST | `/api/settings/test-image` | 测试图片生成连接 |

**总计: 40 个 API 路由文件, 55 个端点方法, 3 个公开端点**

---

## 4. 数据库变更清单

### 模型总数: 13 个 (prisma/schema.prisma)

### 迁移历史

| 迁移 | 日期 | 变更内容 |
|------|------|------|
| `20260524014257_init` | 2026-05-24 | 初始架构: User, Subject, Chapter, KnowledgeNode, KnowledgeEdge, KnowledgeCard, Question, Mistake, ReviewTask, ReviewLog, MistakeLog, AiGenerationLog, AudioAsset |
| `20260524024900_sm2_memory` | 2026-05-24 | KnowledgeNode 新增 SM-2 字段 (repetitions, easeFactor, intervalDays, nextReviewAt, lastReviewAt, forgetRisk), 新增 RefreshToken, ReviewLog/MistakeLog 扩展 |
| `20260524030116_api_keys` | 2026-05-24 | 新增 ApiKey 模型, 新增 ImageAsset 模型 |
| `20260525000000_add_vector_search` | 2026-05-25 | KnowledgeNode 新增 embedding (pgvector), representationType, representationData, icapLevel 字段 |

### 关键字段说明

**KnowledgeNode 核心字段:**
- `icapLevel`: Passive/Active/Constructive/Interactive (默认 Active)
- `masteryLevel`: 0-100 (掌握度百分比)
- `repetitions`: SM-2 连续正确回忆次数
- `easeFactor`: SM-2 难度系数 (>= 1.3)
- `intervalDays`: 当前复习间隔天数
- `nextReviewAt` / `lastReviewAt`: 下次/上次复习时间
- `forgetRisk`: 遗忘风险 0-1
- `representationType`: formula/image/step/timeline/causal/force/reaction/mindmap/template/comparison/concept_map
- `representationData`: JSON 格式的表征结构化数据
- `embedding`: pgvector vector(1536) for semantic search

**KnowledgeEdge 关系类型:**
- `contains`, `prerequisite`, `cause`, `compare`, `formula`, `experiment`, `mistake`, `questionType`, `schema_member`

**MistakeLog 字段:**
- `mistakeType`: conceptual/calculation/careless/application
- `severity`: 1-5
- `triggerCount`: 同类错误累计触发次数

**ReviewLog 字段:**
- `action`: reviewed/solved/mistake/mastered/diagnostic
- `quality`: 0-5 SM-2 回忆质量评分
- SM-2 快照: easeFactorBefore/After, intervalBefore/After, repetitions, forgetRisk

**ApiKey 字段:**
- `service`: llm/tts/image (unique constraint)
- `key`: AES-256-GCM 加密存储
- `testOk`: 最近测试是否通过

---

## 5. 环境变量清单

### 必需环境变量

| 变量 | 说明 | Docker 默认值 |
|------|------|---------------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | `postgresql://mindreview:mindreview@db:5432/mindreview` |
| `JWT_SECRET_KEY` | JWT 签名密钥 (生产必须更换) | `mindreview-dev-secret-change-me` |

### 可选环境变量 (AI 服务)

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DEEPSEEK_API_KEY` | - | DeepSeek API Key |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | API 地址 |
| `DEEPSEEK_MODEL` | `deepseek-chat` | LLM 模型 |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | 嵌入模型 |
| `API_KEY_ENCRYPTION_SECRET` | fallback to JWT_SECRET_KEY | API Key 加密密钥 |

### 可选环境变量 (TTS)

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DOUBAO_TTS_API_KEY` | - | 豆包 TTS API Key |
| `DOUBAO_TTS_RESOURCE_ID` | `seed-tts-2.0` | TTS Resource ID |
| `DOUBAO_TTS_VOICE_TYPE` | `zh_female_vv_uranus_bigtts` | 音色类型 |

### 可选环境变量 (图片生成)

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SEEDREAM_API_KEY` | - | Seedream API Key |
| `SEEDREAM_ENDPOINT` | `https://ark.cn-beijing.volces.com/api/v3` | 端点地址 |
| `SEEDREAM_MODEL` | `doubao-seedream-5-0` | 图片模型 |

---

## 6. 部署说明

### Docker 部署 (推荐)

```bash
# 1. 配置环境
cp .env.example .env   # 如无此文件，手动创建 .env 填入 API Key
# 或直接在 docker-compose.yml 中设置环境变量默认值

# 2. 启动全部服务 (PostgreSQL pgvector + Next.js app)
docker compose up -d

# 3. 执行数据库迁移
docker compose exec app npx prisma migrate deploy

# 4. (可选) 填充种子数据
docker compose exec app npx prisma db seed

# 5. 访问 http://localhost:3300
```

Docker Compose 服务:
- **db**: pgvector/pgvector:pg16 (端口 5434, 持久卷 pgdata)
- **app**: Next.js standalone build (端口 3300:3000, 依赖 db 健康检查)

### 手动部署

```bash
# 1. 准备 PostgreSQL + pgvector 扩展
# 2. 创建数据库 mindreview

# 3. 安装依赖
npm install

# 4. 配置环境变量
# 创建 .env 文件，至少设置 DATABASE_URL 和 JWT_SECRET_KEY

# 5. 数据库迁移
npx prisma migrate deploy

# 6. 构建
npm run build

# 7. 启动
npm run start
```

### 系统要求
- **Node.js**: >= 20
- **PostgreSQL**: >= 16 (with pgvector extension)
- **内存**: >= 1GB (开发), >= 2GB (生产, 含 pgvector 索引)
- **磁盘**: >= 1GB (不含 AI 生成的多媒体资产)

---

## 7. 未完成事项

### 高优先级
1. **FSRS 调度器** — 代码中预留了 FSRS 接口 (`src/lib/sm2.ts`)，未实现 Free Spaced Repetition Scheduler v5
2. **REST API 级权限** — 目前仅通过 JWT 中间件做认证，未实现角色/权限控制 (如 admin vs student)
3. **单元测试与集成测试** — 无任何自动化测试
4. **生产环境 .env 安全** — 当前使用硬编码默认密钥，生产部署需要强制配置
5. **API Rate Limiting** — 无速率限制，尤其 AI 调用端点可能被滥用

### 中优先级
6. **向量搜索真实嵌入** — `src/lib/embedding.ts` 的 `searchSimilarNodes` 使用关键词回退，pgvector 嵌入字段存在但搜索路径未使用向量的 `<->` 操作符
7. **Unsupported("vector(1536)")** — Prisma schema 中 embedding 字段使用 `Unsupported` 类型，意味着 Prisma 客户端无法原生使用
8. **多媒体文件存储** — TTS 语音和 Seedream 图片的 URL 依赖外部服务的临时链接，无本地持久化或 CDN 方案
9. **移动端适配** — 未做响应式设计优化，React Flow 脑图在移动端体验差
10. **国际化 (i18n)** — 仅支持中文 UI

### 低优先级
11. **音频/图片资产管理** — `AudioAsset` 和 `ImageAsset` 表已存在但 CRUD 不完整
12. **种子数据丰富度** — `prisma/seed.ts` 仅有骨架，需补充真实教学内容
13. **WebSocket 实时协作** — 无实时功能，复习/练习为纯请求-响应模式
14. **导出功能** — 无法导出错题本、复习报告为 PDF/CSV
15. **LaTeX 公式渲染** — 有 `LatexRenderer` 组件和 katex 依赖，但未在所有表征视图中集成
16. **暗色模式** — Tailwind CSS 4 支持但未实现全局切换

---

## 8. 下一步建议

### 优先级顺序

1. **补充自动化测试**
   - 原因: 40 个 API 路由无任何测试覆盖，回归风险极高
   - 行动: 引入 Vitest + MSW，优先覆盖核心 CRUD 和 SM-2 算法

2. **实现 FSRS v5 调度器**
   - 原因: SM-2 是 1987 年的算法，FSRS 有显著更高的预测准确性
   - 行动: 在 `src/lib/sm2.ts` 中实现标准 FSRS-5，与 SM-2 可切换

3. **修复向量搜索**
   - 原因: pgvector 字段已存在但语义搜索使用关键词匹配，无法发挥向量检索优势
   - 行动: 使用 `$queryRaw` 执行 `SELECT ... ORDER BY embedding <-> $1::vector LIMIT ...`

4. **API Rate Limiting**
   - 原因: AI 调用端点 (尤其是 `/api/knowledge/decompose` 和 `/api/tutor/chat`) 容易超量
   - 行动: 引入 `@upstash/ratelimit` 或 `express-rate-limit` 替代方案，按用户+端点限流

5. **完善 UI 响应式设计**
   - 原因: 中学生主要使用平板/手机
   - 行动: 针对性优化 React Flow 脑图、复习页面的移动端布局

6. **多媒体资产持久化**
   - 原因: 第三方 API 临时 URL 会过期，导致资源失效
   - 行动: 集成 Docker volume 或 S3 兼容存储 (MinIO) 做本地持久化

7. **补充种子数据**
   - 原因: 演示和验收需要真实的教学内容
   - 行动: 为数学/物理/化学添加一个完整章节的知识点图 (各 ~30 节点 + 关系边)

8. **LaTeX 渲染集成**
   - 原因: 数学/物理公式展示是核心需求，katex 依赖已安装但未完全集成
   - 行动: 在 FormulaView、KnowledgeCardView 中全面使用 LatexRenderer

9. **暗色模式支持**
   - 原因: 夜间使用场景 (Tailwind v4 暗色模式开箱即用)
   - 行动: 添加主题上下文和切换控件

10. **导出功能**
    - 原因: 学生/家长需要离线查看复习报告和错题本
    - 行动: 实现错题本 PDF 导出和复习统计 CSV 导出
