import { create } from 'zustand';

interface ToastItem {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'error';
}

const useToastStore = create<{ items: ToastItem[] }>(() => ({ items: [] }));

let seq = 0;
/** 顯示提示訊息（任何地方都可以呼叫，不需要 hook） */
export function toast(text: string, tone: ToastItem['tone'] = 'info') {
  const id = ++seq;
  useToastStore.setState((s) => ({ items: [...s.items, { id, text, tone }].slice(-3) }));
  setTimeout(() => useToastStore.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })), 3500);
}

const tones = {
  info: 'bg-slate-900 text-white',
  success: 'bg-emerald-600 text-white',
  error: 'bg-rose-600 text-white',
};

/** 放在 App 最外層一次即可。位置在畫面上方，不會擋住手機底部導覽列與操作按鈕 */
export function ToastViewport() {
  const items = useToastStore((s) => s.items);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-4 pt-safe mt-3">
      {items.map((t) => (
        <div key={t.id} className={`pointer-events-auto max-w-md rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg ${tones[t.tone]}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
