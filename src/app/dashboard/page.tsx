'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { MasteryBar } from '@/components/ui/MasteryBar';

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalNodes: 0,
    reviewedToday: 0,
    pendingTasks: 0,
    totalMistakes: 0,
  });
  const [subjects, setSubjects] = useState<any[]>([]);
  const [recentNodes, setRecentNodes] = useState<any[]>([]);
  const [dueTasks, setDueTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [subjRes, nodesRes, reviewRes] = await Promise.all([
          fetch('/api/subjects'),
          fetch('/api/knowledge?limit=8'),
          fetch('/api/review?mode=standard'),
        ]);

        const subjectsData = await subjRes.json();
        const nodesData = await nodesRes.json();
        const reviewData = await reviewRes.json();

        setSubjects(subjectsData);
        setRecentNodes(nodesData.nodes || []);
        setDueTasks(reviewData.tasks || []);

        const mistakesRes = await fetch('/api/mistakes');
        const mistakesData = await mistakesRes.json();

        setStats({
          totalNodes: nodesData.total || 0,
          reviewedToday: (reviewData.tasks || []).filter((t: any) => t.completed).length,
          pendingTasks: (reviewData.tasks || []).filter((t: any) => !t.completed).length,
          totalMistakes: Array.isArray(mistakesData) ? mistakesData.length : 0,
        });
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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
