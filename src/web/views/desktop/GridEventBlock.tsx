// 格狀表上的一個賽程方塊（含上方的檢錄緩衝區），外觀沿用舊版 renderCanvasGridAndEvents
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { DAY_START_MIN, STEP_MINUTES } from '@shared/constants';
import { minToTime } from '@shared/time';
import type { ScheduleEvent } from '@shared/types';
import { cn } from '../../ui/cn';
import { eventColor } from '../../ui/eventColors';
import { columnStyle, minToY, SLOT_HEIGHT } from './gridLayout';

export type ResizeEdge = 'top' | 'bottom';

export interface GridEventBlockProps {
  event: ScheduleEvent;
  /** 畫面上的時間與欄位（拖曳中為預覽值） */
  startMin: number;
  endMin: number;
  minCol: number;
  span: number;
  columnCount: number;
  nowMin: number;
  /** 顯示用場地代號（例如 A~B~S） */
  venueLabel: string;
  selected: boolean;
  /** 有篩選條件時：符合者高亮、不符合者淡化 */
  filterState: 'none' | 'match' | 'dim';
  checkInWarn: boolean;
  /** 顯示公差／志工人數（導師視角不顯示，與舊版相同） */
  showCrew: boolean;
  canEdit: boolean;
  dragging: boolean;
  onSelect: () => void;
  onBodyPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void;
  onResizePointerDown?: (e: ReactPointerEvent<HTMLElement>, edge: ResizeEdge) => void;
}

const hasNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function GridEventBlock(props: GridEventBlockProps) {
  const { event: ev, startMin, endMin, minCol, span, columnCount, nowMin, selected, filterState, canEdit, dragging } = props;
  const theme = eventColor(ev.color);
  const pos = columnStyle(minCol, span, columnCount);

  const startIdx = Math.max(0, Math.round((startMin - DAY_START_MIN) / STEP_MINUTES));
  const durationSlots = Math.max(1, Math.round((endMin - startMin) / STEP_MINUTES));
  const top = startIdx * SLOT_HEIGHT + 2;
  const height = Math.max(24, durationSlots * SLOT_HEIGHT - 4);

  const completed = hasNumber(ev.actualEndMin);
  const live = nowMin >= startMin && nowMin < endMin && !completed;

  // 檢錄緩衝區（提早檢錄的分鐘數，07:00 以前截掉）
  const offset = ev.checkInOffsetMin || 0;
  const ciStart = Math.max(DAY_START_MIN, startMin - offset);
  const hasCheckIn = offset > 0 && ciStart < startMin;
  const ciTop = minToY(ciStart) + 1;
  const ciHeight = Math.max(16, Math.max(1, Math.round((startMin - ciStart) / STEP_MINUTES)) * SLOT_HEIGHT - 1);

  const refSummary = (ev.referees || [])
    .filter((r) => r.name)
    .map((r) => `${r.role ?? ''}:${r.name}`)
    .join('、');
  const hasAttachments = (ev.attachments || []).length > 0;
  const students = ev.studentCount ?? 0;
  const volunteers = ev.volunteerCount ?? 0;

  const dimClass = filterState === 'dim' ? 'opacity-25 saturate-0' : '';

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      props.onSelect();
    }
  };

  return (
    <>
      {hasCheckIn && (
        <div
          data-testid={`grid-checkin-${ev.id}`}
          title={
            props.checkInWarn
              ? `⚠️ 檢錄時段與前一場賽程重疊（${minToTime(ciStart)}–${minToTime(startMin)}）`
              : `檢錄緩衝時間：${minToTime(ciStart)}–${minToTime(startMin)}（提早 ${offset} 分鐘）`
          }
          onClick={(e) => {
            e.stopPropagation();
            props.onSelect();
          }}
          style={{ top: ciTop, height: ciHeight, ...pos }}
          className={cn(
            'absolute cursor-pointer rounded-t-lg px-2 flex items-center justify-between gap-1 overflow-hidden transition-opacity',
            props.checkInWarn
              ? 'checkin-stripes-warn border-2 border-b-0 border-amber-500 z-30 shadow-[0_4px_12px_-2px_rgba(245,158,11,0.35)]'
              : 'checkin-stripes border border-b-0 border-slate-300 z-10',
            filterState === 'dim' && 'opacity-20 saturate-0',
            dragging && 'opacity-60',
          )}
        >
          <span className={cn('text-[10px] font-bold truncate', props.checkInWarn ? 'text-amber-800' : 'text-slate-600')}>
            {props.checkInWarn ? '⚠️ 重疊檢錄' : '檢錄'} {minToTime(ciStart)}
          </span>
          <span className={cn('text-[9px] font-bold shrink-0', props.checkInWarn ? 'text-amber-700' : 'text-slate-400')}>
            提早{offset}分
          </span>
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={`${ev.title}，${minToTime(startMin)} 到 ${minToTime(endMin)}`}
        data-testid={`grid-event-${ev.id}`}
        data-filter={filterState}
        data-selected={selected ? 'true' : undefined}
        onClick={(e) => {
          e.stopPropagation();
          props.onSelect();
        }}
        onKeyDown={onKeyDown}
        onPointerDown={canEdit ? props.onBodyPointerDown : undefined}
        onContextMenu={canEdit ? (e) => e.preventDefault() : undefined}
        style={{ top, height, ...pos, WebkitTouchCallout: 'none' }}
        className={cn(
          'group absolute flex flex-col justify-between overflow-hidden border-2 px-3 py-1.5 select-none',
          'shadow-xs hover:shadow-md transition-[box-shadow,opacity,filter] focus-visible:outline-2 focus-visible:outline-blue-500',
          hasCheckIn ? 'rounded-b-xl rounded-t-none' : 'rounded-xl',
          theme.border,
          theme.bg,
          theme.text,
          canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
          selected || live ? 'z-20' : 'z-10',
          selected && 'ring-2 ring-blue-500 ring-offset-1 shadow-md',
          live && 'sd-live-pulse ring-2 ring-rose-500',
          completed && 'opacity-80',
          filterState === 'match' && 'ring-2 ring-amber-500 shadow-lg z-30',
          dimClass,
          dragging && 'z-40 shadow-xl ring-2 ring-blue-400 opacity-90',
        )}
      >
        {canEdit && (
          <div
            data-testid={`grid-resize-top-${ev.id}`}
            title="上下拖曳調整開始時間"
            onPointerDown={(e) => props.onResizePointerDown?.(e, 'top')}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'absolute top-0 inset-x-0 h-2.5 cursor-ns-resize flex items-center justify-center z-20 touch-none',
              'opacity-0 group-hover:opacity-100 transition-opacity',
              (selected || dragging) && 'opacity-100',
            )}
          >
            <div className="w-8 h-1 rounded-full bg-slate-500/50" />
          </div>
        )}

        <div className="min-w-0">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <div className="flex items-center gap-1 flex-wrap min-w-0">
              <span className={cn('px-1.5 rounded text-[10px] font-bold', theme.badge)}>
                {minToTime(startMin)} - {minToTime(endMin)}
              </span>
              {ev.linkPrev && (
                <span className="px-1 rounded text-[9px] font-bold bg-indigo-600 text-white" title="已開啟磁吸：自動緊接前一場賽程">
                  🧲磁吸
                </span>
              )}
              {live && <span className="px-1.5 rounded text-[9px] font-extrabold bg-rose-600 text-white animate-pulse">進行中</span>}
              {completed && <span className="px-1 rounded text-[9px] font-bold bg-slate-600 text-white">已結束</span>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {hasAttachments && (
                <span className="px-1 rounded bg-white/80 text-[9px] font-bold text-blue-700 border border-blue-200" title="附有道次表或選手名單">
                  📎道次表
                </span>
              )}
              {span > 1 && <span className="text-[10px] font-extrabold opacity-75">橫跨 {props.venueLabel} 區</span>}
            </div>
          </div>
          <div className="text-sm font-extrabold leading-snug tracking-wide line-clamp-2 mt-0.5 break-all">{ev.title}</div>
        </div>

        {height >= 52 && (
          <div className="text-[11px] opacity-85 truncate pt-1 border-t border-black/10 flex items-center justify-between gap-1">
            <span className="truncate font-medium">{refSummary ? `裁判：${refSummary}` : '點擊查看詳細配置'}</span>
            {props.showCrew && (students > 0 || volunteers > 0) && (
              <span className="font-bold shrink-0">
                公差{students}/志{volunteers}
              </span>
            )}
          </div>
        )}

        {canEdit && (
          <div
            data-testid={`grid-resize-bottom-${ev.id}`}
            title="上下拖曳調整結束時間"
            onPointerDown={(e) => props.onResizePointerDown?.(e, 'bottom')}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'absolute bottom-0 inset-x-0 h-2.5 cursor-ns-resize flex items-center justify-center z-20 touch-none',
              'opacity-0 group-hover:opacity-100 transition-opacity',
              (selected || dragging) && 'opacity-100',
            )}
          >
            <div className="w-8 h-1 rounded-full bg-slate-500/50" />
          </div>
        )}
      </div>
    </>
  );
}
