'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { MasteryBar } from '@/components/ui/MasteryBar';
import LearnerProfileCard from '@/components/learner/LearnerProfileCard';
import { useUserId } from '@/components/auth/AuthProvider';
import type { ActionableStep } from '@/lib/learner-model';

export default function DashboardPage() {
  const router = useRouter();
  const userId = useUserId() || '';
  const [stats, setStats] = useState({
    totalNodes: 0,
    reviewedToday: 0,
    pendingTasks: 0,
    totalMistakes: 0,
    totalReviewCount: 0,
  });
  const [subjects, setSubjects] = useState<any[]>([]);
  const [recentNodes, setRecentNodes] = useState<any[]>([]);
  const [dueTasks, setDueTasks] = useState<any[]>([]);
  const [actionableSteps, setActionableSteps] = useState<ActionableStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [diagnosticRunning, setDiagnosticRunning] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<{
    score: number;
    level: string;
    strengths: string[];
    gaps: string[];
    recommendedStartingPoint: string;
  } | null>(null);
  const [showDiagnostic, setShowDiagnostic] = useState(false);

  useEffect(() => { document.title = '仪表盘 - 知图复习'; }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/dashboard');
        const data = await res.json();

        setSubjects(data.subjects || []);
        setRecentNodes(data.recentNodes || []);
        setDueTasks(data.dueTasks || []);

        setStats({
          totalNodes: data.stats?.totalNodes || 0,
          reviewedToday: data.stats?.reviewedToday || 0,
          pendingTasks: data.stats?.pendingTasks || 0,
          totalMistakes: data.stats?.totalMistakes || 0,
          totalReviewCount: data.stats?.totalReviewCount || 0,
        });
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Fetch actionable steps from learner profile
  useEffect(() => {
    async function loadSteps() {
      if (!userId) return;
      try {
        const res = await fetch(`/api/learner/profile?userId=${encodeURIComponent(userId)}`);
        if (!res.ok) return;
        const data = await res.json();
        setActionableSteps((data.actionableSteps as ActionableStep[]) || []);
      } catch {
        // silent — recommendations are optional
      } finally {
        setProfileLoaded(true);
      }
    }
    loadSteps();
  }, [userId]);

  // Auto-show diagnostic for new users with zero review history
  useEffect(() => {
    if (profileLoaded && stats.totalReviewCount === 0 && !diagnosticResult && !showDiagnostic) {
      setShowDiagnostic(true);
    }
  }, [profileLoaded, stats.totalReviewCount, diagnosticResult, showDiagnostic]);

  const handleRunDiagnostic = async () => {
    if (!userId || diagnosticRunning) return;
    setDiagnosticRunning(true);
    try {
      const firstSubject = subjects[0];
      const grade = '初一'; // 默认年级；实际应用中可从用户 profile 获取
      const res = await fetch('/api/learner/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          grade,
          subjectId: firstSubject?.id,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '诊断请求失败');
      }
      const data = await res.json();
      const diag = data.diagnostic;
      if (diag) {
        setDiagnosticResult({
          score: diag.score,
          level: diag.level,
          strengths: diag.strengths || [],
          gaps: diag.gaps || [],
          recommendedStartingPoint: diag.recommendedStartingPoint || '',
        });
      }
    } catch (err) {
      console.error('Onboarding diagnostic failed:', err);
    } finally {
      setDiagnosticRunning(false);
    }
  };

  const stepIcons: Record<ActionableStep['type'], string> = {
    review_weakness: '🔍',
    build_schema: '🧠',
    practice_icap: '✏️',
    start_path: '▶️',
    fix_mistakes: '🎯',
  };

  const stepTypeLabels: Record<ActionableStep['type'], string> = {
    review_weakness: '弱项复习',
    build_schema: '构建框架',
    practice_icap: 'ICAP练习',
    start_path: '学习路径',
    fix_mistakes: '错题纠错',
  };

  const statCards = [
    {
      label: '知识节点',
      value: stats.totalNodes,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      ),
      gradient: 'from-indigo-500 to-blue-500',
      bgGradient: 'from-indigo-50 to-blue-50',
      textColor: 'text-indigo-700',
    },
    {
      label: '待复习',
      value: stats.pendingTasks,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      ),
      gradient: 'from-amber-500 to-orange-500',
      bgGradient: 'from-amber-50 to-orange-50',
      textColor: 'text-amber-700',
    },
    {
      label: '错题数',
      value: stats.totalMistakes,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      ),
      gradient: 'from-red-500 to-rose-500',
      bgGradient: 'from-red-50 to-rose-50',
      textColor: 'text-red-700',
    },
    {
      label: '今日已复习',
      value: stats.reviewedToday,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      gradient: 'from-emerald-500 to-green-500',
      bgGradient: 'from-emerald-50 to-green-50',
      textColor: 'text-emerald-700',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-[28px] font-bold text-slate-800 tracking-tight">
          学习仪表盘
        </h1>
        <p className="text-slate-500 mt-1.5 text-[15px]">
          欢迎回来，今天也要加油哦
        </p>
      </div>

      {/* 新手诊断 — Onboarding Diagnostic */}
      {showDiagnostic && !diagnosticResult && (
        <div className="mb-8 p-6 rounded-2xl bg-gradient-to-br from-indigo-50/70 via-purple-50/50 to-blue-50/50 border border-indigo-200/60 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-2xl shadow-sm">
              🎯
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-slate-800">
                欢迎！快速评估你的基础水平（2分钟）
              </h2>
              <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
                通过10道快速诊断题，了解你的实际预备知识水平，
                帮你跳过已掌握的内容，精准定位学习起点。
              </p>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleRunDiagnostic}
                  disabled={diagnosticRunning || subjects.length === 0}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white text-sm font-semibold hover:from-indigo-600 hover:to-indigo-700 shadow-sm shadow-indigo-500/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {diagnosticRunning ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                      评估中...
                    </>
                  ) : (
                    <>
                      开始评估
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowDiagnostic(false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-white/80 transition-colors duration-200"
                >
                  跳过
                </button>
              </div>
              {subjects.length === 0 && (
                <p className="text-xs text-amber-600 mt-3">
                  需要先创建学科和数据才能运行诊断
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 诊断结果 */}
      {diagnosticResult && (
        <div className="mb-8 p-6 rounded-2xl bg-white border border-slate-200/70 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center text-2xl shadow-sm">
              {diagnosticResult.level === 'advanced' ? '🏆' : diagnosticResult.level === 'intermediate' ? '📊' : '🌱'}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-slate-800">诊断结果</h2>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-3xl font-bold text-indigo-600 tabular-nums">
                  {diagnosticResult.score}分
                </span>
                <span className={`text-sm font-semibold px-2.5 py-1 rounded-full ${
                  diagnosticResult.level === 'advanced'
                    ? 'bg-emerald-100 text-emerald-700'
                    : diagnosticResult.level === 'intermediate'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-amber-100 text-amber-700'
                }`}>
                  {diagnosticResult.level === 'advanced' ? '进阶水平' : diagnosticResult.level === 'intermediate' ? '中等水平' : '基础起步'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <p className="text-xs font-semibold text-emerald-600 mb-1.5">
                    优势领域 ({diagnosticResult.strengths.length})
                  </p>
                  <ul className="space-y-0.5">
                    {diagnosticResult.strengths.slice(0, 3).map((s, i) => (
                      <li key={i} className="text-xs text-slate-600 flex items-center gap-1">
                        <span className="text-emerald-500">✓</span> {s}
                      </li>
                    ))}
                    {diagnosticResult.strengths.length === 0 && (
                      <li className="text-xs text-slate-400">继续学习建立优势</li>
                    )}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold text-amber-600 mb-1.5">
                    待加强 ({diagnosticResult.gaps.length})
                  </p>
                  <ul className="space-y-0.5">
                    {diagnosticResult.gaps.slice(0, 3).map((g, i) => (
                      <li key={i} className="text-xs text-slate-600 flex items-center gap-1">
                        <span className="text-amber-500">!</span> {g}
                      </li>
                    ))}
                    {diagnosticResult.gaps.length === 0 && (
                      <li className="text-xs text-slate-400">基础扎实，继续保持</li>
                    )}
                  </ul>
                </div>
              </div>

              {diagnosticResult.recommendedStartingPoint && (
                <div className="mt-4 p-3 rounded-xl bg-indigo-50/60 border border-indigo-100/60">
                  <p className="text-xs text-indigo-500 font-medium">推荐起点</p>
                  <p className="text-sm font-semibold text-indigo-700 mt-0.5">
                    {diagnosticResult.recommendedStartingPoint}
                  </p>
                </div>
              )}

              <div className="flex gap-3 mt-4">
                {diagnosticResult.recommendedStartingPoint && (
                  <Link
                    href="/subjects"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white text-sm font-semibold hover:from-indigo-600 hover:to-indigo-700 shadow-sm shadow-indigo-500/20 transition-all duration-200"
                  >
                    开始学习
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </Link>
                )}
                <button
                  onClick={() => {
                    setShowDiagnostic(false);
                    setDiagnosticResult(null);
                  }}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors duration-200"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="relative overflow-hidden bg-white rounded-2xl border border-slate-200/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)]"
          >
            <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl ${stat.bgGradient} rounded-bl-[40px] opacity-60`} />
            <div className="relative">
              <div className={`inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br ${stat.gradient} text-white shadow-sm mb-3`}>
                {stat.icon}
              </div>
              <div className={`text-[28px] font-bold ${stat.textColor} tracking-tight tabular-nums`}>
                {stat.value}
              </div>
              <div className="text-[13px] text-slate-500 mt-0.5 font-medium">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 学习画像 */}
      <div className="mb-8">
        <LearnerProfileCard userId={userId} compact />
      </div>

      {/* 今日推荐 — actionable quick-action buttons */}
      {actionableSteps.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-slate-800 tracking-tight mb-4">
            今日推荐
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {actionableSteps.slice(0, 4).map((step) => (
              <button
                key={step.id}
                onClick={() => router.push(step.targetUrl)}
                className="group text-left p-4 rounded-2xl border border-slate-200/70 bg-white hover:border-indigo-200 hover:shadow-md hover:shadow-indigo-500/5 transition-all duration-200"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{stepIcons[step.type]}</span>
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
                    {stepTypeLabels[step.type]}
                  </span>
                </div>
                <div className="text-sm font-semibold text-slate-800 group-hover:text-indigo-700 transition-colors truncate">
                  {step.title}
                </div>
                <div className="text-xs text-slate-500 mt-1 line-clamp-2">
                  {step.description}
                </div>
                <div className="flex items-center gap-1 mt-2.5 text-xs font-medium text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  前往
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 学科概览 */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-slate-800 tracking-tight text-[15px]">学科概览</h3>
          </CardHeader>
          <div className="space-y-2">
            {subjects.map((subject: any) => (
              <Link
                key={subject.id}
                href={`/subjects/${subject.id}`}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors duration-200 group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{subject.icon || '📖'}</span>
                  <div>
                    <div className="font-medium text-sm text-slate-800">{subject.name}</div>
                    <div className="text-xs text-slate-400">
                      {subject._count?.chapters || 0} 章节 · {subject._count?.knowledgeNodes || 0} 知识点
                    </div>
                  </div>
                </div>
                <svg className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            ))}
            {subjects.length === 0 && !loading && (
              <div className="text-center py-6 text-slate-400">
                <p className="text-sm">还没有学科数据</p>
                <Link href="/subjects" className="text-indigo-500 text-sm font-medium hover:text-indigo-600 transition-colors">
                  前往学科页面创建 →
                </Link>
              </div>
            )}
          </div>
        </Card>

        {/* 最近知识点 */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-slate-800 tracking-tight text-[15px]">最近知识点</h3>
          </CardHeader>
          <div className="space-y-1">
            {recentNodes.slice(0, 5).map((node: any) => (
              <Link
                key={node.id}
                href={`/cards/${node.id}`}
                className="block p-2.5 rounded-xl hover:bg-slate-50 transition-colors duration-200"
              >
                <div className="text-sm font-medium text-slate-800 truncate">{node.title}</div>
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge variant="info" size="sm">{node.subject?.name}</Badge>
                  <MasteryBar level={node.masteryLevel} showLabel={false} />
                </div>
              </Link>
            ))}
            {recentNodes.length === 0 && (
              <p className="text-center py-6 text-sm text-slate-400">
                还没有知识点，去拆解教材内容吧
              </p>
            )}
          </div>
        </Card>

        {/* 待复习任务 */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-slate-800 tracking-tight text-[15px]">待复习</h3>
          </CardHeader>
          <div className="space-y-1">
            {dueTasks.filter((t: any) => !t.completed).slice(0, 5).map((task: any) => (
              <Link
                key={task.id}
                href="/review"
                className="block p-2.5 rounded-xl hover:bg-amber-50/50 transition-colors duration-200 border border-amber-100/80"
              >
                <div className="text-sm font-medium text-slate-800 truncate">
                  {task.knowledgeNode?.title}
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <MasteryBar level={task.knowledgeNode?.masteryLevel || 0} showLabel={false} />
                  <span className="text-[11px] text-amber-600 font-medium">
                    {task.dueDate ? `截止: ${new Date(task.dueDate).toLocaleDateString('zh-CN')}` : '今日复习'}
                  </span>
                </div>
              </Link>
            ))}
            {dueTasks.filter((t: any) => !t.completed).length === 0 && (
              <div className="text-center py-6">
                <p className="text-sm text-slate-400 mb-2">没有待复习的任务</p>
                <Link href="/review" className="text-indigo-500 text-sm font-medium hover:text-indigo-600 transition-colors">
                  开始新的复习 →
                </Link>
              </div>
            )}
          </div>
          {dueTasks.filter((t: any) => !t.completed).length > 0 && (
            <Link
              href="/review"
              className="flex items-center justify-center gap-1.5 mt-3 py-2.5 text-sm text-indigo-600 font-medium hover:bg-indigo-50/60 rounded-xl transition-colors duration-200"
            >
              开始复习
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          )}
        </Card>
      </div>
    </div>
  );
}
