import { useEffect, useState } from 'react';
import { nowMinutes } from '@shared/time';
import { useSession } from '../stores/session';

/** 目前時間（分鐘）：正式模式用真實時間；模擬模式用 session.clock.simMin。每 15 秒更新 */
export function useNowMin(): number {
  const clock = useSession((s) => s.clock);
  const [real, setReal] = useState(() => nowMinutes());
  useEffect(() => {
    const t = setInterval(() => setReal(nowMinutes()), 15_000);
    return () => clearInterval(t);
  }, []);
  return clock.mode === 'sim' ? clock.simMin : real;
}
