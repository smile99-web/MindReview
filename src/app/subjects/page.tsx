'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DecomposeForm } from '@/components/knowledge/DecomposeForm';
import { TextbookGenerateForm } from '@/components/knowledge/TextbookGenerateForm';
import { authFetch } from '@/lib/auth';
import { SUBJECT_CONFIG } from '@/types';
import type { SubjectName } from '@/types';

interface SubjectItem {
  id: string;
  name: string;
  icon?: string | null;
  _count?: {
    chapters?: number;
    knowledgeNodes?: number;
  };
}

export default function SubjectsPage() {
  const router = useRouter();
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDecompose, setShowDecompose] = useState(false);
  const [showTextbookGenerate, setShowTextbookGenerate] = useState(false);

  const fetchSubjects = useCallback(() => {
    setLoading(true);
    authFetch('/api/subjects')
      .then((res) => res.json())
      .then((data) => setSubjects(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { document.title = '学科列表 - 知图复习'; }, []);

  useEffect(() => {
    queueMicrotask(fetchSubjects);
  }, [fetchSubjects]);

  const handleDecomposed = () => {
    setShowDecompose(false);
    fetchSubjects();
    router.refresh();
  };

  const handleGenerated = () => {
    setShowTextbookGenerate(false);
    fetchSubjects();
    router.refresh();
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[28px] font-bold text-slate-800 tracking-tight">学科列表</h1>
          <p className="text-slate-500 mt-1.5 text-[15px]">选择学科查看知识点和思维导图</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/lab3d"
            className="px-4 py-2 rounded-xl bg-white border border-indigo-200 text-indigo-600 text-sm font-medium hover:bg-indigo-50 transition-colors"
          >
            🧊 3D实验室
          </Link>
          <Link
            href="/subjects/textbook/new"
            className="px-4 py-2 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition-colors"
          >
            📘 上传教材
          </Link>
          <Button
            variant="secondary"
            onClick={() => {
              setShowTextbookGenerate(!showTextbookGenerate);
              setShowDecompose(false);
            }}
          >
            {showTextbookGenerate ? '收起' : '人教版生成'}
          </Button>
          <Button
            onClick={() => {
              setShowDecompose(!showDecompose);
              setShowTextbookGenerate(false);
            }}
          >
            {showDecompose ? '收起' : 'AI拆解教材'}
          </Button>
        </div>
      </div>

      {showTextbookGenerate && (
        <div className="mb-8">
          <TextbookGenerateForm onGenerated={handleGenerated} />
        </div>
      )}

      {showDecompose && (
        <div className="mb-8">
          <DecomposeForm onDecomposed={handleDecomposed} />
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-44 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {subjects.map((subject) => {
            const config = SUBJECT_CONFIG[subject.name as SubjectName];
            return (
              <Link key={subject.id} href={`/subjects/${subject.id}`}>
                <Card hover className="h-full">
                  <div className="text-center py-2">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200/50 mb-4 text-3xl">
                      {subject.icon || config?.icon || '📖'}
                    </div>
                    <h3 className="font-semibold text-slate-800 mb-1.5">{subject.name}</h3>
                    <div className="flex items-center justify-center gap-3 text-xs text-slate-400">
                      <span>{subject._count?.chapters || 0} 章节</span>
                      <span className="w-1 h-1 rounded-full bg-slate-300" />
                      <span>{subject._count?.knowledgeNodes || 0} 知识点</span>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}

          {subjects.length === 0 && (
            <>
              {['语文', '数学', '物理', '化学', '历史', '道法'].map(name => {
                const config = SUBJECT_CONFIG[name as SubjectName];
                return (
                  <Card key={name} className="h-full opacity-40">
                    <div className="text-center py-2">
                      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-100 mb-4 text-3xl">
                        {config?.icon || '📖'}
                      </div>
                      <h3 className="font-semibold text-slate-800 mb-1.5">{name}</h3>
                      <p className="text-xs text-slate-400">0 知识点</p>
                      <p className="text-xs text-slate-300 mt-2">请先拆解教材</p>
                    </div>
                  </Card>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
