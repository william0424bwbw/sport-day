import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

/** 可切換的晶片（篩選、日期切換、多選場地） */
export function Chip({
  active,
  children,
  className,
  type,
  ...rest
}: { active?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type ?? 'button'}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 min-h-9 px-3 rounded-full border text-sm font-semibold transition-colors whitespace-nowrap',
        active
          ? 'bg-blue-600 border-blue-600 text-white'
          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 active:bg-slate-100',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
