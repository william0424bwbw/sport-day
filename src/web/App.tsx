import { useEffect } from 'react';
import { useIsDesktop } from './hooks/useIsDesktop';
import { DesktopApp } from './layouts/DesktopApp';
import { MobileApp } from './layouts/MobileApp';
import { startSync } from './services/sync';
import { ToastViewport } from './ui/Toast';

/** 依螢幕寬度切換排版；兩種排版功能相同（docs/mobile-ux.md） */
export function App() {
  const isDesktop = useIsDesktop();
  useEffect(() => startSync(), []);
  return (
    <>
      {isDesktop ? <DesktopApp /> : <MobileApp />}
      <ToastViewport />
    </>
  );
}
