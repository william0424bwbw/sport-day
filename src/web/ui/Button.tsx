import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'md' | 'lg' | 'sm';

const variants: Record<Variant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm',
  secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 active:bg-slate-100',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 active:bg-slate-200',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 shadow-sm',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 shadow-sm',
};

// 手機可點擊區域至少 44px：md / lg 都符合；sm 只用在電腦版密集介面
const sizes: Record<Size, string> = {
  sm: 'min-h-8 px-2.5 text-xs gap-1',
  md: 'min-h-11 px-4 text-sm gap-1.5',
  lg: 'min-h-12 px-5 text-base gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  block?: boolean;
}

export function Button({ variant = 'secondary', size = 'md', icon, block, className, children, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-semibold transition-colors select-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
        'disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 給螢幕閱讀器與 tooltip 的說明（必填） */
  label: string;
  children: ReactNode;
  size?: 'sm' | 'md';
}

export function IconButton({ label, children, size = 'md', className, type, ...rest }: IconButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-40',
        size === 'md' ? 'size-11' : 'size-8',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
