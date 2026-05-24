'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { getDifficultyLabel } from '@/lib/utils';
import { ICAP_LABELS } from '@/types';
import type { IcapLevel } from '@/types';

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
  };
  onTTS?: (text: string) => void;
  onGenerateImage?: (prompt: string) => void;
}

export function KnowledgeCardView({ node, onTTS, onGenerateImage }: KnowledgeCardViewProps) {
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

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

  return (
    <div className="space-y-4">
      {/* 主知识卡 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 flex-wrap">
            {node.subject && (
              <Badge variant="info">{node.subject.name}</Badge>
            )}
            {node.chapter && (
              <Badge variant="default">{node.chapter.title}</Badge>
            )}
            <Badge variant="purple">
              {ICAP_LABELS[node.icapLevel as IcapLevel]}
            </Badge>
            <span className="text-xs text-slate-400">
              {getDifficultyLabel(node.difficulty)} · 认知负荷: {'★'.repeat(node.cognitiveLoad)}
            </span>
          </div>
        </CardHeader>

        <h2 className="text-xl font-bold text-slate-800 tracking-tight mb-3">{node.title}</h2>
        <p className="text-slate-600 leading-relaxed text-[15px] mb-4">{node.summary}</p>

        {/* 关键词 */}
        {node.keywords && node.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {node.keywords.map((kw, i) => (
              <span key={i} className="px-2.5 py-1 bg-indigo-50 text-indigo-600 text-xs rounded-full font-medium">
                #{kw}
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={handleTTS} loading={ttsPlaying}>
            朗读
          </Button>
          <Button size="sm" variant="secondary" onClick={handleGenerateImage}>
            生成配图
          </Button>
        </div>
      </Card>

      {/* 前置知识 */}
      {node.prerequisites && node.prerequisites.length > 0 && (
        <Card>
          <CardTitle className="text-[15px]">前置知识</CardTitle>
          <ul className="mt-3 space-y-1.5">
            {node.prerequisites.map((pre, i) => (
              <li key={i} className="text-sm text-slate-600 flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                {pre}
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
              <li key={i} className="text-sm text-red-600 flex items-start gap-2.5">
                <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                {m}
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
              <li key={i} className="text-sm text-slate-600 flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                {q}
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
              <div className="text-[11px] text-slate-400 mb-1 uppercase tracking-wide">{card.cardType}</div>
              <div className="font-medium text-sm text-slate-800">{card.title}</div>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">{card.content}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
