import { type ClassValue, clsx } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getMasteryColor(level: number): string {
  if (level >= 90) return 'bg-green-500';
  if (level >= 80) return 'bg-lime-500';
  if (level >= 60) return 'bg-yellow-500';
  if (level >= 40) return 'bg-orange-500';
  return 'bg-red-500';
}

export function getMasteryLabel(level: number): string {
  if (level >= 90) return '精通';
  if (level >= 80) return '熟练';
  if (level >= 60) return '一般';
  if (level >= 40) return '薄弱';
  return '未掌握';
}

export function getDifficultyLabel(level: number): string {
  const labels: Record<number, string> = {
    1: '★☆☆☆☆',
    2: '★★☆☆☆',
    3: '★★★☆☆',
    4: '★★★★☆',
    5: '★★★★★',
  };
  return labels[level] || '★★★☆☆';
}
