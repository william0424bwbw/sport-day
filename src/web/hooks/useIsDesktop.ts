import { useSyncExternalStore } from 'react';

/** 電腦版排版的斷點（與 docs/mobile-ux.md 一致）：寬度 ≥ 1024px */
export const DESKTOP_QUERY = '(min-width: 1024px)';

function subscribe(cb: () => void) {
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
}
