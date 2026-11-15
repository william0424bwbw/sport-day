// 手機版頁面共用的小元件（頁面標題、區塊卡片）
import type { ReactNode } from 'react';
import { cn } from '../../ui/cn';

export function PageTitle({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-2">
      <h1 className="text-xl font-bold text-slate-900">{title}</h1>
      {aside}
    </div>
  );
}

const tones = {
  live: 'border-l-emerald-500',
  next: 'border-l-amber-500',
  plain: 'border-l-slate-200',
};

/** 白色區塊卡片；左邊框顏色表示狀態 */
export function Section({
  title,
  tone = 'plain',
  testId,
  children,
}: {
  title: ReactNode;
  tone?: keyof typeof tones;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      className={cn('min-w-0 space-y-3 rounded-2xl border border-l-4 border-slate-200 bg-white p-3 shadow-sm', tones[tone])}
    >
      <h2 className="text-sm font-bold text-slate-500">{title}</h2>
      {children}
    </section>
  );
}
