'use client';

import { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="text-center max-w-sm">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-100 text-2xl mb-4">
              ⚠️
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">页面加载出错</h3>
            <p className="text-sm text-slate-500 mb-4">
              {this.state.error?.message || '发生了意外错误'}
            </p>
            <Button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
            >
              重新加载
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
