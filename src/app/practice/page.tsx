'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { MasteryBar } from '@/components/ui/MasteryBar';

export default function PracticePage() {
  const [nodes, setNodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [activeIcap, setActiveIcap] = useState('Active');

  useEffect(() => {
    fetch('/api/knowledge?limit=20')
      .then(res => res.json())
      .then(data => setNodes(data.nodes || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleGenerateQuestions = async (nodeId: string, icapLevel: string) => {
    setSelectedNode(nodeId);
    setActiveIcap(icapLevel);
    setGenerating(true);
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
  };

  const icapOptions = [
    { level: 'Passive', label: '被动', desc: '基础识记题', gradient: 'from-slate-400 to-slate-500' },
    { level: 'Active', label: '主动', desc: '填空判断选择', gradient: 'from-blue-400 to-blue-500' },
    { level: 'Constructive', label: '构建', desc: '综合简答题', gradient: 'from-emerald-400 to-emerald-500' },
    { level: 'Interactive', label: '互动', desc: '变式应用题', gradient: 'from-purple-400 to-purple-500' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-[28px] font-bold text-slate-800 tracking-tight mb-8">主动回忆练习</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 知识点选择 */}
        <div className="md:col-span-1">
          <Card>
            <h3 className="font-semibold text-slate-800 mb-4 text-[15px]">选择知识点</h3>
            <div className="space-y-1 max-h-[600px] overflow-y-auto">
              {nodes.map((node: any) => (
                <button
                  key={node.id}
                  onClick={() => handleGenerateQuestions(node.id, activeIcap)}
                  className={`w-full text-left p-3 rounded-xl transition-all duration-200 ${
                    selectedNode === node.id
                      ? 'bg-indigo-50/80 border border-indigo-200/60 shadow-sm'
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className="text-sm font-medium text-slate-800 truncate">{node.title}</div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant="info" size="sm">{node.subject?.name}</Badge>
                    <MasteryBar level={node.masteryLevel} showLabel={false} />
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* 练习区 */}
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
              {/* ICAP 切换 */}
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

              {questions.map((q: any, i: number) => (
                <Card key={i}>
                  <div className="flex items-start gap-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 font-semibold text-sm shrink-0 mt-0.5">
                      {i + 1}
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
                              <input type="radio" name={`pq-${i}`} className="text-indigo-600 w-4 h-4" />
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
              ))}

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
    </div>
  );
}
