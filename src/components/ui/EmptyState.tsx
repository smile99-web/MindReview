'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  children?: ReactNode;
}

export function EmptyState({ icon = '📭', title, description, action, children }: EmptyStateProps) {
  return (
    <div className="text-center py-14">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-100 text-2xl mb-4">
        {icon}
      </div>
      <p className="text-slate-500 font-medium">{title}</p>
      {description && (
        <p className="text-sm text-slate-400 mt-1.5 max-w-xs mx-auto">{description}</p>
      )}
      {action && (
        <div className="mt-4">
          {action.href ? (
            // <a> 整页刷新丢 SPA 状态，且 <a><button> 是非法嵌套——用 next/link
            <Link href={action.href}>
              <Button>{action.label}</Button>
            </Link>
          ) : (
            <Button onClick={action.onClick}>{action.label}</Button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
