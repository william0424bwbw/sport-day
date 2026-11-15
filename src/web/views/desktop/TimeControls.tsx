// 時間線控制器（舊版 liveTimeSimulatorBar）：真實時間／模擬時間、±10 分、快轉（每 5 秒前進 10 分鐘）
import { Pause, Play } from 'lucide-react';
import { minToTime } from '@shared/time';
import { useNowMin } from '../../hooks/useNowMin';
import { AUTOPLAY_STEP_MIN, useSession } from '../../stores/session';
import { cn } from '../../ui/cn';

export function TimeControls() {
  const clock = useSession((s) => s.clock);
  const setClock = useSession((s) => s.setClock);
  const nowMin = useNowMin();
  const sim = clock.mode === 'sim';

  const modeBtn = (active: boolean) =>
    cn(
      'px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors',
      active ? 'bg-white text-rose-700 shadow-sm' : 'text-rose-600/80 hover:text-rose-800',
    );
  const stepBtn =
    'px-1.5 py-0.5 bg-white hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[11px] font-bold';

  return (
    <div
      data-testid="time-controls"
      className="flex items-center gap-1.5 bg-rose-50/90 border border-rose-200 px-2.5 py-1 rounded-xl"
    >
      <span className="flex items-center gap-1 text-[11px] font-bold text-rose-700">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full rounded-full bg-rose-400 opacity-75 animate-ping" />
          <span className="relative inline-flex size-2 rounded-full bg-rose-500" />
        </span>
        時間線
      </span>
      <div className="flex items-center bg-rose-100/80 rounded-lg p-0.5" role="group" aria-label="時間來源">
        <button type="button" aria-pressed={!sim} className={modeBtn(!sim)} onClick={() => setClock({ mode: 'real' })}>
          真實時間
        </button>
        <button type="button" aria-pressed={sim} className={modeBtn(sim)} onClick={() => setClock({ mode: 'sim' })}>
          模擬時間
        </button>
      </div>
      {sim && (
        <button
          type="button"
          className={stepBtn}
          title="倒退 10 分鐘"
          onClick={() => setClock({ simMin: clock.simMin - AUTOPLAY_STEP_MIN })}
        >
          −10 分
        </button>
      )}
      <span data-testid="clock-label" className="px-1 text-xs font-mono font-bold text-rose-700 tabular-nums">
        {minToTime(Math.floor(nowMin))}
      </span>
      {sim && (
        <>
          <button
            type="button"
            className={stepBtn}
            title="前進 10 分鐘"
            onClick={() => setClock({ simMin: clock.simMin + AUTOPLAY_STEP_MIN })}
          >
            +10 分
          </button>
          <button
            type="button"
            aria-pressed={clock.autoplay}
            onClick={() => setClock({ autoplay: !clock.autoplay })}
            title="每 5 秒自動前進 10 分鐘，模擬現場比賽進行"
            className={cn(
              'ml-0.5 flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold shadow-sm transition-colors',
              clock.autoplay ? 'bg-slate-800 hover:bg-slate-900 text-white' : 'bg-rose-600 hover:bg-rose-700 text-white',
            )}
          >
            {clock.autoplay ? <Pause className="size-3" /> : <Play className="size-3" />}
            {clock.autoplay ? '暫停快轉' : '快轉(5s=10m)'}
          </button>
        </>
      )}
    </div>
  );
}
