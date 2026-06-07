'use client';

import { authFetch } from '@/lib/auth';
import { getErrorMessage } from '@/lib/errors';
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface MentalModelExerciseProps {
  knowledgeNodeId: string;
  knowledgeNodeTitle: string;
  onComplete?: () => void;
  onClose?: () => void;
}

interface CompletenessResult {
  completeness: number;
  missingElements: string[];
  suggestions: string;
}

interface NodeDetail {
  title: string;
  summary?: string | null;
  keywords?: string[];
  difficulty?: number;
  representationType?: string | null;
}

const MAX_ATTEMPTS = 3;

export function MentalModelExercise({
  knowledgeNodeId,
  knowledgeNodeTitle,
  onComplete,
  onClose,
}: MentalModelExerciseProps) {
  const [studentText, setStudentText] = useState('');
  const [loading, setLoading] = useState(false);
  const [nodeLoading, setNodeLoading] = useState(true);
  const [node, setNode] = useState<NodeDetail | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);
  const [result, setResult] = useState<CompletenessResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    authFetch(`/api/knowledge/${knowledgeNodeId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setNode({ title: knowledgeNodeTitle });
        } else {
          setNode(data);
        }
      })
      .catch(() => setNode({ title: knowledgeNodeTitle }))
      .finally(() => setNodeLoading(false));
  }, [knowledgeNodeId, knowledgeNodeTitle]);

  const handleCheck = async () => {
    if (!studentText.trim()) {
      setError('请输入你的描述');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await authFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'check-mental-model',
          knowledgeNodeId,
          studentText: studentText.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '检查失败');
      }

      setResult({
        completeness: data.completeness ?? 0,
        missingElements: data.missingElements ?? [],
        suggestions: data.suggestions ?? '',
      });
      setAttemptCount((prev) => prev + 1);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRevise = () => {
    setResult(null);
    setError('');
  };

  const handleComplete = () => {
    onComplete?.();
  };

  const attemptsLeft = MAX_ATTEMPTS - attemptCount;
  const reachedMax = attemptsLeft <= 0;
  const isHighScore = result && result.completeness >= 80;

  // ── Completeness badge color ──
  const getCompletenessColor = (score: number) => {
    if (score >= 80) return 'from-emerald-500 to-green-500 shadow-emerald-500/25';
    if (score >= 60) return 'from-amber-500 to-orange-500 shadow-amber-500/25';
    if (score >= 40) return 'from-orange-500 to-red-500 shadow-orange-500/25';
    return 'from-red-500 to-rose-500 shadow-red-500/25';
  };

  // ── Loading state for node detail ──
  if (nodeLoading) {
    return (
      <Card>
        <div className="space-y-4 animate-pulse">
          <div className="h-6 w-48 bg-slate-200 rounded" />
          <div className="h-4 w-72 bg-slate-100 rounded" />
          <div className="h-32 bg-slate-100 rounded-xl" />
          <div className="h-10 w-36 bg-slate-200 rounded-xl" />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="space-y-5">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shadow-sm shadow-indigo-500/20">
              🧠
            </div>
            <h3 className="font-semibold text-slate-800 text-[15px]">
              心智模型构建
            </h3>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            知识点: <span className="font-medium text-indigo-600">{node?.title || knowledgeNodeTitle}</span>
          </p>
        </div>

        {/* Knowledge context banner */}
        {node?.summary && (
          <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl p-4 border border-indigo-100/60">
            <p className="text-xs text-indigo-500 font-medium mb-1">知识点参考</p>
            <p className="text-sm text-slate-700 leading-relaxed">{node.summary}</p>
            {node.keywords && node.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {node.keywords.map((kw, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-white/70 text-indigo-500 text-xs rounded-full font-medium"
                  >
                    #{kw}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Prompt */}
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-100/60">
          <p className="text-sm text-amber-800 font-medium">
            用你自己的话描述这个知识点的运作机制
          </p>
          <p className="text-xs text-amber-600/80 mt-1">
            不只是复述定义，试着描述知识点内部各要素之间的关系、因果关系、以及它在解题中如何被使用。这将帮助你建立深层心智模型。
          </p>
        </div>

        {/* Textarea */}
        {!result ? (
          <>
            <textarea
              value={studentText}
              onChange={(e) => {
                setStudentText(e.target.value);
                if (error) setError('');
              }}
              placeholder="试着描述这个知识点的机制，例如：'这个公式之所以成立，是因为...，它在以下场景中适用...，使用时的关键步骤是...'"
              rows={8}
              className="w-full rounded-xl border border-slate-200/80 px-4 py-3 text-sm resize-y bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors placeholder:text-slate-300"
            />

            {error && (
              <div className="bg-red-50/80 border border-red-200/60 rounded-xl px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>剩余检查次数:</span>
                {[1, 2, 3].map((n) => (
                  <span
                    key={n}
                    className={`w-2 h-2 rounded-full ${
                      n <= attemptsLeft ? 'bg-indigo-400' : 'bg-slate-200'
                    }`}
                  />
                ))}
                <span className={attemptsLeft <= 1 ? 'text-amber-500 font-medium' : ''}>
                  ({attemptsLeft}/{MAX_ATTEMPTS})
                </span>
              </div>
              <Button
                onClick={handleCheck}
                loading={loading}
                disabled={!studentText.trim() || reachedMax}
              >
                AI 检查完整性
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Submitted text */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/60">
              <p className="text-xs text-slate-400 mb-1">你的描述</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                {studentText}
              </p>
            </div>

            {/* Completeness score */}
            <div className="flex items-center gap-4">
              <div
                className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br ${getCompletenessColor(result.completeness)} text-white shadow-lg`}
              >
                <span className="text-xl font-bold">{result.completeness}%</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {result.completeness >= 80
                    ? '理解很全面！'
                    : result.completeness >= 60
                    ? '基本理解，有提升空间'
                    : result.completeness >= 40
                    ? '理解还不够深入'
                    : '需要重新梳理'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  第 {attemptCount}/{MAX_ATTEMPTS} 次检查
                </p>
              </div>
            </div>

            {/* Missing elements */}
            {result.missingElements.length > 0 && (
              <div className="bg-red-50/60 rounded-xl p-4 border border-red-100/60">
                <p className="text-sm font-medium text-red-700 mb-2">
                  缺失要素 ({result.missingElements.length})
                </p>
                <ul className="space-y-1.5">
                  {result.missingElements.map((el, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-red-600">
                      <span className="text-red-400 mt-0.5 shrink-0">✗</span>
                      <span>{el}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Suggestions */}
            {result.suggestions && (
              <div className="bg-gradient-to-br from-indigo-50/80 to-blue-50/80 rounded-xl p-4 border border-indigo-100/60">
                <p className="text-xs text-indigo-500 font-medium mb-1.5">改进建议</p>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {result.suggestions}
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {!reachedMax && !isHighScore && (
                  <Button variant="secondary" onClick={handleRevise}>
                    修改并重新提交
                  </Button>
                )}
                {reachedMax && !isHighScore && (
                  <span className="text-xs text-slate-400 self-center">
                    已达到最大检查次数
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {onClose && (
                  <Button variant="ghost" onClick={onClose}>
                    关闭
                  </Button>
                )}
                <Button onClick={handleComplete}>
                  {isHighScore ? '完成，查看结果' : '继续'}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            ✕
          </button>
        )}
      </div>
    </Card>
  );
}
