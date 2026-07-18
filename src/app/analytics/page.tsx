'use client';

import { authFetch } from '@/lib/auth';
import { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieLabelRenderProps,
} from 'recharts';
import { getErrorMessage } from '@/lib/errors';

// --- Color palette ---
const COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899'];
const SUBJECT_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
const MISTAKE_COLORS: Record<string, string> = {
  conceptual: '#ef4444',
  calculation: '#f59e0b',
  careless: '#3b82f6',
  application: '#8b5cf6',
  unknown: '#94a3b8',
};
const ICAP_COLORS: Record<string, string> = {
  Passive: '#94a3b8',
  Active: '#3b82f6',
  Constructive: '#8b5cf6',
  Interactive: '#10b981',
};
const QUALITY_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#10b981'];

// --- Types ---
interface AnalyticsData {
  overview: {
    totalNodes: number;
    totalSubjects: number;
    totalMistakes: number;
    resolvedMistakes: number;
    totalReviewCount30d: number;
    totalReviewCount7d: number;
    totalStudyMinutes30d: number;
    avgMastery: number;
    avgEaseFactor: number;
    avgInterval: number;
    avgForgetRisk: number;
    nodesDueToday: number;
  };
  dailyActivity: { date: string; count: number; durationMinutes: number }[];
  subjectMastery: {
    id: string; name: string; icon: string | null; colorClass: string | null;
    averageMastery: number; nodeCount: number;
    lowMastery: number; mediumMastery: number; highMastery: number;
  }[];
  mistakeTypeBreakdown: { type: string; count: number; percentage: number }[];
  mistakeTrend: { date: string; count: number }[];
  icapDistribution: { level: string; count: number; percentage: number }[];
  qualityDistribution: { quality: number; label: string; count: number }[];
  easeBuckets: { low: number; normal: number; easy: number };
  weekConsistency: { day: string; label: string; count: number }[];
  difficultyDistribution: { level: number; count: number }[];
  taskTypeDistribution: { type: string; total: number; completed: number; completionRate: number }[];
  nodeGrowth: { date: string; count: number }[];
}

interface ChartTooltipEntry {
  name?: React.ReactNode;
  value?: React.ReactNode;
  color?: string;
  payload?: Record<string, unknown>;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: ChartTooltipEntry[];
  label?: React.ReactNode;
}

interface TooltipFormatterProps {
  payload?: Record<string, unknown>;
}

// --- Helper ---
const typeLabels: Record<string, string> = {
  conceptual: '概念错误',
  calculation: '计算错误',
  careless: '粗心',
  application: '应用错误',
  unknown: '未知',
};

const taskTypeLabels: Record<string, string> = {
  passive: '被动复习',
  active: '主动回忆',
  constructive: '建构练习',
  interactive: '交互学习',
};

function formatDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${m}/${d}`;
}

// --- Metric Card ---
function MetricCard({ label, value, subtitle, color }: {
  label: string; value: string | number; subtitle?: string; color: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-sm">
      <div className="text-[13px] text-slate-500 font-medium mb-1">{label}</div>
      <div className={`text-[28px] font-bold tracking-tight tabular-nums ${color}`}>
        {value}
      </div>
      {subtitle && (
        <div className="text-[12px] text-slate-400 mt-0.5">{subtitle}</div>
      )}
    </div>
  );
}

// --- Chart Panel ---
function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 p-6 shadow-sm">
      <h3 className="text-[15px] font-semibold text-slate-800 tracking-tight mb-4">{title}</h3>
      {children}
    </div>
  );
}

// --- Custom Tooltip ---
function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-lg p-3 text-sm">
      <p className="font-medium text-slate-700 mb-1">{label}</p>
      {payload.map((entry, idx) => (
        <p key={idx} className="text-slate-600" style={{ color: entry.color }}>
          {entry.name}: <span className="font-semibold">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

// --- Main Page ---
export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'subjects' | 'memory' | 'growth'>('overview');

  useEffect(() => { document.title = '学习分析 - 知图复习'; }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await authFetch('/api/analytics/overview');
        if (!res.ok) throw new Error('Failed to load analytics');
        const json = await res.json();
        setData(json);
      } catch (err: unknown) {
        setError(getErrorMessage(err) || '加载失败');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin h-8 w-8 border-3 border-indigo-200 border-t-indigo-500 rounded-full" />
          <p className="text-sm text-slate-500">加载学习数据...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12 text-center">
        <div className="text-4xl mb-4">📊</div>
        <h1 className="text-xl font-bold text-slate-700 mb-2">数据加载失败</h1>
        <p className="text-sm text-slate-500">{error || '暂无分析数据，开始学习后即可查看'}</p>
      </div>
    );
  }

  const { overview } = data;

  const tabs = [
    { key: 'overview' as const, label: '总览', icon: '📊' },
    { key: 'subjects' as const, label: '学科分析', icon: '📚' },
    { key: 'memory' as const, label: '记忆分析', icon: '🧠' },
    { key: 'growth' as const, label: '成长轨迹', icon: '📈' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[28px] font-bold text-slate-800 tracking-tight">
          学习数据看板
        </h1>
        <p className="text-slate-500 mt-1.5 text-[15px]">
          全面追踪你的学习数据，发现模式，优化策略
        </p>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-8">
        <MetricCard label="知识节点" value={overview.totalNodes} color="text-indigo-600" />
        <MetricCard
          label="30天复习"
          value={overview.totalReviewCount30d}
          subtitle={`近7天: ${overview.totalReviewCount7d}`}
          color="text-blue-600"
        />
        <MetricCard
          label="错题数"
          value={overview.totalMistakes}
          subtitle={`已解决: ${overview.resolvedMistakes}`}
          color="text-red-500"
        />
        <MetricCard
          label="平均掌握度"
          value={`${overview.avgMastery}%`}
          color="text-emerald-600"
        />
        <MetricCard
          label="学习时长"
          value={`${overview.totalStudyMinutes30d}min`}
          subtitle="近30天"
          color="text-violet-600"
        />
        <MetricCard
          label="遗忘风险"
          value={`${overview.avgForgetRisk}%`}
          subtitle="越低越好"
          color="text-amber-600"
        />
        <MetricCard
          label="今日待复习"
          value={overview.nodesDueToday}
          subtitle={`均隔 ${overview.avgInterval} 天`}
          color="text-rose-600"
        />
        <MetricCard
          label="记忆系数"
          value={overview.avgEaseFactor}
          subtitle={overview.avgEaseFactor < 2.2 ? '需加强' : overview.avgEaseFactor < 2.6 ? '正常' : '良好'}
          color={overview.avgEaseFactor < 2.2 ? 'text-red-500' : overview.avgEaseFactor < 2.6 ? 'text-amber-600' : 'text-emerald-600'}
        />
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 p-1 bg-slate-100/80 rounded-xl w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === tab.key
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* --- TAB: Overview --- */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Daily Activity Chart */}
          <ChartPanel title="📅 每日学习活动 (近30天)">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={data.dailyActivity}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorDuration" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="date" tickFormatter={formatDate}
                  tick={{ fontSize: 11, fill: '#94a3b8' }} interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  allowDecimals={false}
                  label={{ value: '复习次数', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#94a3b8' } }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: '#a855f7' }}
                  allowDecimals={false}
                  label={{ value: '学习时长(分钟)', angle: 90, position: 'insideRight', style: { fontSize: 11, fill: '#a855f7' } }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  yAxisId="left"
                  type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2}
                  fill="url(#colorCount)" name="复习次数"
                />
                <Area
                  yAxisId="right"
                  type="monotone" dataKey="durationMinutes" stroke="#a855f7" strokeWidth={2}
                  fill="url(#colorDuration)" name="学习时长(分钟)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartPanel>

          {/* Week Consistency + Mistake Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ChartPanel title="📅 本周复习一致性">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.weekConsistency}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} name="复习次数" />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel title="❌ 错题类型分布">
              {data.mistakeTypeBreakdown.length === 0 ? (
                <div className="flex items-center justify-center h-[240px] text-sm text-slate-400">
                  暂无错题数据，继续保持！
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={data.mistakeTypeBreakdown}
                      dataKey="count" nameKey="type"
                      cx="50%" cy="50%" outerRadius={90} innerRadius={45}
                      label={(props: PieLabelRenderProps) => {
                        const name = String(props.name ?? '');
                        const value = Number(props.value ?? 0);
                        const total = data.mistakeTypeBreakdown.reduce((s, m) => s + m.count, 0);
                        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                        return `${typeLabels[name] || name} ${pct}%`;
                      }}
                      labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                    >
                      {data.mistakeTypeBreakdown.map((entry, i) => (
                        <Cell key={i} fill={MISTAKE_COLORS[entry.type] || COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: unknown, name: unknown) => {
                        const n = String(name ?? '');
                        return [
                          `${value} 道 (${data.mistakeTypeBreakdown.find(m => m.type === n)?.percentage || 0}%)`,
                          typeLabels[n] || n,
                        ];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartPanel>
          </div>

          {/* ICAP Distribution */}
          <ChartPanel title="🎯 ICAP 学习层次分布">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.icapDistribution} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis
                  dataKey="level" type="category" width={90}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                />
                <Tooltip
                  formatter={(value: unknown, name: unknown, props: TooltipFormatterProps) => [
                    `${value} 个 (${Number(props.payload?.percentage ?? 0)}%)`,
                    String(props.payload?.level ?? name),
                  ]}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {data.icapDistribution.map((entry, i) => (
                    <Cell key={i} fill={ICAP_COLORS[entry.level] || COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-500">
              <span>🟣 Passive: 被动接收</span>
              <span>🔵 Active: 主动操作</span>
              <span>🟣 Constructive: 建构理解</span>
              <span>🟢 Interactive: 交互对话</span>
            </div>
          </ChartPanel>
        </div>
      )}

      {/* --- TAB: Subjects --- */}
      {activeTab === 'subjects' && (
        <div className="space-y-6">
          {/* Mastery by Subject Bar Chart */}
          <ChartPanel title="📚 各学科平均掌握度">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.subjectMastery}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }}
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  formatter={(value: unknown) => [`${value}%`, '平均掌握度']}
                />
                <Bar dataKey="averageMastery" radius={[6, 6, 0, 0]} name="平均掌握度">
                  {data.subjectMastery.map((_, i) => (
                    <Cell key={i} fill={SUBJECT_COLORS[i % SUBJECT_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          {/* Subject Detail Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.subjectMastery.map((subject, idx) => (
              <div key={subject.id} className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">{subject.icon || '📖'}</span>
                  <div>
                    <h4 className="font-semibold text-slate-800">{subject.name}</h4>
                    <p className="text-xs text-slate-400">{subject.nodeCount} 个知识点</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">掌握度</span>
                    <span
                      className="font-bold tabular-nums"
                      style={{ color: SUBJECT_COLORS[idx % SUBJECT_COLORS.length] }}
                    >
                      {subject.averageMastery}%
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-red-400 transition-all"
                      style={{ width: `${(subject.lowMastery / Math.max(subject.nodeCount, 1)) * 100}%` }}
                    />
                    <div
                      className="h-full bg-amber-400 transition-all"
                      style={{ width: `${(subject.mediumMastery / Math.max(subject.nodeCount, 1)) * 100}%` }}
                    />
                    <div
                      className="h-full bg-emerald-400 transition-all"
                      style={{ width: `${(subject.highMastery / Math.max(subject.nodeCount, 1)) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>薄弱 {subject.lowMastery}</span>
                    <span>中等 {subject.mediumMastery}</span>
                    <span>熟练 {subject.highMastery}</span>
                  </div>
                </div>
              </div>
            ))}
            {data.subjectMastery.length === 0 && (
              <div className="col-span-full text-center py-12 text-sm text-slate-400">
                尚无学科数据
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- TAB: Memory --- */}
      {activeTab === 'memory' && (
        <div className="space-y-6">
          {/* Quality Distribution */}
          <ChartPanel title="⭐ SM-2 回忆质量分布 (近30天)">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.qualityDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip formatter={(value: unknown, _: unknown, props: TooltipFormatterProps) => [
                  `${value} 次`,
                  String(props.payload?.label ?? ''),
                ]} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} name="回忆次数">
                  {data.qualityDistribution.map((entry, i) => (
                    <Cell key={i} fill={QUALITY_COLORS[i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          {/* Ease Factor + Memory Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ChartPanel title="📐 难度系数 (Ease Factor) 分布">
              <div className="space-y-4">
                {[
                  { label: '困难 (<2.0)', value: data.easeBuckets.low, color: 'bg-red-400', pct: Math.round(data.easeBuckets.low / Math.max(data.overview.totalNodes, 1) * 100) },
                  { label: '正常 (2.0-2.8)', value: data.easeBuckets.normal, color: 'bg-amber-400', pct: Math.round(data.easeBuckets.normal / Math.max(data.overview.totalNodes, 1) * 100) },
                  { label: '容易 (>2.8)', value: data.easeBuckets.easy, color: 'bg-emerald-400', pct: Math.round(data.easeBuckets.easy / Math.max(data.overview.totalNodes, 1) * 100) },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-600">{item.label}</span>
                      <span className="font-semibold text-slate-700">{item.value} 个 ({item.pct}%)</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full transition-all`} style={{ width: `${item.pct}%` }} />
                    </div>
                  </div>
                ))}
                <div className="pt-4 mt-4 border-t border-slate-100 grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-indigo-50 rounded-xl">
                    <div className="text-2xl font-bold text-indigo-600">{overview.avgEaseFactor}</div>
                    <div className="text-xs text-slate-500">平均难度系数</div>
                  </div>
                  <div className="text-center p-3 bg-violet-50 rounded-xl">
                    <div className="text-2xl font-bold text-violet-600">{overview.avgInterval}</div>
                    <div className="text-xs text-slate-500">平均复习间隔(天)</div>
                  </div>
                </div>
              </div>
            </ChartPanel>

            <ChartPanel title="⚠️ 遗忘风险概览">
              <div className="flex flex-col items-center justify-center h-[260px]">
                <div className="relative w-40 h-40">
                  <svg viewBox="0 0 36 36" className="w-full h-full">
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none" stroke="#f1f5f9" strokeWidth="3"
                    />
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke={overview.avgForgetRisk > 50 ? '#ef4444' : overview.avgForgetRisk > 30 ? '#f59e0b' : '#10b981'}
                      strokeWidth="3"
                      strokeDasharray={`${overview.avgForgetRisk}, 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-3xl font-bold ${
                      overview.avgForgetRisk > 50 ? 'text-red-500' :
                      overview.avgForgetRisk > 30 ? 'text-amber-500' : 'text-emerald-500'
                    }`}>
                      {overview.avgForgetRisk}%
                    </span>
                    <span className="text-xs text-slate-400">平均遗忘风险</span>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 w-full text-center text-xs">
                  <div>
                    <span className="text-red-500 font-semibold block">高风险</span>
                    <span className="text-slate-500">&gt;50%</span>
                  </div>
                  <div>
                    <span className="text-amber-500 font-semibold block">中风险</span>
                    <span className="text-slate-500">30-50%</span>
                  </div>
                  <div>
                    <span className="text-emerald-500 font-semibold block">低风险</span>
                    <span className="text-slate-500">&lt;30%</span>
                  </div>
                </div>
              </div>
            </ChartPanel>
          </div>
        </div>
      )}

      {/* --- TAB: Growth --- */}
      {activeTab === 'growth' && (
        <div className="space-y-6">
          {/* Knowledge Growth Over Time */}
          <ChartPanel title="🌱 知识点增长曲线 (累计, 近30天)">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={data.nodeGrowth}>
                <defs>
                  <linearGradient id="growthGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="date" tickFormatter={formatDate}
                  tick={{ fontSize: 11, fill: '#94a3b8' }} interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2}
                  fill="url(#growthGradient)" name="累计知识点"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartPanel>

          {/* Difficulty Distribution + Task Completion */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ChartPanel title="🎯 知识点难度分布">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.difficultyDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="level" tick={{ fontSize: 12, fill: '#64748b' }}
                    label={{ value: '难度等级 (1-5)', position: 'bottom', offset: -5, style: { fontSize: 11, fill: '#94a3b8' } }}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                  <Tooltip formatter={(value: unknown) => [`${value} 个`, '知识点']} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} name="知识点">
                    {data.difficultyDistribution.map((entry, i) => (
                      <Cell key={i} fill={
                        entry.level <= 2 ? '#10b981' : entry.level === 3 ? '#f59e0b' : entry.level === 4 ? '#f97316' : '#ef4444'
                      } />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel title="📋 任务类型完成率">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.taskTypeDistribution} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis
                    dataKey="type" type="category" width={80}
                    tickFormatter={(v: string) => taskTypeLabels[v] || v}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                  />
                  <Tooltip
                    formatter={(value: unknown, name: unknown): [React.ReactNode, string] => {
                      const n = String(name ?? '');
                      if (n === 'completionRate') return [`${value}%`, '完成率'];
                      return [String(value), n];
                    }}
                  />
                  <Legend />
                  <Bar dataKey="completionRate" fill="#6366f1" radius={[0, 6, 6, 0]} name="completionRate" />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>

          {/* Mistake Trend */}
          <ChartPanel title="🔍 每日错题趋势 (近7天)">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.mistakeTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone" dataKey="count" stroke="#ef4444" strokeWidth={2}
                  dot={{ fill: '#ef4444', r: 4 }} name="错题数"
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>
        </div>
      )}
    </div>
  );
}
