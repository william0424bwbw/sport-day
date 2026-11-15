import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { IconButton } from './Button';
import { cn } from './cn';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** 固定在底部的操作列（儲存／取消），不會被鍵盤或內容擋住 */
  footer?: ReactNode;
  /**
   * sheet：手機從底部滑出、電腦置中對話框（預設，適合檢視細節）
   * fullscreen：手機全螢幕、電腦置中對話框（適合表單）
   */
  variant?: 'sheet' | 'fullscreen';
  /** 電腦版對話框寬度 */
  width?: 'md' | 'lg' | 'xl' | '2xl';
}

/**
 * 共用彈出層：使用原生 <dialog>，支援 Esc／返回鍵關閉、焦點鎖定、背景不可捲動。
 * 手機：底部滑出面板或全螢幕；電腦：置中對話框。
 */
export function Modal({ open, onClose, title, children, footer, variant = 'sheet', width = 'lg' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const isDesktop = useIsDesktop();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const mobileSheet = !isDesktop && variant === 'sheet';
  const mobileFull = !isDesktop && variant === 'fullscreen';

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // 點背景關閉
      }}
      className={cn(
        'p-0 bg-transparent backdrop:bg-slate-900/45 backdrop:backdrop-blur-[2px] max-w-none max-h-none',
        isDesktop && 'm-auto',
        mobileSheet && 'mt-auto mb-0 mx-0 w-full',
        mobileFull && 'm-0 w-full h-full',
      )}
    >
      {open && (
        <div
          className={cn(
            'bg-white flex flex-col shadow-2xl',
            isDesktop && 'rounded-2xl max-h-[85vh]',
            isDesktop && { md: 'w-[28rem]', lg: 'w-[36rem]', xl: 'w-[48rem]', '2xl': 'w-[min(64rem,94vw)]' }[width],
            mobileSheet && 'rounded-t-2xl max-h-[88dvh] w-full pb-safe',
            mobileFull && 'h-dvh w-full pt-safe pb-safe',
          )}
        >
          {mobileSheet && <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-300" aria-hidden />}
          <header className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 shrink-0">
            <h2 className="flex-1 min-w-0 text-base font-bold text-slate-900 truncate">{title}</h2>
            <IconButton label="關閉" onClick={onClose}>
              <X className="size-5" />
            </IconButton>
          </header>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3">{children}</div>
          {footer && (
            <footer className="shrink-0 border-t border-slate-100 px-4 py-3 flex gap-2 justify-end bg-white">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}
