// I5：現場調度（標記開始／結束、重設、±5 分、延後後續賽程）。只有 useCanEdit() 為 true 時顯示
import { ChevronsRight, Minus, Play, Plus, RotateCcw, Square } from 'lucide-react';
import { formatRange, minToTime } from '@shared/time';
import { useCanEdit } from '../../hooks/useCanEdit';
import { useProject } from '../../stores/project';
import { currentClockMin } from '../../stores/session';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { toast } from '../../ui/Toast';
import { countShifted } from '../common/labels';

export interface LiveControlsProps {
  eventId: string;
  /** large：手機大按鈕；compact：電腦面板 */
  size?: 'large' | 'compact';
  className?: string;
}

const findEvent = (id: string) => useProject.getState().events.find((e) => e.id === id);

// 提示文字沿用舊版 triggerLiveActualStart / triggerLiveActualEnd / resetLiveActualRecords / cascadeDelaySubsequentEvents
function markStart(id: string) {
  const cur = currentClockMin();
  useProject.getState().markActualStart(id, cur);
  const ev = findEvent(id);
  if (ev) toast(`▶ 已記錄實際開賽 (${minToTime(cur)})，賽程順移至 ${formatRange(ev.startMin, ev.endMin)}`, 'success');
}

function markEnd(id: string) {
  const cur = currentClockMin();
  useProject.getState().markActualEnd(id, cur);
  toast(`■ 已記錄實際結束 (${minToTime(cur)})，後續磁吸賽程已自動向上接續！`, 'success');
}

function reset(id: string) {
  useProject.getState().resetActual(id);
  toast('已清除現場實測紀錄');
}

function shift(id: string, delta: number) {
  const ev = findEvent(id);
  if (!ev) return;
  useProject.getState().setEventTime(id, ev.startMin + delta, ev.endMin + delta);
  const next = findEvent(id);
  if (next) toast(`已調整時間：${formatRange(next.startMin, next.endMin)}`);
}

function delay(id: string) {
  const before = useProject.getState().events;
  useProject.getState().delaySubsequent(id, 0);
  const n = countShifted(before, useProject.getState().events, id);
  toast(n > 0 ? `已自動順延本場地後續 ${n} 場賽程！` : '後方賽程時間充裕，無需順延', n > 0 ? 'success' : 'info');
}

export function LiveControls({ eventId, size = 'compact', className }: LiveControlsProps) {
  const canEdit = useCanEdit();
  const ev = useProject((s) => s.events.find((e) => e.id === eventId));
  if (!canEdit || !ev) return null;

  const large = size === 'large';
  const btn = large ? 'lg' : 'sm';
  const started = Boolean(ev.actualStartMin);
  const ended = Boolean(ev.actualEndMin);

  return (
    <div className={cn('space-y-2', className)} role="group" aria-label="現場調度">
      {(started || ended) && (
        <p className="text-xs text-slate-500">
          {started && <>實際開賽 {minToTime(ev.actualStartMin as number)}</>}
          {started && ended && '　'}
          {ended && <>實際結束 {minToTime(ev.actualEndMin as number)}</>}
        </p>
      )}
      <div className={cn('grid gap-2', large ? 'grid-cols-2' : 'grid-cols-3')}>
        <Button size={btn} variant={started && !ended ? 'secondary' : 'success'} icon={<Play className="size-4" />}
          onClick={() => markStart(eventId)}>
          標記開始
        </Button>
        <Button size={btn} variant={started && !ended ? 'danger' : 'secondary'} icon={<Square className="size-4" />}
          onClick={() => markEnd(eventId)}>
          標記結束
        </Button>
        <Button size={btn} variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => reset(eventId)}
          className={large ? 'col-span-2' : undefined}
          disabled={!started && !ended}>
          重設
        </Button>
        <Button size={btn} icon={<Minus className="size-4" />} aria-label="提前 5 分鐘" onClick={() => shift(eventId, -5)}>
          5 分
        </Button>
        <Button size={btn} icon={<Plus className="size-4" />} aria-label="延後 5 分鐘" onClick={() => shift(eventId, 5)}>
          5 分
        </Button>
        <Button size={btn} variant="secondary" icon={<ChevronsRight className="size-4" />}
          className={large ? 'col-span-2' : undefined}
          onClick={() => delay(eventId)}>
          延後後續賽程
        </Button>
      </div>
    </div>
  );
}
