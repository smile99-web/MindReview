'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { getDifficultyLabel } from '@/lib/utils';
import { ICAP_LABELS, SUBJECT_CONFIG } from '@/types';
import type { IcapLevel, SubjectName } from '@/types';
import { RepresentationView } from './RepresentationView';
import { LatexText } from '@/components/ui/LatexText';

// 所有可用的表征类型（用于下拉选择）
const ALL_REPRESENTATION_TYPES = [
  { value: '', label: '自动检测' },
  { value: 'formula', label: '公式' },
  { value: 'force', label: '受力分析' },
  { value: 'reaction', label: '化学反应' },
  { value: 'timeline', label: '时间线' },
  { value: 'causal', label: '因果链' },
  { value: 'step', label: '步骤流程' },
  { value: 'template', label: '答题模板' },
  { value: 'comparison', label: '对比表' },
  { value: 'mindmap', label: '思维导图' },
  { value: 'concept_map', label: '概念图' },
];

interface KnowledgeCardViewProps {
  node: {
    id: string;
    title: string;
    summary: string;
    keywords: string[];
    difficulty: number;
    cognitiveLoad: number;
    icapLevel: string;
    masteryLevel: number;
    subject?: { name: string };
    chapter?: { title: string };
    commonMistakes: string[];
    typicalQuestions: string[];
    prerequisites: string[];
    knowledgeCards: any[];
    representationType?: string | null;
    representationData?: any;
  };
  onTTS?: (text: string) => void;
  onGenerateImage?: (prompt: string) => void;
  generatingImage?: boolean;
}

export function KnowledgeCardView({
  node,
  onTTS,
  onGenerateImage,
  generatingImage = false,
}: KnowledgeCardViewProps) {
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // 表征状态 — 父组件统一管理
  const [repType, setRepType] = useState<string>(node.representationType || '');
  const [repData, setRepData] = useState<any>(node.representationData || null);
  const [repLoading, setRepLoading] = useState(false);
  const [repError, setRepError] = useState<string | null>(null);

  // 合并表征数据到 node 形对象
  const repNode = {
    id: node.id,
    title: node.title,
    summary: node.summary,
    subject: node.subject,
    representationType: repType || node.representationType || null,
    representationData: repData ?? node.representationData ?? null,
  };

  const subjectRepTypes =
    SUBJECT_CONFIG[node.subject?.name as SubjectName]?.representationTypes ?? [];

  const handleTTS = async () => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play();
      return;
    }

    setTtsPlaying(true);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${node.title}。${node.summary}`,
          contentType: 'card',
          contentRefId: node.id,
        }),
      });
      const data = await res.json();
      if (data.audioUrl) {
        setAudioUrl(data.audioUrl);
        const audio = new Audio(data.audioUrl);
        audio.play();
      }
    } catch (err) {
      console.error('TTS failed:', err);
    } finally {
      setTtsPlaying(false);
    }
  };

  const handleGenerateImage = () => {
    onGenerateImage?.(
      `中学${node.subject?.name || ''}知识点：${node.title}，${node.summary}`,
    );
  };

  /** 自动检测 + 生成表征（RepresentationView 的 onDetect 回调） */
  const handleDetect = async () => {
    setRepLoading(true);
    setRepError(null);

    try {
      const res = await fetch('/api/representation/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ knowledgeNodeId: node.id }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `请求失败 (${res.status})`);
      }

      const result = await res.json();
      setRepType(result.representationType);
      setRepData(result.representationData);
    } catch (err: any) {
      setRepError(err.message || '生成失败');
      console.error('[KnowledgeCardView] Detect failed:', err);
    } finally {
      setRepLoading(false);
    }
  };

  /** 重新生成表征（使用当前选定的类型） */
  const handleRegenerate = async () => {
    setRepLoading(true);
    setRepError(null);

    try {
      const res = await fetch('/api/representation/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          knowledgeNodeId: node.id,
          representationType: repType || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `请求失败 (${res.status})`);
      }

      const result = await res.json();
      setRepType(result.representationType);
      setRepData(result.representationData);
    } catch (err: any) {
      setRepError(err.message || '重新生成失败');
      console.error('[KnowledgeCardView] Regenerate failed:', err);
    } finally {
      setRepLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 主知识卡 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 flex-wrap">
            {node.subject && <Badge variant="info">{node.subject.name}</Badge>}
            {node.chapter && (
              <Badge variant="default">{node.chapter.title}</Badge>
            )}
            <Badge variant="purple">
              {ICAP_LABELS[node.icapLevel as IcapLevel]}
            </Badge>
            <span className="text-xs text-slate-400">
              {getDifficultyLabel(node.difficulty)} · 认知负荷:{' '}
              {'★'.repeat(node.cognitiveLoad)}
            </span>
          </div>
        </CardHeader>

        <h2 className="text-xl font-bold text-slate-800 tracking-tight mb-3">
          {node.title}
        </h2>
        <div className="text-slate-600 leading-relaxed text-[15px] mb-4">
          <LatexText text={node.summary || ''} />
        </div>

        {/* 关键词 */}
        {node.keywords && node.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {node.keywords.map((kw, i) => (
              <span
                key={i}
                className="px-2.5 py-1 bg-indigo-50 text-indigo-600 text-xs rounded-full font-medium"
              >
                #{kw}
              </span>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleTTS}
              loading={ttsPlaying}
            >
              朗读
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleGenerateImage}
              loading={generatingImage}
              disabled={generatingImage}
            >
              生成配图
            </Button>
          </div>
          {generatingImage && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-indigo-600">
                <svg
                  className="w-3.5 h-3.5 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="opacity-25"
                  />
                  <path
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    fill="currentColor"
                    className="opacity-75"
                  />
                </svg>
                AI 正在生成配图...
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 rounded-full animate-progress" />
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* 表征视图 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[15px]">表征视图</CardTitle>
        </CardHeader>

        {/* 表征类型选择器 + 操作按钮 */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-500 font-medium">类型:</label>
            <select
              value={repType}
              onChange={(e) => setRepType(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300"
            >
              {ALL_REPRESENTATION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <Button
            size="sm"
            variant="secondary"
            onClick={handleRegenerate}
            loading={repLoading}
            disabled={repLoading}
          >
            重新生成
          </Button>

          {subjectRepTypes.length > 0 && (
            <span className="text-[11px] text-slate-400">
              学科推荐: {subjectRepTypes.join(' / ')}
            </span>
          )}
        </div>

        {repError && !repLoading && (
          <p className="text-xs text-red-500 mb-3 bg-red-50 rounded-lg px-3 py-1.5">
            {repError}
          </p>
        )}

        {/* 表征视图组件 — 由 KnowledgeCardView 管理所有状态 */}
        <RepresentationView
          node={repNode as any}
          autoDetect
          loading={repLoading}
          error={repError}
          onDetect={handleDetect}
          onRegenerate={handleRegenerate}
        />
      </Card>

      {/* 前置知识 */}
      {node.prerequisites && node.prerequisites.length > 0 && (
        <Card>
          <CardTitle className="text-[15px]">前置知识</CardTitle>
          <ul className="mt-3 space-y-1.5">
            {node.prerequisites.map((pre, i) => (
              <li
                key={i}
                className="text-sm text-slate-600 flex items-start gap-2.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                <LatexText text={pre} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 常见错误 */}
      {node.commonMistakes && node.commonMistakes.length > 0 && (
        <Card>
          <CardTitle className="text-[15px]">常见错误</CardTitle>
          <ul className="mt-3 space-y-1.5">
            {node.commonMistakes.map((m, i) => (
              <li
                key={i}
                className="text-sm text-red-600 flex items-start gap-2.5"
              >
                <svg
                  className="w-4 h-4 text-red-400 mt-0.5 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
                <LatexText text={m} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 典型题型 */}
      {node.typicalQuestions && node.typicalQuestions.length > 0 && (
        <Card>
          <CardTitle className="text-[15px]">典型题型</CardTitle>
          <ul className="mt-3 space-y-1.5">
            {node.typicalQuestions.map((q, i) => (
              <li
                key={i}
                className="text-sm text-slate-600 flex items-start gap-2.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                <LatexText text={q} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 关联知识卡片 */}
      {node.knowledgeCards && node.knowledgeCards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {node.knowledgeCards.map((card: any) => (
            <Card key={card.id} padding="sm" hover>
              <div className="text-[11px] text-slate-400 mb-1 uppercase tracking-wide">
                {card.cardType}
              </div>
              <div className="font-medium text-sm text-slate-800">
                {card.title}
              </div>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                {card.content}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
