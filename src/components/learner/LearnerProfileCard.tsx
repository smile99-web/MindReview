'use client';

import { authFetch } from '@/lib/auth';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { MasteryBar } from '@/components/ui/MasteryBar';
import { getErrorMessage } from '@/lib/errors';
import type { LearnerProfile, RecommendedSettings, ActionableStep } from '@/lib/learner-model';

interface LearnerProfileCardProps {
  userId: string;
  compact?: boolean;
}

interface LearnerProfileResponse {
  error?: string;
  profile?: LearnerProfile;
  recommendations?: RecommendedSettings;
  actionableSteps?: ActionableStep[];
}

// ── Action type icons ──────────────────────────────────────────────────────

const stepIcons: Record<ActionableStep['type'], string> = {
  review_weakness: '🔍',
  build_schema: '🧠',
  practice_icap: '✏️',
  start_path: '▶️',
  fix_mistakes: '🎯',
};

// ── Mini pie chart div-based component ──────────────────────────────────────

function MistakePie({ patterns }: { patterns: LearnerProfile['mistakePatterns'] }) {
  const total =
    patterns.conceptual + patterns.calculation + patterns.careless + patterns.application;
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-20">
        <span className="text-xs text-slate-400">暂无错误记录</span>
      </div>
    );
  }

  const segments = [
    { label: '概念', value: patterns.conceptual, color: 'bg-rose-400' },
    { label: '计算', value: patterns.calculation, color: 'bg-amber-400' },
    { label: '粗心', value: patterns.careless, color: 'bg-sky-400' },
    { label: '应用', value: patterns.application, color: 'bg-purple-400' },
  ].filter((s) => s.value > 0);

  let cumulative = 0;
  const gradientStops = segments.map((seg) => {
    const start = (cumulative / total) * 100;
    cumulative += seg.value;
    const end = (cumulative / total) * 100;
    return { ...seg, start, end };
  });

  const conicGradient = gradientStops
    .map((s) => `${s.color} ${s.start}% ${s.end}%`)
    .join(', ');

  return (
    <div className="flex items-center gap-3">
      <div
        className="w-20 h-20 rounded-full flex-shrink-0"
        style={{ background: `conic-gradient(${conicGradient})` }}
      />
      <div className="flex flex-col gap-1 text-xs">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${seg.color}`} />
            <span className="text-slate-500">{seg.label}</span>
            <span className="text-slate-700 font-medium tabular-nums">{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Velocity gauge ─────────────────────────────────────────────────────────

function VelocityGauge({ value }: { value: number }) {
  // Map velocity (per-session mastery gain) to a 0-100 scale
  const normalized = Math.min(100, Math.max(0, Math.round((value / 15) * 100)));
  const color =
    value >= 10
      ? 'from-emerald-400 to-green-500'
      : value >= 5
        ? 'from-amber-400 to-orange-500'
        : 'from-rose-400 to-red-500';

  return (
    <div className="flex items-center gap-3">
      <div className="w-20 h-20 relative flex-shrink-0">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="32" fill="none" stroke="#e2e8f0" strokeWidth="8" />
          <circle
            cx="40"
            cy="40"
            r="32"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            className="text-transparent"
            strokeDasharray={`${normalized * 2.01} ${201 - normalized * 2.01}`}
            style={{ transition: 'stroke-dasharray 1s ease-out' }}
          />
        </svg>
        <svg className="w-20 h-20 -rotate-90 absolute top-0 left-0" viewBox="0 0 80 80">
          <defs>
            <linearGradient id="velocityGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" className="stop1" stopColor={value >= 10 ? '#34d399' : value >= 5 ? '#fbbf24' : '#fb7185'} />
              <stop offset="100%" className="stop2" stopColor={value >= 10 ? '#10b981' : value >= 5 ? '#f97316' : '#e11d48'} />
            </linearGradient>
          </defs>
          <circle
            cx="40"
            cy="40"
            r="32"
            fill="none"
            stroke="url(#velocityGrad)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${normalized * 2.01} ${201 - normalized * 2.01}`}
            style={{ transition: 'stroke-dasharray 1s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className={`text-sm font-bold bg-gradient-to-r ${color} bg-clip-text text-transparent`}>
              {value.toFixed(1)}
            </div>
            <div className="text-[10px] text-slate-400">%/次</div>
          </div>
        </div>
      </div>
      <div className="text-xs text-slate-500">
        <p>每次复习平均</p>
        <p>掌握度提升</p>
        <p className="mt-0.5 text-slate-400">
          {value >= 10 ? '学习效率优秀' : value >= 5 ? '学习效率中等' : '待提升'}
        </p>
      </div>
    </div>
  );
}

// ── Main Card ──────────────────────────────────────────────────────────────

export default function LearnerProfileCard({ userId, compact = false }: LearnerProfileCardProps) {
  const router = useRouter();
  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendedSettings | null>(null);
  const [actionableSteps, setActionableSteps] = useState<ActionableStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/learner/profile?userId=${encodeURIComponent(userId)}`);
      if (!res.ok) {
        const data = await res.json() as LearnerProfileResponse;
        throw new Error(data.error || 'Failed to load profile');
      }
      const data = await res.json() as LearnerProfileResponse;
      setProfile(data.profile || null);
      setRecommendations(data.recommendations || null);
      setActionableSteps(data.actionableSteps || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, '加载失败'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadProfile();
    });
  }, [loadProfile]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-slate-800 tracking-tight text-[15px]">学习画像</h3>
        </CardHeader>
        <div className="space-y-3 animate-pulse">
          <div className="h-4 bg-slate-100 rounded-full w-3/4" />
          <div className="h-4 bg-slate-100 rounded-full w-1/2" />
          <div className="h-20 bg-slate-100 rounded-xl" />
        </div>
      </Card>
    );
  }

  if (error || !profile) {
    return (
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-slate-800 tracking-tight text-[15px]">学习画像</h3>
        </CardHeader>
        <div className="text-center py-6">
          <p className="text-sm text-slate-400">{error || '无法加载学习画像'}</p>
          <button
            onClick={loadProfile}
            className="mt-2 text-indigo-500 text-sm font-medium hover:text-indigo-600 transition-colors"
          >
            重试
          </button>
        </div>
      </Card>
    );
  }

  const { strengthAreas, weaknessAreas, learningVelocity, mistakePatterns, attentionProfile, knowledgeGraphStats, recommendedNextSteps } = profile;

  if (compact) {
    return (
      <Card padding="md">
        <CardHeader>
          <h3 className="font-semibold text-slate-800 tracking-tight text-[15px]">学习画像</h3>
          <button
            onClick={loadProfile}
            className="text-xs text-indigo-500 hover:text-indigo-600 font-medium transition-colors"
          >
            重新评估
          </button>
        </CardHeader>
        <div className="space-y-3">
          {/* Key metrics row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-2 rounded-xl bg-slate-50">
              <div className="text-lg font-bold text-slate-700 tabular-nums">
                {learningVelocity.toFixed(1)}
              </div>
              <div className="text-[10px] text-slate-400">%每复习期</div>
            </div>
            <div className="text-center p-2 rounded-xl bg-slate-50">
              <div className="text-lg font-bold text-slate-700 tabular-nums">
                {knowledgeGraphStats.averageMastery}%
              </div>
              <div className="text-[10px] text-slate-400">平均掌握度</div>
            </div>
            <div className="text-center p-2 rounded-xl bg-slate-50">
              <div className="text-lg font-bold text-slate-700 tabular-nums">{attentionProfile.avgSessionMinutes}</div>
              <div className="text-[10px] text-slate-400">分钟/次</div>
            </div>
          </div>

          {/* Dominant mistake pattern */}
          {Object.values(mistakePatterns).some((v) => v > 0) && (
            <div className="text-xs text-slate-500">
              主要错误类型：
              <span className="font-medium text-slate-700">
                {(() => {
                  const entries = Object.entries(mistakePatterns) as [keyof typeof mistakePatterns, number][];
                  const max = entries.reduce((a, b) => (a[1] > b[1] ? a : b));
                  const labels: Record<string, string> = { conceptual: '概念', calculation: '计算', careless: '粗心', application: '应用' };
                  return labels[max[0]] || max[0];
                })()}
              </span>
            </div>
          )}

          {/* Recommended mode */}
          {recommendations && (
            <div className="text-xs text-slate-500">
              推荐模式：<span className="font-medium text-indigo-600">{recommendations.suggestedMode === 'challenge' ? '挑战' : recommendations.suggestedMode === 'standard' ? '标准' : '基础'}</span>
              <span className="mx-1.5 text-slate-300">|</span>
              推荐题数：<span className="font-medium text-indigo-600">{recommendations.suggestedBatchSize}</span>
            </div>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card padding="lg">
      <CardHeader>
        <h3 className="font-semibold text-slate-800 tracking-tight text-[15px]">学习画像</h3>
        <button
          onClick={loadProfile}
          className="text-xs text-indigo-500 hover:text-indigo-600 font-medium transition-colors"
        >
          重新评估
        </button>
      </CardHeader>

      <div className="space-y-6">
        {/* Learning velocity */}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            学习速度
          </h4>
          <VelocityGauge value={learningVelocity} />
        </div>

        {/* Knowledge Graph Stats */}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            知识图谱概览
          </h4>
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center p-2.5 rounded-xl bg-indigo-50/50">
              <div className="text-lg font-bold text-indigo-700 tabular-nums">{knowledgeGraphStats.totalNodes}</div>
              <div className="text-[10px] text-indigo-500/70">总节点</div>
            </div>
            <div className="text-center p-2.5 rounded-xl bg-emerald-50/50">
              <div className="text-lg font-bold text-emerald-700 tabular-nums">{knowledgeGraphStats.masteredNodes}</div>
              <div className="text-[10px] text-emerald-500/70">已掌握</div>
            </div>
            <div className="text-center p-2.5 rounded-xl bg-amber-50/50">
              <div className="text-lg font-bold text-amber-700 tabular-nums">{knowledgeGraphStats.averageMastery}%</div>
              <div className="text-[10px] text-amber-500/70">平均掌握</div>
            </div>
            <div className="text-center p-2.5 rounded-xl bg-purple-50/50">
              <div className="text-lg font-bold text-purple-700 tabular-nums">{knowledgeGraphStats.schemaCount}</div>
              <div className="text-[10px] text-purple-500/70">关系数</div>
            </div>
          </div>
          <div className="mt-2">
            <MasteryBar level={knowledgeGraphStats.averageMastery} />
          </div>
        </div>

        {/* Strength / Weakness areas */}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            优势与弱项
          </h4>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {strengthAreas.length > 0 ? (
              strengthAreas.map((area) => (
                <Badge key={area} variant="success" size="md">{area}</Badge>
              ))
            ) : (
              <span className="text-xs text-slate-400">暂无优势学科</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {weaknessAreas.length > 0 ? (
              weaknessAreas.map((area) => (
                <Badge key={area} variant="danger" size="md">{area}</Badge>
              ))
            ) : (
              <span className="text-xs text-slate-400">暂无弱项学科</span>
            )}
          </div>
        </div>

        {/* Mistake patterns */}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            错误模式分析
          </h4>
          <MistakePie patterns={mistakePatterns} />
        </div>

        {/* Attention profile */}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            注意力分析
          </h4>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 rounded-lg bg-slate-50">
              <div className="text-slate-700 font-semibold">{attentionProfile.avgSessionMinutes}</div>
              <div className="text-slate-400">平均时长(分)</div>
            </div>
            <div className="p-2 rounded-lg bg-slate-50">
              <div className="text-slate-700 font-semibold">{attentionProfile.optimalSessionMinutes}</div>
              <div className="text-slate-400">建议时长(分)</div>
            </div>
            <div className="p-2 rounded-lg bg-slate-50">
              <div className="text-slate-700 font-semibold">{attentionProfile.breakFrequency}</div>
              <div className="text-slate-400">建议休息(次)</div>
            </div>
          </div>
        </div>

        {/* Recommended settings */}
        {recommendations && (
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              个性化推荐
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl border border-indigo-100 bg-indigo-50/30">
                <span className="text-slate-400">模式</span>
                <div className="font-semibold text-indigo-700 mt-0.5">
                  {recommendations.suggestedMode === 'challenge' ? '挑战模式' : recommendations.suggestedMode === 'standard' ? '标准模式' : '基础模式'}
                </div>
              </div>
              <div className="p-2.5 rounded-xl border border-indigo-100 bg-indigo-50/30">
                <span className="text-slate-400">题量</span>
                <div className="font-semibold text-indigo-700 mt-0.5">
                  {recommendations.suggestedBatchSize} 题/次
                </div>
              </div>
              <div className="p-2.5 rounded-xl border border-indigo-100 bg-indigo-50/30">
                <span className="text-slate-400">ICAP起点</span>
                <div className="font-semibold text-indigo-700 mt-0.5">{recommendations.suggestedIcapStart}</div>
              </div>
              <div className="p-2.5 rounded-xl border border-indigo-100 bg-indigo-50/30">
                <span className="text-slate-400">难度</span>
                <div className="font-semibold text-indigo-700 mt-0.5">{recommendations.suggestedDifficulty}/5</div>
              </div>
            </div>
          </div>
        )}

        {/* Actionable steps — clickable cards */}
        {actionableSteps.length > 0 ? (
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              学习建议
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {actionableSteps.map((step) => (
                <button
                  key={step.id}
                  onClick={() => router.push(step.targetUrl)}
                  className="group text-left p-3 rounded-xl border border-slate-200/80 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all duration-200"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-lg flex-shrink-0 mt-0.5">
                      {stepIcons[step.type]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 group-hover:text-indigo-700 transition-colors truncate">
                        {step.title}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                        {step.description}
                      </div>
                    </div>
                    <svg className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-400 flex-shrink-0 mt-1 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : recommendedNextSteps.length > 0 ? (
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              学习建议
            </h4>
            <ul className="space-y-1.5">
              {recommendedNextSteps.map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                  {step}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export type { LearnerProfile, RecommendedSettings, ActionableStep };
