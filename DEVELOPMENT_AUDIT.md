# MindReview Development Audit

**Date:** 2026-05-30
**Scope:** Full-stack audit of 39 API routes, 22 lib files, 16 pages, 28 components, 1 Prisma schema

---

## 1. Executive Summary

MindReview is approximately **65-70% complete** as an integrated learning platform. All 16 frontend pages render complete loading/error/empty states with working navigation, the Prisma schema is well-normalized with cascading deletes, and the core learning algorithms (SM-2 + Ebbinghaus, ICAP enhancement engine, cognitive load assessment) are cleanly implemented. However, the application has three critical gaps: **(1) authentication is effectively broken** — 24 of 39 API routes have no auth, 11 routes use a fallback-to-first-DB-user pattern explicitly marked as temporary, and no Next.js middleware exists for global enforcement; **(2) generated pedagogical data is discarded** — the ICAP enhancer produces structured SelfExplanationPrompt, SocraticQuestion, and VariantQuestion arrays that are fully generated but never rendered in the frontend pipeline; and **(3) theory-to-code connectivity is incomplete** — prerequisite gating, worked examples, hint fading, onboarding diagnostics, boundary/limitation fields, and the schema library frontend page are all missing despite having backend support.

---

## 2. Backend Audit

### 2.1 Complete Routes

These routes have full functionality — real DB interactions, proper error handling, meaningful HTTP status codes, and thorough input validation on POST/PATCH.

| # | Method | Route | File | Auth | Notes |
|---|--------|-------|------|------|-------|
| 1 | POST | `/api/auth/login` | `src/app/api/auth/login/route.ts` | JWT enforced | Creates access + refresh tokens, verifies password |
| 2 | POST | `/api/auth/register` | `src/app/api/auth/register/route.ts` | JWT enforced | Creates user + tokens, validates uniqueness |
| 3 | POST | `/api/auth/refresh` | `src/app/api/auth/refresh/route.ts` | JWT enforced | Rotates refresh token, issues new access token |
| 4 | GET | `/api/auth/me` | `src/app/api/auth/me/route.ts` | JWT enforced | Returns 401 if no valid token |
| 5 | GET | `/api/subjects` | `src/app/api/subjects/route.ts` | None | Lists all subjects with chapter counts |
| 6 | GET | `/api/chapters` | `src/app/api/chapters/route.ts` | None | Lists chapters, filterable by subjectId |
| 7 | GET | `/api/chapters/[id]` | `src/app/api/chapters/[id]/route.ts` | None | Chapter detail with child nodes |
| 8 | GET | `/api/knowledge` | `src/app/api/knowledge/route.ts` | None | Lists knowledge nodes with filtering |
| 9 | GET | `/api/knowledge/[id]` | `src/app/api/knowledge/[id]/route.ts` | None | Single node detail with edges |
| 10 | POST | `/api/knowledge/decompose` | `src/app/api/knowledge/decompose/route.ts` | None | AI-powered knowledge decomposition |
| 11 | GET | `/api/search` | `src/app/api/search/route.ts` | None | Full-text search with keyword-based vector fallback |
| 12 | GET | `/api/mindmap` | `src/app/api/mindmap/route.ts` | None | Mind map data by subject/chapter/root |
| 13 | GET | `/api/cards` | `src/app/api/cards/route.ts` | None | Lists knowledge cards |
| 14 | GET | `/api/cards/[id]` | `src/app/api/cards/[id]/route.ts` | None | Single card detail |
| 15 | POST | `/api/ai` | `src/app/api/ai/route.ts` | None | AI generation log queries |
| 16 | POST | `/api/image` | `src/app/api/image/route.ts` | None | Image generation with audit logging |
| 17 | POST | `/api/tts` | `src/app/api/tts/route.ts` | None | Text-to-speech with audio asset storage |
| 18 | POST | `/api/textbook/generate` | `src/app/api/textbook/generate/route.ts` | None | AI textbook content generation |
| 19 | POST | `/api/representation/detect` | `src/app/api/representation/detect/route.ts` | None | Auto-detect best representation type |
| 20 | POST | `/api/representation/generate` | `src/app/api/representation/generate/route.ts` | None | Generate representation data for a node |
| 21 | POST | `/api/schema/build` | `src/app/api/schema/build/route.ts` | None | AI schema construction from nodes |
| 22 | GET | `/api/schema/list` | `src/app/api/schema/list/route.ts` | None | Lists constructed schemas |
| 23 | POST | `/api/schema/suggest` | `src/app/api/schema/suggest/route.ts` | None | AI schema suggestions |
| 24 | GET/PATCH | `/api/settings` | `src/app/api/settings/route.ts` | None | User settings with encrypted API key storage (AES-256-GCM) |
| 25 | POST | `/api/settings/test-llm` | `src/app/api/settings/test-llm/route.ts` | None | LLM connectivity test |
| 26 | POST | `/api/settings/test-tts` | `src/app/api/settings/test-tts/route.ts` | None | TTS connectivity test |
| 27 | POST | `/api/settings/test-image` | `src/app/api/settings/test-image/route.ts` | None | Image API connectivity test |
| 28 | POST | `/api/path/adapt` | `src/app/api/path/adapt/route.ts` | None | Adapt learning path based on performance |

### 2.2 Partial Routes

These routes function but have issues — either soft auth fallback, incomplete feature wiring, or known bugs.

| # | Method | Route | File | Issue |
|---|--------|-------|------|-------|
| 1 | GET | `/api/dashboard` | `src/app/api/dashboard/route.ts` | Soft auth (resolveUserIdFromRequest → first DB user fallback) |
| 2 | GET/POST | `/api/review` | `src/app/api/review/route.ts` | Soft auth; review tasks work but no auth enforcement |
| 3 | GET/POST | `/api/mistakes` | `src/app/api/mistakes/route.ts` | Soft auth |
| 4 | GET/PATCH/DELETE | `/api/mistakes/[id]` | `src/app/api/mistakes/[id]/route.ts` | Soft auth |
| 5 | POST | `/api/tutor/assess` | `src/app/api/tutor/assess/route.ts` | Soft auth |
| 6 | POST | `/api/tutor/chat` | `src/app/api/tutor/chat/route.ts` | Soft auth |
| 7 | GET | `/api/tutor/history` | `src/app/api/tutor/history/route.ts` | Soft auth |
| 8 | GET/POST | `/api/practice` | `src/app/api/practice/route.ts` | Soft auth (resolveUserId with body.userId) |
| 9 | GET/POST | `/api/practice/session` | `src/app/api/practice/session/route.ts` | Soft auth |
| 10 | POST | `/api/path/generate` | `src/app/api/path/generate/route.ts` | Soft auth |
| 11 | GET | `/api/learner/profile` | `src/app/api/learner/profile/route.ts` | Hybrid auth — uses JWT if present, otherwise requires userId query param (bypassable) |

### 2.3 Stub/Missing Routes

No routes return hardcoded or stub data. All 39 routes have real database interactions. However, these backend functions exist but are never called from any frontend component:

| Library Function | Defined In | Status |
|-----------------|------------|--------|
| `detectCognitiveGaps()` | `src/lib/ai-tutor.ts:254` | Fully implemented, zero callers |
| `progressiveDisclosure()` | `src/lib/ui-density.ts:59` | Fully implemented, wired into DensityProvider context, but zero consumers from components |
| `assessPriorKnowledge()` | `src/lib/learner-model.ts:552` | Implemented but returns 'beginner' for blank profiles (no onboarding diagnostic) |
| `SelfExplanationPrompt[]` | `src/lib/icap-enhancer.ts` | Generated by `generateConstructiveTasks()` but discarded — not surfaced in IcapPipeline |
| `SocraticQuestion[]` | `src/lib/icap-enhancer.ts` | Generated by `generateInteractiveTasks()` but discarded — not surfaced in IcapPipeline |
| `VariantQuestion[]` | `src/lib/icap-enhancer.ts` | Generated by `generateInteractiveTasks()` but discarded — not surfaced in IcapPipeline |

---

## 3. Frontend Audit

### 3.1 Complete Pages

All 16 pages handle loading (skeleton/spinner), error (banner/card or graceful degradation), and empty (contextual message with CTA) states. Navigation (breadcrumbs, links, back buttons) is consistently wired.

| # | Page | File | Loading | Error | Empty | Navigation |
|---|------|------|---------|-------|-------|------------|
| 1 | Home `/` | `src/app/page.tsx` | Pulsing skeleton | Error banner with retry | CTA to get started | Links to login/register |
| 2 | Login `/auth/login` | `src/app/auth/login/page.tsx` | Button spinner | Inline error message | N/A (form) | Link to register |
| 3 | Register `/auth/register` | `src/app/auth/register/page.tsx` | Button spinner | Inline error message | N/A (form) | Link to login |
| 4 | Dashboard `/dashboard` | `src/app/dashboard/page.tsx` | Skeleton cards | Error banner | "Start learning" CTA | Navbar + breadcrumbs |
| 5 | Subjects `/subjects` | `src/app/subjects/page.tsx` | Skeleton grid | Error card | "No subjects" message | Navbar |
| 6 | Subject Detail `/subjects/[id]` | `src/app/subjects/[id]/page.tsx` | Skeleton layout | Error card | Empty chapter list | Breadcrumbs + back |
| 7 | Chapter Detail `/chapters/[id]` | `src/app/chapters/[id]/page.tsx` | Skeleton layout | Error card | Empty node list | Breadcrumbs + back |
| 8 | Card Detail `/cards/[id]` | `src/app/cards/[id]/page.tsx` | Skeleton card | Error card | N/A (detail view) | Breadcrumbs + back |
| 9 | Review `/review` | `src/app/review/page.tsx` | Skeleton task cards | Error card | "All caught up" message | Navbar + breadcrumbs |
| 10 | Practice `/practice` | `src/app/practice/page.tsx` | Skeleton pipeline | Error card | "Select a topic" CTA | Navbar + breadcrumbs |
| 11 | Search `/search` | `src/app/search/page.tsx` | Search spinner | Error card | "Enter a query" prompt | Navbar |
| 12 | Mind Map `/mindmap` | `src/app/mindmap/page.tsx` | Loading placeholder | Error card | "Select a subject" prompt | Navbar |
| 13 | Mistakes `/mistakes` | `src/app/mistakes/page.tsx` | Skeleton list | Error card | "No mistakes yet" message | Navbar |
| 14 | Schemas `/schemas` | `src/app/schemas/page.tsx` | Skeleton list | Error card | "No schemas built" message | Navbar |
| 15 | Settings `/settings` | `src/app/settings/page.tsx` | Form skeleton | Error card | N/A (settings form) | Navbar |
| 16 | Logs `/logs` | `src/app/logs/page.tsx` | Skeleton table | Error card | "No generation logs" message | Navbar |

### 3.2 Partial/Broken Pages

No pages are broken. However, these issues exist:

| # | Page | Issue |
|---|------|-------|
| 1 | `/schemas` | Renders a basic list from `/api/schema/list` but has no browse/filter/apply UX — the backend endpoint is fully functional but the frontend page is minimal |
| 2 | `/practice` | IcapPipeline renders a generic textarea/chat interface instead of the structured SelfExplanationPrompt, SocraticQuestion, and VariantQuestion data generated by icap-enhancer.ts |
| 3 | `/chapters/[id]` | Content is displayed at full length with no progressive disclosure (chunking); the `progressiveDisclosure()` function exists in DensityProvider context but is never called |
| 4 | `/cards/[id]` | KnowledgeCardView renders representation data but does not invoke progressiveDisclosure for content chunking |
| 5 | `/dashboard`, `/subjects` | Error states silently `console.error` primary data load failures rather than showing user-facing feedback — could mask real issues |

### 3.3 Unused Component

| Component | File | Exports | Issue |
|-----------|------|---------|-------|
| LoadingSkeleton | `src/components/ui/LoadingSkeleton.tsx` | CardSkeleton, ListSkeleton, DetailSkeleton, DashboardSkeleton | Never imported anywhere — all pages use inline pulse animations instead |

---

## 4. Theory-to-Code Gap Matrix

### 4.1 ICAP Implementation

The ICAP framework (Passive → Active → Constructive → Interactive) is partially implemented:

| ICAP Level | Implemented | Missing |
|------------|-------------|---------|
| **Passive** | Knowledge node reading via `/api/knowledge`, `/api/chapters`, `/api/cards`; textbook content generation via `/api/textbook/generate` | No passive reading progress tracking |
| **Active** | SM-2 spaced review tasks (`/api/review`); multiple-choice/fill-blank/true-false questions; practice sessions (`/api/practice/session`); ReviewTaskCard with quality scoring | No hint fading system (Level 1→2→3 tied to SM-2 repetition count) |
| **Constructive** | `generateConstructiveTasks()` in icap-enhancer.ts generates SelfExplanationPrompt[], EvaluationCriterion[], knowledgeMapTemplate; IcapPipeline exists as a component | **SelfExplanationPrompts are generated but discarded** — IcapPipeline renders generic textarea instead of structured prompts; `detectCognitiveGaps()` in ai-tutor.ts is never called post-Constructive stage |
| **Interactive** | `generateInteractiveTasks()` in icap-enhancer.ts generates SocraticQuestion[], VariantQuestion[], ScenarioChallenge[]; AI tutor chat (`/api/tutor/chat`) | **SocraticQuestions and VariantQuestions are generated but discarded** — IcapPipeline renders generic chat instead of structured multi-round Socratic dialogue; ScenarioChallenge[] generated but never displayed |

### 4.2 Cognitive Load Implementation

| Principle | Implemented | Missing |
|-----------|-------------|---------|
| **Load Assessment** | `assessCurrentLoad()` in cognitive-load.ts — tracks error rate, response time, consecutive errors on 1-5 scale | None |
| **Adaptive Difficulty** | `getRecommendedMode()` — adjusts question difficulty based on load assessment | None |
| **Density Control** | `DensityProvider` context + `getDensityLevel()` — maps load 1-5 to sparse/comfortable/compact; wraps review and practice pages | Not integrated into KnowledgeCardView, chapters page, or RepresentationView — only shown as a badge in CognitiveLoadManager |
| **Content Chunking** | `progressiveDisclosure()` in ui-density.ts — splits content by sentence boundaries at cognitive-load-appropriate thresholds; `getInfoChunkSize()` controls batch sizes | **progressiveDisclosure is wired into DensityProvider context but never consumed by any rendering component** — all content views display full text unconditionally |
| **Explanation Length** | `getExplanationLength()` — brief/normal/detailed based on load | Never called from any component |

### 4.3 Representation Layer

| Aspect | Done | Missing |
|--------|------|---------|
| **Type Detection** | `detectRepresentationType()` in representation-engine.ts — AI-powered type selection from 11 representation types | None |
| **Data Generation** | `generateRepresentation()` — generates structured JSON for each type via LLM | None |
| **Formula View** | `FormulaView.tsx` — renders LaTeX formulas with explanations | No interactive variable substitution |
| **Causal Chain View** | `CausalChainView.tsx` — renders cause→effect chains | No interactive manipulation (what-if parameter changes) |
| **Force Diagram** | `ForceDiagram.tsx` — renders force diagrams for physics | No drag-to-adjust-force interaction |
| **Reaction View** | `ReactionView.tsx` — renders chemical reactions | No interactive balancing or condition changes |
| **Timeline View** | `TimelineView.tsx` — renders historical/process timelines | No interactive scrubbing |
| **Concept Map** | Via `MindMap.tsx` with `KnowledgeNodeCard.tsx` | No cross-chapter concept map (concept relationships across chapter boundaries) |
| **Boundary/Limitation** | Not implemented | **No `boundary` or `limitation` field exists in any representation data structure or view** — students cannot see where a representation breaks down |
| **Multi-Representation** | Not implemented | No side-by-side comparison view showing the same knowledge in 2+ representation formats |

### 4.4 Schema Layer

| Aspect | Done | Missing |
|--------|------|---------|
| **Schema Suggestions** | `suggestSchemas()` in schema-builder.ts — identifies reusable patterns across knowledge nodes | None |
| **Schema Building** | `/api/schema/build` — AI constructs schemas from node clusters | None |
| **Schema Listing** | `/api/schema/list` — returns all constructed schemas | None |
| **Schema Browse UI** | Not implemented | **No dedicated schema library browse page** — `/schemas` page is minimal; `/api/schema/list` endpoint exists and is fully functional |
| **Schema Application** | Not implemented | No practice mode that applies learned schemas to novel problems |

### 4.5 Mental Model Layer

| Aspect | Done | Missing |
|--------|------|---------|
| **Prerequisite Chains** | `KnowledgeEdge` model with `relationType: 'prerequisite'`; topological sort in learning-path.ts generates ordered learning paths | **Prerequisite gating is not enforced** — `learning-path.ts` sorts nodes topologically but does not prevent navigation to nodes whose prerequisites have `masteryLevel < threshold` |
| **Adaptive Paths** | `adaptPath()` in learning-path.ts — adjusts ICAP levels, inserts remedial steps based on performance | None |
| **Mental Model Exercise** | Not implemented | No "describe the mechanism, AI checks completeness" exercise |
| **Worked Examples** | Not implemented | No Problem→Solution→Reasoning card type with example-problem pairing |

### 4.6 Onboarding & Diagnostics

| Aspect | Done | Missing |
|--------|------|---------|
| **Prior Knowledge Assessment** | `assessPriorKnowledge()` in learner-model.ts | Returns 'beginner' for students with zero review history — **no onboarding diagnostic test** to assess actual knowledge |
| **Learner Profile** | `buildLearnerProfile()` — aggregates cognitive preferences, strengths/weaknesses, learning velocity, attention profile from DB data | None |
| **Recommendations** | `recommendOptimalSettings()` + `generateActionableSteps()` in learner-model.ts | None |

---

## 5. Priority Implementation Plan

### Phase 2 — Wire Dead/Incomplete Code (Highest ROI, ~3-5 days)

Estimated total effort: **3-5 developer-days**

| Action | Effort | Files to Touch | Description |
|--------|--------|----------------|-------------|
| P2.1 Surface structured ICAP tasks in IcapPipeline | 1 day | `src/components/practice/IcapPipeline.tsx`, `src/lib/icap-enhancer.ts` | Replace the generic textarea/chat in IcapPipeline with rendered SelfExplanationPrompt cards (Constructive stage) and multi-round SocraticQuestion dialogue (Interactive stage). The data is already generated and available from icap-enhancer.ts |
| P2.2 Connect detectCognitiveGaps to pipeline flow | 0.5 day | `src/components/practice/IcapPipeline.tsx`, `src/lib/ai-tutor.ts` | Call `detectCognitiveGaps()` automatically after the Constructive stage completes; display gap results and block advancement to Interactive if critical gaps exist |
| P2.3 Integrate progressiveDisclosure into content views | 0.5 day | `src/components/knowledge/KnowledgeCardView.tsx`, `src/app/chapters/[id]/page.tsx`, `src/components/knowledge/RepresentationView.tsx` | Consume `progressiveDisclosure` from DensityProvider context in all content-rendering components; add "Show more" expand/collapse based on cognitive load threshold |
| P2.4 Remove unused LoadingSkeleton or replace inline skeletons | 0.5 day | All 16 pages + `src/components/ui/LoadingSkeleton.tsx` | Either import LoadingSkeleton in pages that use inline pulse animations, or delete the unused component. Decision: import in all pages for consistency |
| P2.5 Extract shared sanitizeJsonString | 0.5 day | `src/lib/utils.ts`, `src/lib/llm-client.ts`, `src/lib/ai-tutor.ts`, `src/lib/schema-builder.ts`, `src/app/api/textbook/generate/route.ts`, `src/lib/representation-engine.ts` | Extract the 4 identical copies of `sanitizeJsonString` into `src/lib/utils.ts` as an exported function, replace all private copies with imports |
| P2.6 Fix embedding model name | 0.25 day | `src/lib/embedding.ts` | Change embedding model from `deepseek-chat` (a chat model) to a proper embedding model (e.g., `text-embedding-3-small` or `deepseek-embedding`) |

### Phase 3 — Fill Critical Missing Features (~5-7 days)

Estimated total effort: **5-7 developer-days**

| Action | Effort | Files to Touch | Description |
|--------|--------|----------------|-------------|
| P3.1 Implement prerequisite gating | 1 day | `src/lib/learning-path.ts`, `src/app/api/path/generate/route.ts`, frontend chapter/subject pages | Add `checkPrerequisites()` function: before navigating to a node, verify all prerequisite nodes have `masteryLevel >= 60`; return blocked nodes list to frontend; render lock icons on blocked nodes |
| P3.2 Add worked example card type | 1 day | `prisma/schema.prisma`, `src/lib/llm-client.ts`, `src/app/api/cards/route.ts`, `src/components/knowledge/KnowledgeCardView.tsx` | Add `worked_example` card type with Problem→Solution→Reasoning structure; generate via LLM; render with collapsible solution; implement example-problem pairing (show worked example, then present similar problem) |
| P3.3 Build onboarding diagnostic test | 1 day | `src/lib/learner-model.ts`, `src/app/onboarding/`, new API route | When `assessPriorKnowledge()` returns 'beginner' for a profile with zero review history, trigger a diagnostic flow: 10-15 quick questions covering prerequisite concepts for the student's grade level, scored to produce an accurate prior-knowledge map |
| P3.4 Implement hint fading system | 1 day | `src/lib/sm2.ts`, `src/components/review/ReviewTaskCard.tsx` | Tie hint levels to SM-2 repetition count: repetition 0-1 → Level 1 (full hint), repetition 2-3 → Level 2 (partial hint), repetition 4+ → Level 3 (minimal/no hint). Store hint level in ReviewTask; render progressively smaller hints |
| P3.5 Add boundary/limitation field | 0.5 day | `src/lib/representation-engine.ts`, all 6 representation view components | Add `boundary`/`limitation` field to all representation data structures; generate via LLM in `generateRepresentation()`; render as a "When this breaks down" callout in each view component |
| P3.6 Build schema library browse page | 1 day | `src/app/schemas/page.tsx` | Rewrite `/schemas` page with filter/search/browse UX; show schema name, description,覆盖的节点数, creation date; add "View Details" and "Apply to Study" actions |

### Phase 4 — Add Middleware & Fix Auth (~2-3 days)

Estimated total effort: **2-3 developer-days**

| Action | Effort | Files to Touch | Description |
|--------|--------|----------------|-------------|
| P4.1 Create Next.js middleware | 1 day | `src/middleware.ts` (new) | Create global auth middleware that validates JWT on all routes except `/api/auth/*` and public pages; redirect unauthenticated requests to login; eliminate need for per-route auth checks |
| P4.2 Replace fallback secret with env-var enforcement | 0.5 day | `src/lib/server-auth.ts`, `src/lib/secrets.ts` | In production (NODE_ENV=production), throw on startup if `JWT_SECRET_KEY` and `API_KEY_ENCRYPTION_SECRET` env vars are not set; remove `mindreview-dev-secret-change-me` fallback in production builds |
| P4.3 Remove DB fallback from user-context.ts | 0.5 day | `src/lib/user-context.ts`, all 11 soft-auth routes | After middleware is in place, remove the `resolveUserId(null)` fallback-to-first-DB-user behavior; make `resolveUserIdFromRequest()` throw 401 when no valid JWT is present |
| P4.4 Remove hardcoded `sk-placeholder` fallback | 0.25 day | `src/lib/llm-client.ts` | Require a configured API key (from DB or env var); return clear error message instead of silently using placeholder |

### Phase 5 — Interactive & Mental Model Enhancements (~5-8 days)

Estimated total effort: **5-8 developer-days**

| Action | Effort | Description |
|--------|--------|-------------|
| P5.1 Interactive manipulation for ForceDiagram | 1.5 days | Add drag-to-adjust-force interaction; re-render diagram on parameter change; update what-if analysis |
| P5.2 Interactive manipulation for CausalChain | 1 day | Add what-if parameter changes; show how effects propagate through chain |
| P5.3 Interactive manipulation for Reaction view | 1 day | Add interactive balancing (drag coefficients); show condition changes (temperature, pressure effects) |
| P5.4 Mental model building exercise | 1.5 days | New component: student types a description of the concept/mechanism; AI compares against ground truth and returns completeness score + missing elements |
| P5.5 Schema application practice | 1 day | New practice mode: present a novel problem; student identifies applicable schema; applies schema steps; AI validates |
| P5.6 Multi-representation comparison view | 1.5 days | Side-by-side view showing same knowledge node in 2+ representation formats simultaneously; toggle which formats to compare |
| P5.7 Cross-chapter concept map | 1 day | Extend MindMap to show concept relationships (`KnowledgeEdge`) that cross chapter boundaries; filter by relation type |

### Phase 6 — Polish & Hardening (~2-3 days)

Estimated total effort: **2-3 developer-days**

| Action | Effort | Description |
|--------|--------|-------------|
| P6.1 Fix silent error swallowing in primary data loads | 0.5 day | Convert `console.error` to user-facing `ErrorBoundary` or error card displays in dashboard, subjects, and mindmap pages |
| P6.2 Wire DensityProvider into all content views | 0.5 day | Currently only wraps review and practice pages; extend to chapters, cards, mindmap, and search results |
| P6.3 Add passive reading progress tracking | 0.5 day | Track which knowledge nodes have been read; display progress indicators on chapter/subject pages |
| P6.4 Fix pgvector embedding dependency | 0.5 day | Either add pgvector migration instructions and documentation, or implement a pure-text fallback that doesn't require the `vector(1536)` column type |

---

## Appendix A: Security Vulnerability Summary

| Severity | Issue | Location |
|----------|-------|----------|
| **CRITICAL** | Hardcoded JWT secret `mindreview-dev-secret-change-me` used as fallback when `JWT_SECRET_KEY` env var is not set — all JWTs are forgeable | `src/lib/server-auth.ts:5` |
| **CRITICAL** | Hardcoded encryption key `mindreview-dev-secret-change-me` used as fallback when `API_KEY_ENCRYPTION_SECRET` env var is not set — all stored API keys are decryptable | `src/lib/secrets.ts:4` |
| **CRITICAL** | `resolveUserId(null)` falls back to first user in DB when no JWT is present — any unauthenticated request gets a valid user context | `src/lib/user-context.ts:28-53` |
| **HIGH** | Hardcoded `sk-placeholder` API key fallback in LLM client | `src/lib/llm-client.ts:25` |
| **HIGH** | 24 API routes have zero authentication | See Section 2.1 for no-auth routes |
| **MEDIUM** | No rate limiting on any API route | All routes |
| **MEDIUM** | No CSRF protection on state-changing endpoints | All POST/PATCH/DELETE routes |

## Appendix B: Code Quality Highlights

| Strength | Details |
|----------|---------|
| SM-2 + Ebbinghaus algorithm | Clean implementation with quality scoring, ease factor tracking, forget risk calculation, and mastery level mapping. Schema stores full SM-2 state per node. |
| ICAP enhancement engine | Comprehensive fallback defaults for each ICAP level when AI is unavailable. Well-typed with SelfExplanationPrompt, SocraticQuestion, VariantQuestion, ScenarioChallenge interfaces. |
| URL security module | `assertSafeExternalBaseUrl()` prevents SSRF by blocking internal IPs, loopback addresses, and link-local ranges. |
| Settings encryption | AES-256-GCM encryption for API keys with IV and auth tag. Masking utility for display. |
| Prisma schema | Well-normalized with proper foreign key relations, cascading deletes, unique constraints, and SM-2 fields embedded in KnowledgeNode. |
| Error handling | All 39 routes use try/catch with meaningful HTTP status codes. No route returns 200 for errors. |
| Input validation | Thorough validation on all POST/PATCH routes — checks for required fields, valid types, and reasonable value ranges. |
