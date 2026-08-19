"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LatexText } from "@/components/ui/LatexText";
import { MasteryBar } from "@/components/ui/MasteryBar";
import { getQualityColor, getHintLevel, adjustQualityForHint } from "@/lib/sm2";
import type { HintLevel } from "@/lib/sm2";

type ReviewTrigger =
  | "new_node"
  | "due_now"
  | "high_forget_risk"
  | "low_mastery"
  | "icap_passive"
  | "icap_active"
  | "icap_constructive"
  | "icap_interactive";

interface ReviewCompletionResult {
  success?: boolean;
  state?: {
    repetitions?: number;
    easeFactor?: number;
    intervalDays?: number;
    nextReviewAt?: string | Date | null;
    lastReviewAt?: string | Date | null;
    forgetRisk?: number;
    masteryLevel?: number;
  };
}

interface ReviewTaskCardProps {
  task: {
    id: string;
    knowledgeNodeId: string;
    taskType: string;
    knowledgeNode: {
      id: string;
      title: string;
      summary: string;
      difficulty: number;
      icapLevel: string;
      masteryLevel: number;
      repetitions?: number;
      easeFactor?: number;
      intervalDays?: number;
      lastReviewAt?: string | null;
      nextReviewAt?: string | null;
      forgetRisk?: number;
    };
    completed?: boolean;
    score?: number;
    reviewReason?: {
      label: string;
      detail: string;
      riskPercent: number;
      dueInDays: number | null;
      triggers: string[];
      taskType: string;
    };
  };
  onComplete?: (
    taskId: string,
    quality: number,
    knowledgeNodeId: string
  ) => Promise<ReviewCompletionResult | void> | ReviewCompletionResult | void;
}

const QUALITY_OPTIONS = [
  { value: 0, label: "完全忘记", description: "需要重新学习" },
  { value: 1, label: "很不熟悉", description: "看答案仍吃力" },
  { value: 2, label: "看到才想起", description: "需要尽快练习" },
  { value: 3, label: "有困难但正确", description: "可以短间隔复习" },
  { value: 4, label: "基本掌握", description: "按计划推进" },
  { value: 5, label: "完全掌握", description: "可以拉长间隔" },
];

const ICAP_LABELS_CN: Record<string, string> = {
  passive: "被动复习",
  active: "主动回忆",
  constructive: "建构练习",
  interactive: "互动迁移",
  Passive: "被动复习",
  Active: "主动回忆",
  Constructive: "建构练习",
  Interactive: "互动迁移",
};

const HINT_LABELS_CN: Record<HintLevel, string> = {
  1: "完整引导",
  2: "部分提示",
  3: "最小提示",
};

const HINT_DESCRIPTIONS_CN: Record<HintLevel, string> = {
  1: "显示完整解释和结构，适合首次回忆",
  2: "只给关键概念，帮助你自己补全",
  3: "只给方向，不打断独立回忆",
};

const REVIEW_TRIGGER_LABELS: Record<ReviewTrigger, { label: string; variant: BadgeVariant }> = {
  new_node: { label: "首次回忆", variant: "info" },
  due_now: { label: "今日到期", variant: "warning" },
  high_forget_risk: { label: "遗忘风险高", variant: "danger" },
  low_mastery: { label: "掌握度低", variant: "warning" },
  icap_passive: { label: "被动复习", variant: "default" },
  icap_active: { label: "主动回忆", variant: "info" },
  icap_constructive: { label: "建构练习", variant: "purple" },
  icap_interactive: { label: "互动迁移", variant: "purple" },
};

function formatDate(value?: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

function normalizeTriggers(triggers: string[] = []) {
  return triggers
    .filter((trigger): trigger is ReviewTrigger => trigger in REVIEW_TRIGGER_LABELS)
    .map((trigger) => REVIEW_TRIGGER_LABELS[trigger]);
}

export function ReviewTaskCard({ task, onComplete }: ReviewTaskCardProps) {
  const [showQuality, setShowQuality] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(task.completed || false);
  const [selectedQuality, setSelectedQuality] = useState<number | null>(null);
  // 用户实际点击的评分（用于按钮高亮）；selectedQuality 是提示扣减后的提交值
  const [clickedQuality, setClickedQuality] = useState<number | null>(null);
  const [lastAttemptQuality, setLastAttemptQuality] = useState<number | null>(null);
  const [hintUsed, setHintUsed] = useState(false);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [completionResult, setCompletionResult] = useState<ReviewCompletionResult | null>(null);

  const node = task.knowledgeNode;
  const reps = completionResult?.state?.repetitions ?? node.repetitions ?? 0;
  const mastery = completionResult?.state?.masteryLevel ?? node.masteryLevel ?? 0;
  const nextReviewAt = completionResult?.state?.nextReviewAt ?? node.nextReviewAt;
  const forgetRisk = completionResult?.state?.forgetRisk ?? node.forgetRisk;
  const hintLevel: HintLevel = getHintLevel(reps, mastery);
  const icapLabel = ICAP_LABELS_CN[task.taskType] || ICAP_LABELS_CN[node.icapLevel] || task.taskType;
  const triggerLabels = useMemo(
    () => normalizeTriggers(task.reviewReason?.triggers),
    [task.reviewReason?.triggers],
  );
  const finalQuality = selectedQuality ?? (typeof task.score === "number" ? Math.round(task.score / 20) : null);
  const isLowQuality = finalQuality !== null && finalQuality < 3;
  const formattedNextReview = formatDate(nextReviewAt);
  const practiceHref = `/practice?nodeId=${encodeURIComponent(node.id)}&icapLevel=Active`;
  const icapHref = `/practice?nodeId=${encodeURIComponent(node.id)}&icapLevel=Constructive&pipeline=1`;

  const handleSubmitQuality = async (q: number) => {
    const adjustedQuality = hintUsed ? adjustQualityForHint(q, hintLevel) : q;
    // 高亮必须标用户点的那颗按钮（q），不是扣减后的值（adjustedQuality）
    // ——提交值正确但视觉反馈错位会让用户以为点错了按钮
    setClickedQuality(q);
    setSelectedQuality(adjustedQuality);
    setLastAttemptQuality(adjustedQuality);
    setSubmitting(true);
    setSubmitError(null);

    try {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const result = await onComplete?.(task.id, adjustedQuality, node.id);
      setCompletionResult(result || null);
      setCompleted(true);
    } catch (error) {
      console.error(error);
      setSubmitError("保存失败，请检查网络后重试。");
      setSubmitting(false);
    }
  };

  if (completed) {
    return (
      <Card className="border-emerald-100 bg-emerald-50/40">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Badge variant="success">已完成</Badge>
          {finalQuality !== null && (
            <Badge variant={isLowQuality ? "warning" : "info"}>质量 {finalQuality}/5</Badge>
          )}
          {formattedNextReview && (
            <span className="text-xs text-slate-500">预计下次复习：{formattedNextReview}</span>
          )}
        </div>
        <h4 className="font-medium text-slate-800">{node.title}</h4>
        {isLowQuality && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-3">
            <p className="text-sm font-medium text-amber-800">这次回忆不稳，建议马上补一组练习。</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={practiceHref}>
                <Button size="sm" variant="secondary">去 Practice 练习</Button>
              </Link>
              <Link href={icapHref}>
                <Button size="sm">做 ICAP 训练</Button>
              </Link>
            </div>
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card className="animate-fade-in">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <Badge variant="purple">{icapLabel}</Badge>
            <span className="text-xs text-slate-400">难度：{"★".repeat(Math.max(1, node.difficulty))}</span>
            {reps > 0 && <span className="text-xs text-slate-400">第 {reps + 1} 次复习</span>}
          </div>
          <h4 className="font-semibold text-slate-800">{node.title}</h4>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {forgetRisk !== undefined && (
            <div className="text-right">
              <div className="text-[11px] text-slate-400">遗忘风险</div>
              <div
                className={`text-sm font-semibold tabular-nums ${
                  forgetRisk > 0.3
                    ? "text-red-500"
                    : forgetRisk > 0.15
                      ? "text-amber-500"
                      : "text-emerald-500"
                }`}
              >
                {(forgetRisk * 100).toFixed(0)}%
              </div>
            </div>
          )}
          {node.easeFactor !== undefined && (
            <div className="text-right">
              <div className="text-[11px] text-slate-400">EF</div>
              <div className="text-sm font-semibold text-slate-600 tabular-nums">
                {node.easeFactor.toFixed(1)}
              </div>
            </div>
          )}
        </div>
      </div>

      <LatexText
        text={node.summary || ""}
        className="text-sm text-slate-600 mb-4 leading-relaxed"
      />

      {task.reviewReason && (
        <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-indigo-700">为什么今天复习</p>
            <span className="text-[11px] font-medium text-indigo-600 bg-white/80 rounded-full px-2 py-0.5">
              遗忘风险 {task.reviewReason.riskPercent}%
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {triggerLabels.length > 0 ? (
              triggerLabels.map((trigger) => (
                <Badge key={trigger.label} variant={trigger.variant}>{trigger.label}</Badge>
              ))
            ) : (
              <Badge variant="default">按计划复习</Badge>
            )}
          </div>
          <p className="text-sm text-slate-700 mt-2">{task.reviewReason.label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{task.reviewReason.detail}</p>
        </div>
      )}

      <MasteryBar level={mastery} />

      <div className="flex flex-wrap gap-3 mt-3 mb-1 text-xs text-slate-400">
        {formattedNextReview && <span>当前计划：{formattedNextReview}</span>}
        {(node.intervalDays ?? 0) > 0 && <span>间隔：{node.intervalDays} 天</span>}
      </div>

      <div className="mt-3">
        {!hintRevealed ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setHintRevealed(true);
                setHintUsed(true);
              }}
            >
              显示提示
            </Button>
            <span className="text-[11px] text-slate-400">
              {HINT_LABELS_CN[hintLevel]}：{HINT_DESCRIPTIONS_CN[hintLevel]}
            </span>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/60">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[11px] font-semibold text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded">
                {HINT_LABELS_CN[hintLevel]}
              </span>
              <span className="text-[11px] text-amber-700/70">使用提示会在评分时适当扣减</span>
            </div>
            <div className="text-sm text-amber-900 mt-1">
              {hintLevel === 1 && (
                <>
                  <p className="font-medium">完整引导：</p>
                  <LatexText text={`${node.title}：${node.summary || ""}`} className="mt-0.5 text-amber-800/80" />
                </>
              )}
              {hintLevel === 2 && (
                <>
                  <p className="font-medium">关键概念：</p>
                  <p className="mt-0.5 text-amber-800/80">{node.title}</p>
                </>
              )}
              {hintLevel === 3 && (
                <>
                  <p className="font-medium">回忆方向：</p>
                  <p className="mt-0.5 text-amber-800/80">先说出它属于哪个领域，再回忆相关公式、步骤或典型错误。</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {!showQuality ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {task.taskType === "passive" && (
            <Button size="sm" onClick={() => handleSubmitQuality(3)} loading={submitting}>
              我已阅读
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowQuality(true)}
          >
            评分复习质量
          </Button>
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-sm font-medium text-slate-700 mb-3">回忆质量评分</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {QUALITY_OPTIONS.map((opt) => {
              const isSelected = clickedQuality === opt.value;
              return (
                <button
                  key={opt.value}
                  disabled={submitting}
                  onClick={() => handleSubmitQuality(opt.value)}
                  className={`flex min-h-[82px] flex-col items-start gap-1 p-2.5 rounded-xl border text-left transition-all duration-200 ${
                    isSelected
                      ? "border-indigo-300 bg-indigo-50 shadow-sm"
                      : "border-slate-200/80 hover:border-slate-300 hover:bg-slate-50"
                  } disabled:opacity-50`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                      getQualityColor(opt.value)
                    }`}
                  >
                    {opt.value}
                  </span>
                  <span className="text-xs font-medium text-slate-700">{opt.label}</span>
                  <span className="text-[11px] text-slate-400">{opt.description}</span>
                </button>
              );
            })}
          </div>

          {submitting && (
            <div className="flex items-center justify-center gap-2 mt-3 text-sm text-indigo-500">
              <div className="animate-spin h-4 w-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full" />
              正在保存...
            </div>
          )}

          {submitError && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2">
              <p className="text-xs text-red-600 flex-1 min-w-[180px]">{submitError}</p>
              <Button
                size="sm"
                variant="danger"
                loading={submitting}
                onClick={() => lastAttemptQuality !== null && handleSubmitQuality(lastAttemptQuality)}
              >
                重试提交
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
