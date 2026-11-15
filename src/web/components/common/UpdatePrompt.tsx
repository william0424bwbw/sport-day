// PWA 更新提示（I9）：有新版本時顯示「更新」按鈕；第一次可離線使用時提示一次
// 新版本不會自動套用，避免比賽進行中畫面突然重新整理。尚未上傳的修改存在本機快取，更新後會繼續上傳。
import { RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { toast } from '../../ui/Toast';

/** 每 30 分鐘、以及回到這個分頁時檢查一次新版本 */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

export function UpdatePrompt() {
  const isDesktop = useIsDesktop();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine) void registration.update().catch(() => {});
      };
      setInterval(check, CHECK_INTERVAL_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });

  useEffect(() => {
    if (!offlineReady) return;
    toast('已可離線使用：沒有網路時也能開啟並查看上次同步的賽程', 'success');
    setOfflineReady(false);
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh) return null;
  return (
    <div
      role="status"
      data-testid="update-prompt"
      className={cn(
        'fixed inset-x-0 z-50 flex justify-center px-3 pointer-events-none',
        // 手機版避開底部導覽列
        isDesktop ? 'bottom-4' : 'bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))]',
      )}
    >
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">
        <RefreshCw className="size-5 shrink-0 text-sky-300" aria-hidden />
        <span className="min-w-0 flex-1">有新版本可以使用</span>
        <Button size="sm" variant="ghost" className="text-slate-300 hover:bg-slate-800" onClick={() => setNeedRefresh(false)}>
          稍後
        </Button>
        <Button size="sm" variant="primary" onClick={() => void updateServiceWorker(true)}>
          更新
        </Button>
      </div>
    </div>
  );
}
