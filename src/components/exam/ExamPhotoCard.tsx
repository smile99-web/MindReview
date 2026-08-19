'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authFetch } from '@/lib/auth';
import { getErrorMessage } from '@/lib/errors';
import { appendImageToFormData, normalizeImageForUpload } from '@/lib/image-normalize';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LatexText } from '@/components/ui/LatexText';

interface KnowledgePoint {
  title?: string;
  summary?: string;
  keywords?: string[];
  prerequisites?: string[];
  commonMistakes?: string[];
  typicalQuestions?: string[];
  difficulty?: number;
  cognitiveLoad?: number;
  icapLevel?: string;
}

interface PracticeQuestion {
  questionType?: string;
  stem?: string;
  options?: Array<{ label?: string; text?: string }>;
  answer?: string;
  explanation?: string;
  difficulty?: number;
  cognitiveLoad?: number;
}

interface ExamUpload {
  id: string;
  ocrText: string;
  subjectName: string | null;
  knowledgePoints?: { nodes?: KnowledgePoint[]; edges?: unknown[] };
  practiceQuestions?: PracticeQuestion[];
  createdAt: string;
}

type Phase = 'idle' | 'uploading' | 'analyzing' | 'practicing' | 'reviewing' | 'icap-creating';

/**
 * ExamPhotoCard — 首页 / dashboard 的"拍照讲题"模块。
 *
 * 工作流：
 *   1. 用户上传一张试卷/练习题图片
 *   2. 后端 OCR（vision LLM）→ 展示识别的题目文字
 *   3. 点"分析知识点" → 后端把题目拆成最小的知识点
 *   4. 点"出类似题训练" → 后端基于知识点生成 N 道练习题
 *   5. 用户在卡片内直接答题、得到正误反馈
 *
 * 设计为单个自包含的客户端组件：所有 state、fetch、UI 都在这里。
 * 复用现有的 LatexText（公式渲染）、Button、Card 视觉一致性。
 */
export function ExamPhotoCard() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [upload, setUpload] = useState<ExamUpload | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<ExamUpload[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [practiceAnswers, setPracticeAnswers] = useState<Record<number, string>>({});
  const [practiceSubmitted, setPracticeSubmitted] = useState(false);

  // Load history on mount
  useEffect(() => {
    void (async () => {
      try {
        const res = await authFetch('/api/exam/list');
        if (!res.ok) return;
        const data = (await res.json()) as { exams: ExamUpload[] };
        setHistory(data.exams || []);
      } catch {
        // silent — history is optional
      }
    })();
  }, []);

  // 卸载/更换时释放 blob URL：注释声称"revoked on unmount"但之前没有
  // 对应 effect，组件卸载会泄漏 ObjectURL（长期挂着占内存）
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFile = async (file: File) => {
    setError('');
    // local preview (revoked on unmount/new file)
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setPhase('uploading');
    try {
      const normalized = await normalizeImageForUpload(file);
      if (!normalized) {
        throw new Error('浏览器无法解码这张照片（可能是 HEIC 编码不受支持）。请先在 iPad 设置 → 相机 → 格式 中改为"兼容性最好"，或换成截图后上传。');
      }
      const fd = new FormData();
      try {
        appendImageToFormData(fd, 'image', normalized);
      } catch (appendErr: unknown) {
        console.error('[ExamPhotoCard] FormData append failed:', appendErr, { name: file.name, type: file.type, size: file.size });
        throw new Error('iOS WebKit 拒绝打包图片（formdata 阶段）。请换张图或重启 Safari 试一次。');
      }
      const res = await authFetch('/api/exam/upload', {
        method: 'POST',
        body: fd,
      });
      const data = (await res.json()) as ExamUpload & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || `上传失败 (${res.status})`);
      }
      setUpload(data);
      setPhase('idle');
    } catch (err: unknown) {
      setError(getErrorMessage(err, '上传失败，请重试'));
      setPhase('idle');
    }
  };

  const handleAnalyze = async () => {
    if (!upload) return;
    setError('');
    setPhase('analyzing');
    try {
      const res = await authFetch('/api/exam/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId: upload.id }),
      });
      const data = (await res.json()) as {
        knowledgePoints?: ExamUpload['knowledgePoints'];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `分析失败 (${res.status})`);
      }
      setUpload((prev) =>
        prev ? { ...prev, knowledgePoints: data.knowledgePoints } : prev,
      );
      setPhase('idle');
    } catch (err: unknown) {
      setError(getErrorMessage(err, '分析失败，请重试'));
      setPhase('idle');
    }
  };

  const handlePractice = async () => {
    if (!upload) return;
    setError('');
    setPhase('practicing');
    try {
      const res = await authFetch('/api/exam/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId: upload.id, count: 5 }),
      });
      const data = (await res.json()) as {
        questions?: PracticeQuestion[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `出题失败 (${res.status})`);
      }
      setUpload((prev) =>
        prev ? { ...prev, practiceQuestions: data.questions } : prev,
      );
      setPhase('reviewing');
      setPracticeSubmitted(false);
      setPracticeAnswers({});
    } catch (err: unknown) {
      setError(getErrorMessage(err, '出题失败，请重试'));
      setPhase('idle');
    }
  };

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setUpload(null);
    setError('');
    setPhase('idle');
    setPracticeAnswers({});
    setPracticeSubmitted(false);
  };

  // "ICAP 训练" 入口：调用 /api/exam/[id]/create-node 把当前
  // 试卷的 OCR 文字 + 拆解出的知识点固化为一个 KnowledgeNode，
  // 然后跳转到标准 cards 页面（IcapPipeline 通过 knowledgeNodeId
  // 渲染 4 阶段训练）。
  const handleStartIcap = async () => {
    if (!upload) return;
    setError('');
    setPhase('icap-creating');
    try {
      const res = await authFetch(`/api/exam/${upload.id}/create-node`, {
        method: 'POST',
      });
      const data = (await res.json()) as {
        nodeId?: string;
        error?: string;
      };
      if (!res.ok || !data.nodeId) {
        throw new Error(data.error || `启动 ICAP 训练失败 (${res.status})`);
      }
      router.push(`/cards/${data.nodeId}`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, '启动 ICAP 训练失败'));
      setPhase('idle');
    }
  };

  const handlePickHistory = (h: ExamUpload) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setUpload(h);
    setShowHistory(false);
    setError('');
    setPhase(h.practiceQuestions && h.practiceQuestions.length > 0 ? 'reviewing' : 'idle');
    setPracticeAnswers({});
    setPracticeSubmitted(false);
  };

  const knowledgePoints = upload?.knowledgePoints?.nodes || [];
  const practiceQuestions = upload?.practiceQuestions || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 tracking-tight text-[15px]">
            📷 拍照讲题
          </h3>
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="text-xs text-slate-500 hover:text-indigo-600 transition-colors"
            >
              {showHistory ? '收起历史' : `历史 (${history.length})`}
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-1">
          上传一张题目图片，AI 自动识别 → 拆解基础知识点 → 出类似题训练
        </p>
      </CardHeader>

      {showHistory && history.length > 0 && (
        <div className="mb-3 p-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50">
          {history.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => handlePickHistory(h)}
              className="w-full text-left p-2 rounded-md hover:bg-white transition-colors"
            >
              <div className="text-xs font-medium text-slate-800 truncate">
                {h.subjectName || '未识别学科'} ·{' '}
                {h.ocrText.slice(0, 40).replace(/\n/g, ' ')}
                {h.ocrText.length > 40 ? '...' : ''}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {new Date(h.createdAt).toLocaleString('zh-CN')}
              </div>
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-3 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}

      {!upload ? (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
            className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors"
          >
            <div className="text-3xl mb-2">📸</div>
            <p className="text-sm text-slate-700 font-medium">
              点击或拖拽上传题目照片
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              支持 JPG/PNG/WebP，最大 5MB
            </p>
          </div>
        </div>
      ) : (
        <div>
          {/* Photo preview + reset */}
          <div className="flex gap-3 mb-3">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="uploaded"
                className="w-20 h-20 object-cover rounded-lg border border-slate-200"
              />
            ) : (
              <div className="w-20 h-20 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-2xl text-slate-400">
                📄
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs text-slate-500 mb-1">
                识别学科：
                <span className="font-medium text-slate-700 ml-1">
                  {upload.subjectName || '未能识别'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="text-xs text-slate-500 hover:text-rose-500 transition-colors"
              >
                ↻ 重新上传
              </button>
            </div>
          </div>

          {/* OCR text */}
          <div className="mb-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              识别到的题目
            </div>
            <div className="text-sm text-slate-800 max-h-32 overflow-y-auto whitespace-pre-wrap">
              {upload.ocrText}
            </div>
          </div>

          {/* Step 2: analyze */}
          {knowledgePoints.length === 0 && (
            <div className="mb-3 flex justify-end">
              <Button
                size="sm"
                onClick={handleAnalyze}
                loading={phase === 'analyzing'}
                disabled={phase === 'analyzing'}
              >
                {phase === 'analyzing' ? '拆解中...' : '🔍 分析基础知识点'}
              </Button>
            </div>
          )}

          {/* Knowledge points */}
          {knowledgePoints.length > 0 && (
            <div className="mb-3">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                拆解出的基础知识点
                <span className="text-[10px] font-normal text-slate-400 normal-case tracking-normal">
                  ({knowledgePoints.length} 个)
                </span>
              </div>
              <div className="space-y-2">
                {knowledgePoints.map((kp, i) => (
                  <div
                    key={i}
                    className="p-3 bg-gradient-to-br from-indigo-50/60 to-white rounded-lg border border-indigo-100"
                  >
                    <div className="flex items-start gap-2 mb-1.5">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-bold shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800">
                          {kp.title}
                        </div>
                        {kp.summary && (
                          <div className="text-xs text-slate-600 mt-1">
                            <LatexText text={kp.summary} />
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {(kp.keywords || []).slice(0, 4).map((kw, j) => (
                            <span
                              key={j}
                              className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600"
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* ICAP 训练入口：把这道题变成一个 KnowledgeNode，
                  然后用项目标准的 4 阶段 ICAP pipeline (Passive →
                  Active → Constructive → Interactive) 进行训练。 */}
              <div className="mt-3 flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleStartIcap}
                  loading={phase === 'icap-creating'}
                  disabled={phase === 'icap-creating'}
                >
                  {phase === 'icap-creating' ? '准备中...' : '🧠 ICAP 训练'}
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: practice questions */}
          {knowledgePoints.length > 0 && practiceQuestions.length === 0 && (
            <div className="mb-3 flex justify-end">
              <Button
                size="sm"
                variant="primary"
                onClick={handlePractice}
                loading={phase === 'practicing'}
                disabled={phase === 'practicing'}
              >
                {phase === 'practicing' ? '出题中...' : '✨ 出类似题训练'}
              </Button>
            </div>
          )}

          {practiceQuestions.length > 0 && (
            <PracticeSession
              questions={practiceQuestions}
              answers={practiceAnswers}
              submitted={practiceSubmitted}
              onAnswer={(idx, val) =>
                setPracticeAnswers((prev) => ({ ...prev, [idx]: val }))
              }
              onSubmit={() => setPracticeSubmitted(true)}
              onMore={handlePractice}
            />
          )}

          <div className="mt-3 flex justify-end">
            <Link
              href={`/exam/${upload.id}`}
              className="text-[11px] text-slate-500 hover:text-indigo-600 transition-colors"
            >
              打开完整页面 →
            </Link>
          </div>
        </div>
      )}

      {phase === 'uploading' && (
        <div className="mt-3 text-center text-xs text-slate-500">
          上传并识别中...
        </div>
      )}
    </Card>
  );
}

/**
 * Practice session — 5 (max) multiple-choice questions, all rendered
 * at once. Click "提交" to grade them. Wrong answers show red
 * highlighting, correct answers green. Click "再来一组" to regenerate.
 */
function PracticeSession({
  questions,
  answers,
  submitted,
  onAnswer,
  onSubmit,
  onMore,
}: {
  questions: PracticeQuestion[];
  answers: Record<number, string>;
  submitted: boolean;
  onAnswer: (idx: number, val: string) => void;
  onSubmit: () => void;
  onMore: () => void;
}) {
  const allAnswered = questions.every((_, i) => !!answers[i]);
  // 只有选项正常的选择题参与红绿判分/计分（与 DocUploadCard 同口径）：
  // 文本作答的题措辞不同即误判，只展示参考答案对照
  const isGradableMC = (q: PracticeQuestion) => !!q.options && q.options.length > 0;
  const mcCount = questions.filter(isGradableMC).length;
  const correctCount = questions.filter(
    (q, i) => isGradableMC(q) && answers[i] && q.answer && answers[i] === q.answer,
  ).length;

  return (
    <div className="mb-3">
      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-2">
        类似题训练
        {submitted && mcCount > 0 && (
          <span
            className={`text-[10px] font-normal normal-case tracking-normal ${
              correctCount === mcCount
                ? 'text-emerald-600'
                : correctCount > 0
                  ? 'text-amber-600'
                  : 'text-rose-600'
            }`}
          >
            {correctCount}/{mcCount} 正确
          </span>
        )}
      </div>
      <div className="space-y-3">
        {questions.map((q, i) => {
          const userAns = answers[i];
          const gradable = isGradableMC(q);
          const correct = gradable && submitted && userAns === q.answer;
          const wrong = gradable && submitted && userAns && userAns !== q.answer;
          return (
            <div
              key={i}
              className={`p-3 rounded-lg border ${
                correct
                  ? 'bg-emerald-50 border-emerald-200'
                  : wrong
                    ? 'bg-rose-50 border-rose-200'
                    : 'bg-white border-slate-200'
              }`}
            >
              <div className="text-xs text-slate-500 mb-1.5">第 {i + 1} 题</div>
              <div className="text-sm font-medium text-slate-800 mb-2">
                <LatexText text={q.stem || ''} />
              </div>
              {q.options && q.options.length > 0 ? (
                <div className="space-y-1.5">
                  {q.options.map((opt, j) => {
                    const optVal = opt.label || opt.text || String(j);
                    const isUserChoice = userAns === optVal;
                    const isCorrectChoice = submitted && q.answer === optVal;
                    return (
                      <label
                        key={j}
                        className={`flex items-start gap-2 p-2 rounded-md cursor-pointer text-xs hover:bg-slate-50 ${
                          isUserChoice && !submitted
                            ? 'bg-indigo-50/40'
                            : isCorrectChoice
                              ? 'bg-emerald-100/50'
                              : ''
                        }`}
                      >
                        <input
                          type="radio"
                          name={`exam-q-${i}`}
                          value={optVal}
                          checked={isUserChoice}
                          disabled={submitted}
                          onChange={() => onAnswer(i, optVal)}
                          className="mt-0.5"
                        />
                        <span className="font-semibold text-slate-500">
                          {opt.label || String.fromCharCode(65 + j)}.
                        </span>
                        <span className="text-slate-700 flex-1">
                          <LatexText text={opt.text || ''} />
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <input
                  type="text"
                  value={userAns || ''}
                  disabled={submitted}
                  onChange={(e) => onAnswer(i, e.target.value)}
                  placeholder="输入你的答案..."
                  className="w-full px-2 py-1.5 rounded-md border border-slate-200 text-xs"
                />
              )}
              {submitted && q.explanation && (
                <div className="mt-2 text-[11px] text-slate-600 bg-white/60 rounded-md p-2">
                  <span className="font-semibold text-slate-700">解析：</span>
                  <LatexText text={q.explanation} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2 justify-end">
        {submitted ? (
          <Button size="sm" variant="ghost" onClick={onMore}>
            ↻ 再来一组
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={onSubmit}
            disabled={!allAnswered}
          >
            提交答案
          </Button>
        )}
      </div>
    </div>
  );
}
