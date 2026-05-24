"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { MasteryBar } from "@/components/ui/MasteryBar";
import { ICAP_LABELS } from "@/types";
import { getQualityLabel, getQualityColor } from "@/lib/sm2";
import type { IcapLevel } from "@/types";

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
  };
  onComplete?: (
    taskId: string,
    quality: number,
    knowledgeNodeId: string
  ) => void;
}

const QUALITY_OPTIONS = [
  { value: 0, label: "完全忘记", emoji: "😰" },
  { value: 1, label: "很不熟悉", emoji: "😣" },
  { value: 2, label: "看到才想起", emoji: "🤔" },
  { value: 3, label: "有困难但对", emoji: "💪" },
  { value: 4, label: "基本掌握", emoji: "👍" },
  { value: 5, label: "完全掌握", emoji: "🎯" },
];

export function ReviewTaskCard({ task, onComplete }: ReviewTaskCardProps) {
  const [showQuality, setShowQuality] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(task.completed || false);
  const [selectedQuality, setSelectedQuality] = useState<number | null>(null);

  if (completed) {
    return (
      <Card className="opacity-50">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="success">已完成</Badge>
          <span className="text-sm text-slate-500">
            {task.taskType === "passive"
              ? "已阅读"
              : `质量: ${task.score ? task.score / 20 : "?"}/5`}
          </span>
        </div>
        <h4 className="font-medium text-slate-700">
          {task.knowledgeNode.title}
        </h4>
      </Card>
    );
  }

  const node = task.knowledgeNode;
  const icapLabel =
    ICAP_LABELS[task.taskType as IcapLevel] || task.taskType;

  const handleSelectQuality = async (q: number) => {
    setSelectedQuality(q);
    setSubmitting(true);

    try {
      await new Promise((r) => setTimeout(r, 300)); // 视觉反馈
      onComplete?.(task.id, q, node.id);
      setCompleted(true);
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <Card className="animate-fade-in">
      {/* 头部 */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Badge variant="purple">{icapLabel}</Badge>
            <span className="text-xs text-slate-400">
              难度: {"★".repeat(node.difficulty)}
            </span>
            {node.repetitions !== undefined && node.repetitions > 0 && (
              <span className="text-xs text-slate-400">
                · 第 {node.repetitions + 1} 次复习
              </span>
            )}
          </div>
          <h4 className="font-semibold text-slate-800">{node.title}</h4>
        </div>

        {/* SM-2 状态指示器 */}
        <div className="flex items-center gap-2 shrink-0">
          {node.forgetRisk !== undefined && (
            <div className="text-right">
              <div className="text-[11px] text-slate-400">遗忘风险</div>
              <div
                className={`text-sm font-semibold tabular-nums ${
                  node.forgetRisk > 0.3
                    ? "text-red-500"
                    : node.forgetRisk > 0.15
                      ? "text-amber-500"
                      : "text-emerald-500"
                }`}
              >
                {(node.forgetRisk * 100).toFixed(0)}%
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

      <p className="text-sm text-slate-600 mb-4 leading-relaxed">
        {node.summary}
      </p>

      <MasteryBar level={node.masteryLevel} />

      {/* SM-2 调度信息 */}
      <div className="flex gap-3 mt-3 mb-1 text-xs text-slate-400">
        {node.nextReviewAt && (
          <span>
            下次复习:{" "}
            {new Date(node.nextReviewAt).toLocaleDateString("zh-CN")}
          </span>
        )}
        {(node.intervalDays ?? 0) > 0 && (
          <span>间隔: {node.intervalDays} 天</span>
        )}
      </div>

      {/* 质量评分按钮 */}
      {!showQuality ? (
        <div className="mt-4 flex gap-2">
          {task.taskType === "passive" && (
            <Button size="sm" onClick={() => handleSelectQuality(3)}>
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
          <p className="text-sm font-medium text-slate-700 mb-3">
            回忆质量评分 (0-5)
          </p>
          <div className="grid grid-cols-3 gap-2">
            {QUALITY_OPTIONS.map((opt) => {
              const isSelected = selectedQuality === opt.value;
              return (
                <button
                  key={opt.value}
                  disabled={submitting}
                  onClick={() => handleSelectQuality(opt.value)}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all duration-200 ${
                    isSelected
                      ? "border-indigo-300 bg-indigo-50 shadow-sm"
                      : "border-slate-200/80 hover:border-slate-300 hover:bg-slate-50"
                  } disabled:opacity-50`}
                >
                  <span className="text-lg">{opt.emoji}</span>
                  <span className="text-xs font-medium text-slate-600">
                    {opt.label}
                  </span>
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                      getQualityColor(opt.value)
                    }`}
                  >
                    {opt.value}
                  </span>
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
        </div>
      )}
    </Card>
  );
}
