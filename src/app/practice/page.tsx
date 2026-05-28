'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { MasteryBar } from '@/components/ui/MasteryBar';
import { IcapPipeline } from '@/components/practice/IcapPipeline';
import { DensityProvider, useDensity } from '@/components/ui/DensityProvider';
import type { ActionableStep } from '@/lib/learner-model';

export default function PracticePage() {
  return (
    <DensityProvider>
      <PracticeContent />
    </DensityProvider>
  );
}

function PracticeContent() {
  const router = useRouter();
  const [nodes, setNodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [activeIcap, setActiveIcap] = useState('Active');
  const [showPipeline, setShowPipeline] = useState(false);
  const [pipelineNodeId, setPipelineNodeId] = useState<string | null>(null);
  const [pipelineNodeTitle, setPipelineNodeTitle] = useState('');
  const [practiceSteps, setPracticeSteps] = useState<ActionableStep[]>([]);
  const [recommendedNodeId, setRecommendedNodeId] = useState<string | null>(null);

  const { densityLevel, infoChunkSize } = useDensity();

  // In sparse mode, show questions one at a time (paginated).
  const [questionPage, setQuestionPage] = useState(0);
  const questionsPerPage = densityLevel === 'sparse' ? 1 : infoChunkSize;

  const visibleQuestions = useMemo(() => {
    if (densityLevel === 'compact' || densityLevel === 'comfortable') return questions;
    // Sparse: paginate one at a time.
    const start = questionPage * questionsPerPage;
    return questions.slice(start, start + questionsPerPage);
  }, [questions, densityLevel, questionPage, questionsPerPage]);

  const totalQuestionPages = Math.ceil(questions.length / questionsPerPage);
  const hasMoreQuestions = questionPage < totalQuestionPages - 1;
  const hasPrevQuestions = questionPage > 0;

  // Reset page when questions change.
  useEffect(() => {
    setQuestionPage(0);
  }, [questions]);

  useEffect(() => {
    fetch('/api/knowledge?limit=20')
      .then(res => res.json())
      .then(data => setNodes(data.nodes || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Fetch learner profile for practice recommendations
  useEffect(() => {
    async function loadPracticeSteps() {
      try {
        const res = await fetch('/api/learner/profile?userId=default-user');
        if (!res.ok) return;
        const data = await res.json();
        const steps: ActionableStep[] = (data.actionableSteps as ActionableStep[]) || [];
        const icapSteps = steps.filter((s) => s.type === 'practice_icap');
        setPracticeSteps(icapSteps);
        if (icapSteps.length > 0) {
          setRecommendedNodeId(icapSteps[0].nodeId ?? null);
        }
      } catch {
        // silent
      }
    }
    loadPracticeSteps();
  }, []);

  const handleGenerateQuestions = useCallback(async (nodeId: string, icapLevel: string) => {
    setSelectedNode(nodeId);
    setActiveIcap(icapLevel);
    setGenerating(true);
    setQuestionPage(0);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-questions',
          knowledgeNodeId: nodeId,
          questionType: 'multiple_choice',
          icapLevel,
          count: 3,
        }),
      });
      const data = await res.json();
      setQuestions(data.questions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  }, []);

  // Auto-select recommended node when both nodes and recommendation are loaded
  useEffect(() => {
    if (!recommendedNodeId || nodes.length === 0 || selectedNode) return;
    const matched = nodes.find((n: any) => n.id === recommendedNodeId);
    if (matched) {
      const icapStep = practiceSteps.find((s) => s.nodeId === recommendedNodeId);
      const icapLevel = icapStep?.targetUrl?.match(/icapLevel=([^&]+)/)?.[1] || 'Active';
      handleGenerateQuestions(matched.id, icapLevel);
    }
  }, [recommendedNodeId, nodes, selectedNode, practiceSteps, handleGenerateQuestions]);

  const icapOptions = [
    { level: 'Passive', label: '被动', desc: '基础识记题', gradient: 'from-slate-400 to-slate-500' },
    { level: 'Active', label: '主动', desc: '填空判断选择', gradient: 'from-blue-400 to-blue-500' },
    { level: 'Constructive', label: '构建', desc: '综合简答题', gradient: 'from-emerald-400 to-emerald-500' },
    { level: 'Interactive', label: '互动', desc: '变式应用题', gradient: 'from-purple-400 to-purple-500' },
  ];

  const renderQuestion = (q: any, i: number) => (
    <Card key={`q-${questionPage}-${i}`}>
      <div className="flex items-start gap-3">
        <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 font-semibold text-sm shrink-0 mt-0.5">
          {questionPage * questionsPerPage + i + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-slate-800 font-medium mb-4">{q.stem}</p>

          {q.options && Array.isArray(q.options) && q.options.length > 0 && (
            <div className="space-y-2 mb-4">
              {q.options.map((opt: any, j: number) => (
                <label
                  key={j}
                  className="flex items-center gap-3 p-3 rounded-xl border border-slate-200/80 hover:bg-slate-50 hover:border-slate-300 cursor-pointer transition-colors duration-150"
                >
                  <input type="radio" name={`pq-${questionPage}-${i}`} className="text-indigo-600 w-4 h-4" />
                  <span className="text-xs font-semibold text-slate-400 w-5">{opt.label}.</span>
                  <span className="text-sm text-slate-700">{opt.text}</span>
                </label>
              ))}
            </div>
          )}

          <details className="group">
            <summary className="text-sm text-indigo-500 cursor-pointer hover:text-indigo-600 font-medium transition-colors">
              查看答案与解析
            </summary>
            <div className="mt-3 p-4 bg-gradient-to-br from-emerald-50/80 to-green-50/80 rounded-xl border border-emerald-100/60">
              <p className="text-sm font-semibold text-emerald-800">答案: {q.answer}</p>
              {q.explanation && (
                <p className="text-sm text-emerald-700/80 mt-1.5">解析: {q.explanation}</p>
              )}
            </div>
          </details>

          <div className="flex items-center gap-2 mt-3">
            <Badge variant="default" size="sm">
              {'★'.repeat(q.difficulty || 3)}
            </Badge>
            <Badge variant="purple" size="sm">{q.icapLevel}</Badge>
          </div>
        </div>
      </div>
    </Card>
  );

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-[28px] font-bold text-slate-800 tracking-tight mb-8">主动回忆练习</h1>

      {/* Practice recommendation bar */}
      {practiceSteps.length > 0 && (
        <div className="mb-6 text-[13px] text-indigo-700 bg-indigo-50/70 border border-indigo-200/60 rounded-xl px-4 py-3">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
            </svg>
            <div className="flex-1 min-w-0">
              <span className="font-medium">基于你的学习画像：</span>
              建议优先练习
              {practiceSteps.slice(0, 2).map((step, i) => (
                <span key={step.id}>
                  {i > 0 && '、'}
                  <button
                    onClick={() => {
                      const icaLevel = step.targetUrl?.match(/icapLevel=([^&]+)/)?.[1] || 'Active';
                      handleGenerateQuestions(step.nodeId!, icaLevel);
                    }}
                    className="font-medium text-indigo-600 underline underline-offset-2 hover:text-indigo-700 transition-colors"
                  >
                    {step.title.replace(/^练习 "/, '').replace(/"$/, '')}
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Knowledge node selector */}
        <div className="md:col-span-1">
          <Card>
            <h3 className="font-semibold text-slate-800 mb-4 text-[15px]">选择知识点</h3>
            <div className="space-y-1 max-h-[600px] overflow-y-auto">
              {nodes.map((node: any) => (
                <div key={node.id}>
                  <button
                    onClick={() => handleGenerateQuestions(node.id, activeIcap)}
                    className={`w-full text-left p-3 rounded-xl transition-all duration-200 ${
                      selectedNode === node.id
                        ? 'bg-indigo-50/80 border border-indigo-200/60 shadow-sm'
                        : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <div className="text-sm font-medium text-slate-800 truncate flex items-center gap-1.5">
                      {node.title}
                      {node.id === recommendedNodeId && (
                        <span className="text-[10px] font-medium text-indigo-500 bg-indigo-100/70 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          推荐
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="info" size="sm">{node.subject?.name}</Badge>
                      <MasteryBar level={node.masteryLevel} showLabel={false} />
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setPipelineNodeId(node.id);
                      setPipelineNodeTitle(node.title);
                      setShowPipeline(true);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-purple-500 hover:text-purple-600 hover:bg-purple-50/50 rounded-lg transition-colors mt-0.5"
                  >
                    完整ICAP训练 →
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Practice area */}
        <div className="md:col-span-2">
          {!selectedNode && (
            <Card>
              <div className="text-center py-14">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-100 text-2xl mb-4">
                  ✏️
                </div>
                <p className="text-slate-500 font-medium">请从左侧选择一个知识点开始练习</p>
                <p className="text-sm text-slate-400 mt-1.5">
                  选择不同的ICAP层级来获得不同难度的题目
                </p>

                <div className="mt-6 grid grid-cols-2 gap-2 max-w-xs mx-auto">
                  {icapOptions.map(opt => (
                    <div key={opt.level} className="text-left p-2.5 rounded-xl bg-slate-50">
                      <Badge variant="default" size="sm">{opt.label}</Badge>
                      <span className="block text-[11px] text-slate-400 mt-1">{opt.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {selectedNode && generating && (
            <Card>
              <div className="text-center py-14">
                <div className="animate-spin h-8 w-8 border-[3px] border-indigo-500/30 border-t-indigo-500 rounded-full mx-auto mb-4" />
                <p className="text-slate-500 font-medium">AI正在出题...</p>
              </div>
            </Card>
          )}

          {selectedNode && !generating && questions.length > 0 && (
            <div className="space-y-4">
              {/* ICAP toggle */}
              <div className="flex gap-2 flex-wrap">
                {icapOptions.map(opt => (
                  <Button
                    key={opt.level}
                    size="sm"
                    variant={activeIcap === opt.level ? 'primary' : 'secondary'}
                    onClick={() => handleGenerateQuestions(selectedNode, opt.level)}
                  >
                    {opt.label}题
                  </Button>
                ))}
              </div>

              {/* Questions — paginated in sparse mode, all in compact/comfortable */}
              {visibleQuestions.map((q: any, i: number) => renderQuestion(q, i))}

              {/* Pagination controls for sparse mode */}
              {densityLevel === 'sparse' && totalQuestionPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!hasPrevQuestions}
                    onClick={() => setQuestionPage(prev => prev - 1)}
                  >
                    上一题
                  </Button>
                  <span className="text-sm text-slate-400">
                    {questionPage + 1} / {totalQuestionPages}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!hasMoreQuestions}
                    onClick={() => setQuestionPage(prev => prev + 1)}
                  >
                    下一题
                  </Button>
                </div>
              )}

              <div className="flex justify-center gap-2 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    const text = questions.map((q: any) => q.stem).join('。');
                    await fetch('/api/tts', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ text, contentType: 'question' }),
                    });
                  }}
                >
                  朗读题目
                </Button>
              </div>
            </div>
          )}

          {selectedNode && !generating && questions.length === 0 && (
            <Card>
              <div className="text-center py-10 text-slate-400">
                <p>暂无题目，请点击上方ICAP按钮生成</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* ICAP Pipeline Modal */}
      {showPipeline && pipelineNodeId && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <IcapPipeline
              knowledgeNodeId={pipelineNodeId}
              knowledgeNodeTitle={pipelineNodeTitle}
              onComplete={() => setShowPipeline(false)}
              onClose={() => setShowPipeline(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
