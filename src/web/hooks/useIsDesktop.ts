import { useSyncExternalStore } from 'react';

/** 電腦版排版的斷點（與 docs/mobile-ux.md 一致）：寬度 ≥ 1024px */
export const DESKTOP_QUERY = '(min-width: 1024px)';
const PRINT_QUERY = 'print';

// 列印時瀏覽器會把寬度改成紙張寬度（A4 約 794px），如果跟著切換成手機排版，
// 開著的細流表會被卸載、印出空白頁。所以列印期間固定使用列印前的排版。
let printing = false;
let last: boolean | null = null;

function isPrinting() {
  return printing || window.matchMedia(PRINT_QUERY).matches;
}

function snapshot(): boolean {
  if (last === null || !isPrinting()) last = window.matchMedia(DESKTOP_QUERY).matches;
  return last;
}

function subscribe(cb: () => void) {
  const desktop = window.matchMedia(DESKTOP_QUERY);
  const print = window.matchMedia(PRINT_QUERY);
  const before = () => {
    snapshot(); // 先記住列印前的排版
    printing = true;
  };
  const after = () => {
    printing = false;
    cb();
  };
  desktop.addEventListener('change', cb);
  print.addEventListener('change', cb);
  window.addEventListener('beforeprint', before);
  window.addEventListener('afterprint', after);
  return () => {
    desktop.removeEventListener('change', cb);
    print.removeEventListener('change', cb);
    window.removeEventListener('beforeprint', before);
    window.removeEventListener('afterprint', after);
  };
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
