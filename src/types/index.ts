// ========== 学科 ==========
export type SubjectName = '语文' | '数学' | '物理' | '化学' | '历史' | '道法';

export const SUBJECTS: SubjectName[] = ['语文', '数学', '物理', '化学', '历史', '道法'];

export const SUBJECT_CONFIG: Record<SubjectName, {
  icon: string;
  colorClass: string;
  representationTypes: string[];
}> = {
  '语文': {
    icon: '📖',
    colorClass: 'bg-orange-100 text-orange-700 border-orange-300',
    representationTypes: ['text', 'poem', 'essay', 'classical'],
  },
  '数学': {
    icon: '📐',
    colorClass: 'bg-blue-100 text-blue-700 border-blue-300',
    representationTypes: ['formula', 'image', 'step', 'template'],
  },
  '物理': {
    icon: '⚡',
    colorClass: 'bg-purple-100 text-purple-700 border-purple-300',
    representationTypes: ['concept', 'force', 'experiment', 'formula'],
  },
  '化学': {
    icon: '🧪',
    colorClass: 'bg-green-100 text-green-700 border-green-300',
    representationTypes: ['reaction', 'experiment', 'particle', 'classification'],
  },
  '历史': {
    icon: '📜',
    colorClass: 'bg-amber-100 text-amber-700 border-amber-300',
    representationTypes: ['timeline', 'causal', 'figure', 'event'],
  },
  '道法': {
    icon: '⚖️',
    colorClass: 'bg-red-100 text-red-700 border-red-300',
    representationTypes: ['keyword', 'viewpoint', 'template'],
  },
};

// ========== 知识点关系 ==========
export type RelationType =
  | 'contains'
  | 'prerequisite'
  | 'cause'
  | 'compare'
  | 'formula'
  | 'experiment'
  | 'mistake'
  | 'questionType'
  | 'schema_member';

export const RELATION_LABELS: Record<RelationType, string> = {
  contains: '包含',
  prerequisite: '前置',
  cause: '因果',
  compare: '对比',
  formula: '公式推导',
  experiment: '实验验证',
  mistake: '易错关联',
  questionType: '题型关联',
  schema_member: '图式成员',
};

export const RELATION_COLORS: Record<RelationType, string> = {
  contains: '#6366f1',
  prerequisite: '#f59e0b',
  cause: '#ef4444',
  compare: '#8b5cf6',
  formula: '#06b6d4',
  experiment: '#10b981',
  mistake: '#f97316',
  questionType: '#3b82f6',
  schema_member: '#d97706',
};

// ========== ICAP Level ==========
export type IcapLevel = 'Passive' | 'Active' | 'Constructive' | 'Interactive';

export const ICAP_LABELS: Record<IcapLevel, string> = {
  Passive: '被动学习',
  Active: '主动学习',
  Constructive: '构建学习',
  Interactive: '互动学习',
};

export const ICAP_DESCRIPTIONS: Record<IcapLevel, string> = {
  Passive: '阅读知识卡、看解释和图示',
  Active: '主动回忆定义、填空、判断',
  Constructive: '总结规律、画思维导图、归纳模板',
  Interactive: 'AI追问、变式题、错因分析',
};

// ========== 复习模式 ==========
export type ReviewMode = 'basic' | 'standard' | 'challenge';

export const REVIEW_MODE_CONFIG: Record<ReviewMode, {
  label: string;
  maxPerSession: number;
  description: string;
}> = {
  basic: { label: '基础模式', maxPerSession: 5, description: '每次5个知识点，侧重基础理解' },
  standard: { label: '标准模式', maxPerSession: 8, description: '每次8个知识点，包含各层次任务' },
  challenge: { label: '挑战模式', maxPerSession: 8, description: '侧重高难度和互动任务' },
};

// ========== 复习调度规则 ==========
export function getReviewInterval(masteryLevel: number): number {
  if (masteryLevel < 60) return 1;   // 次日
  if (masteryLevel < 80) return 3;   // 3天后
  if (masteryLevel < 90) return 7;   // 7天后
  return 14;                          // 14天后
}

// ========== 学科对比 ==========
export function isSTEMSubject(subject: SubjectName): boolean {
  return ['数学', '物理', '化学'].includes(subject);
}

export function isHumanitiesSubject(subject: SubjectName): boolean {
  return ['语文', '历史', '道法'].includes(subject);
}

// ========== API 类型 ==========
export interface KnowledgeDecomposeRequest {
  subject: SubjectName;
  grade: string;
  chapter: string;
  content: string;
}

export interface KnowledgeDecomposeResponse {
  nodes: KnowledgeNodeCreate[];
  edges: KnowledgeEdgeCreate[];
}

export interface KnowledgeNodeCreate {
  title: string;
  summary: string;
  keywords: string[];
  prerequisites: string[];
  commonMistakes: string[];
  typicalQuestions: string[];
  difficulty: number;
  cognitiveLoad: number;
  icapLevel: IcapLevel;
  representationType?: string;
}

export interface KnowledgeEdgeCreate {
  fromIndex: number;
  toIndex: number;
  relationType: RelationType;
  label?: string;
}

export interface MistakeAnalysisRequest {
  subject: SubjectName;
  questionText: string;
  wrongAnswer?: string;
  correctAnswer: string;
}

export interface MistakeAnalysisResponse {
  mistakeType: 'conceptual' | 'calculation' | 'careless' | 'application';
  analysis: string;
  relatedKnowledge: string[];
  suggestion: string;
}

export interface QuestionGenerateRequest {
  knowledgeNodeId: string;
  questionType: string;
  icapLevel: IcapLevel;
  count?: number;
}

export interface TTSRequest {
  text: string;
  contentType: 'card' | 'explanation' | 'summary' | 'question';
  contentRefId?: string;
}

export interface ImageGenerateRequest {
  prompt: string;
  imageType: 'knowledge' | 'experiment' | 'timeline' | 'force' | 'reaction' | 'portrait';
  contentRefId?: string;
}

export interface ReviewSessionRequest {
  subjectId?: string;
  mode: ReviewMode;
}

export interface ReviewSessionResponse {
  tasks: ReviewTaskItem[];
  sessionId: string;
}

export interface ReviewTaskItem {
  id: string;
  knowledgeNodeId: string;
  knowledgeTitle: string;
  taskType: IcapLevel;
  content: any;
}

// ========== Worked Example (认知负荷理论) ==========
export interface WorkedExampleReasoningStep {
  step: number;
  explanation: string;
}

export interface WorkedExample {
  problem: string;
  solution: string;
  reasoningSteps: WorkedExampleReasoningStep[];
  similarProblem: string;
  similarProblemSolution: string;
}

export interface WorkedExampleGenerateRequest {
  knowledgeNodeId: string;
  subject?: string;
  difficulty?: number;
}

export interface WorkedExampleGenerateResponse {
  success: boolean;
  workedExample?: WorkedExample;
  knowledgeCard?: {
    id: string;
    cardType: string;
    title: string;
    content: string;
  };
}
