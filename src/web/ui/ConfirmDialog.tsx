import { useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { create } from 'zustand';
import { Button } from './Button';
import { Modal } from './Modal';

// 確認對話框（取代 window.confirm）：
//   if (await confirmDialog({ title: '刪除賽程？', message: '…', confirmText: '刪除', danger: true })) { … }
// 第一次呼叫時會自動掛載到 document.body，呼叫端不需要另外放元件。

export interface ConfirmOptions {
  title: ReactNode;
  message?: ReactNode;
  /** 確認按鈕文字（預設「確定」） */
  confirmText?: string;
  /** 取消按鈕文字（預設「取消」） */
  cancelText?: string;
  /** 紅色確認按鈕（刪除等無法復原的操作） */
  danger?: boolean;
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

const useConfirmStore = create<{ pending: Pending | null }>(() => ({ pending: null }));

let mounted = false;

function ensureHost() {
  if (mounted || typeof document === 'undefined') return;
  mounted = true;
  const el = document.createElement('div');
  el.setAttribute('data-confirm-root', '');
  document.body.appendChild(el);
  createRoot(el).render(<ConfirmHost />);
}

/** 顯示確認對話框；按下確認回傳 true，取消或關閉回傳 false */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  ensureHost();
  return new Promise<boolean>((resolve) => {
    // 同時只顯示一個：前一個視為取消
    useConfirmStore.getState().pending?.resolve(false);
    useConfirmStore.setState({ pending: { ...options, resolve } });
  });
}

function settle(ok: boolean) {
  const { pending } = useConfirmStore.getState();
  if (!pending) return;
  useConfirmStore.setState({ pending: null });
  pending.resolve(ok);
}

function ConfirmHost() {
  const pending = useConfirmStore((s) => s.pending);

  // 開啟後把焦點放在確認按鈕（電腦可直接按 Enter）。子元件 Modal 的 effect（showModal）會先執行
  useEffect(() => {
    if (pending) document.querySelector<HTMLButtonElement>('[data-confirm-ok]')?.focus();
  }, [pending]);

  return (
    <Modal
      open={pending !== null}
      onClose={() => settle(false)}
      title={pending?.title ?? ''}
      width="md"
      footer={
        <>
          <Button onClick={() => settle(false)}>{pending?.cancelText ?? '取消'}</Button>
          <Button data-confirm-okvariant={pending?.danger ? 'danger' : 'primary'} onClick={() => settle(true)}>
            {pending?.confirmText ?? '確定'}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-slate-700">
        {pending?.message}
      </div>
    </Modal>
  );
}
