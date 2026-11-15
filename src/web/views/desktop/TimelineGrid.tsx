// 時間 × 場地格狀表（舊版 §11 renderTimeAxisLabels / renderCanvasGridAndEvents）
// 時間軸 07:00–17:00、每 10 分鐘一列；每個場地一欄；賽程方塊絕對定位，跨場地者橫跨連續欄位。
import { MousePointerClick } from 'lucide-react';
import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { DAY_END_MIN, DAY_START_MIN } from '@shared/constants';
import { checkInOverlaps, matchesFilter } from '@shared/schedule';
import { minToTime } from '@shared/time';
import type { ScheduleEvent, Venue } from '@shared/types';
import type { SessionStore } from '../../stores/contracts';
import { cn } from '../../ui/cn';
import { GridEventBlock } from './GridEventBlock';
import {
  columnStyle,
  eventColumns,
  GRID_HEIGHT,
  minToY,
  NEW_EVENT_MINUTES,
  SLOT_HEIGHT,
  SLOT_STARTS,
  TIME_AXIS_WIDTH,
  VENUE_MIN_WIDTH,
  venueColumns,
} from './gridLayout';
import type { DragPreview } from './useGridDrag';

/** 連點兩下的判定時間（ms），滑鼠雙擊與平板連點都適用 */
const DOUBLE_TAP_MS = 400;

export interface TimelineGridProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLDivElement | null>;
  venues: Venue[];
  /** 全部賽程（判斷檢錄重疊用） */
  allEvents: ScheduleEvent[];
  /** 本日賽程 */
  dayEvents: ScheduleEvent[];
  filter: SessionStore['filter'];
  showCrew: boolean;
  canEdit: boolean;
  selectedId: string | null;
  nowMin: number;
  preview: DragPreview | null;
  onSelect: (id: string) => void;
  onCreateAt: (venueId: string, startMin: number) => void;
  onEventPointerDown: (e: ReactPointerEvent<HTMLElement>, ev: ScheduleEvent, mode: 'move' | 'top' | 'bottom') => void;
  consumeSuppressedClick: () => boolean;
}

export function TimelineGrid(props: TimelineGridProps) {
  const { venues, dayEvents, allEvents, filter, canEdit, preview, nowMin, scrollRef, canvasRef } = props;
  const colCount = Math.max(1, venues.length);
  const lastTap = useRef<{ key: string; at: number } | null>(null);
  const hasActiveFilter = Boolean(filter.grade || filter.venueId || filter.query.trim());
  const sorted = [...dayEvents].sort((a, b) => a.startMin - b.startMin);
  const showNow = nowMin >= DAY_START_MIN && nowMin <= DAY_END_MIN;

  /** 點空白時間格：連點兩下新增（舊版只允許雙擊，避免誤觸） */
  const onSlotClick = (venueId: string, startMin: number, now: number) => {
    if (!canEdit) return;
    const key = `${venueId}@${startMin}`;
    if (lastTap.current && lastTap.current.key === key && now - lastTap.current.at < DOUBLE_TAP_MS) {
      lastTap.current = null;
      props.onCreateAt(venueId, startMin);
      return;
    }
    lastTap.current = { key, at: now };
  };

  const newPreview = preview?.kind === 'new' && preview.inside ? preview : null;

  return (
    <div ref={scrollRef} data-testid="timeline-scroll" className="flex-1 overflow-auto relative min-h-0 bg-slate-50/70">
      <div className="flex flex-col" style={{ minWidth: Math.max(960, TIME_AXIS_WIDTH + colCount * VENUE_MIN_WIDTH) }}>
        {/* 場地欄位表頭（捲動時固定在上方） */}
        <div className="sticky top-0 z-20 flex bg-white border-b border-slate-200 shadow-sm">
          <div className="w-16 shrink-0 py-2.5 px-2 text-center text-[11px] font-bold text-slate-400 border-r border-slate-200 bg-slate-50 sticky left-0 z-30">
            時間
          </div>
          <div className="flex-1 grid" style={{ gridTemplateColumns: venueColumns(colCount) }}>
            {venues.map((v) => (
              <div
                key={v.id}
                data-testid={`venue-header-${v.id}`}
                className={cn('py-2 px-2 text-center border-r border-slate-200/80 last:border-r-0 min-w-0', v.id === 'S' && 'bg-amber-50/60')}
              >
                <div className={cn('text-xs font-extrabold truncate', v.id === 'S' ? 'text-amber-800' : 'text-slate-800')}>{v.name}</div>
                <div className={cn('text-[10px] truncate', v.id === 'S' ? 'text-amber-600 font-semibold' : 'text-slate-400')}>
                  {v.subtitle || ' '}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex relative">
          {/* 左側時間刻度（每 30 分鐘顯示標籤，捲動時固定在左邊） */}
          <div className="w-16 shrink-0 bg-white border-r border-slate-200 sticky left-0 z-10" aria-hidden>
            {SLOT_STARTS.map((m) => {
              const half = m % 30 === 0;
              return (
                <div key={m} style={{ height: SLOT_HEIGHT }} className={cn('relative border-b', half ? 'border-slate-200/80' : 'border-transparent')}>
                  {half && m > DAY_START_MIN && (
                    <span className={cn('absolute -top-2 right-2 text-[11px]', m % 60 === 0 ? 'text-slate-700 font-bold' : 'text-slate-400 font-semibold')}>
                      {minToTime(m)}
                    </span>
                  )}
                  {m === DAY_START_MIN && (
                    <span className="absolute top-0.5 right-2 text-[11px] text-slate-700 font-bold">{minToTime(m)}</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* 場地背景格子 + 賽程方塊 */}
          <div
            ref={canvasRef}
            data-testid="timeline-grid"
            className="flex-1 relative isolate"
            style={{ height: GRID_HEIGHT }}
          >
            <div className="grid h-full" style={{ gridTemplateColumns: venueColumns(colCount) }}>
              {venues.map((v) => (
                <div
                  key={v.id}
                  data-venue-id={v.id}
                  className={cn('relative border-r border-slate-200/80 last:border-r-0', v.id === 'S' && 'bg-amber-50/20')}
                >
                  {SLOT_STARTS.map((m) => (
                    <div
                      key={m}
                      data-slot={`${v.id}@${m}`}
                      style={{ height: SLOT_HEIGHT }}
                      onClick={canEdit ? (e) => onSlotClick(v.id, m, e.timeStamp) : undefined}
                      title={canEdit ? `連點兩下在 ${minToTime(m)} 新增賽程` : undefined}
                      className={cn(
                        m % 60 === 0
                          ? 'border-b border-slate-300/70'
                          : m % 30 === 0
                            ? 'border-b border-slate-200'
                            : 'border-b border-dashed border-slate-100',
                        canEdit && 'hover:bg-blue-500/5',
                        newPreview && newPreview.col === venues.indexOf(v) && newPreview.startMin === m && 'bg-blue-500/15',
                      )}
                    />
                  ))}
                </div>
              ))}
            </div>

            {sorted.map((ev) => {
              const p = preview?.kind === 'event' && preview.eventId === ev.id ? preview : null;
              const cols = eventColumns(ev, venues);
              const startMin = p ? p.startMin : ev.startMin;
              const endMin = p ? p.endMin : ev.endMin;
              const shown = p ? { ...ev, startMin, endMin } : ev;
              const matched = hasActiveFilter ? matchesFilter(ev, filter) : true;
              return (
                <GridEventBlock
                  key={ev.id}
                  event={ev}
                  startMin={startMin}
                  endMin={endMin}
                  minCol={p ? p.minCol : cols.minCol}
                  span={cols.span}
                  columnCount={colCount}
                  nowMin={nowMin}
                  venueLabel={(ev.venueIds || []).join('~')}
                  selected={ev.id === props.selectedId}
                  filterState={hasActiveFilter ? (matched ? 'match' : 'dim') : 'none'}
                  checkInWarn={checkInOverlaps(allEvents, shown)}
                  showCrew={props.showCrew}
                  canEdit={canEdit}
                  dragging={Boolean(p)}
                  onSelect={() => {
                    if (props.consumeSuppressedClick()) return;
                    props.onSelect(ev.id);
                  }}
                  onBodyPointerDown={(e) => props.onEventPointerDown(e, ev, 'move')}
                  onResizePointerDown={(e, edge) => props.onEventPointerDown(e, ev, edge)}
                />
              );
            })}

            {/* 拖曳新增：放開位置預覽 */}
            {newPreview && (
              <div
                data-testid="grid-drop-preview"
                className="absolute z-30 pointer-events-none rounded-xl border-2 border-dashed border-blue-500 bg-blue-500/10 px-2 py-1 text-[11px] font-bold text-blue-700"
                style={{
                  top: minToY(newPreview.startMin) + 2,
                  height: (Math.min(NEW_EVENT_MINUTES, DAY_END_MIN - newPreview.startMin) / 10) * SLOT_HEIGHT - 4,
                  ...columnStyle(newPreview.col, 1, colCount),
                }}
              >
                新增於 {minToTime(newPreview.startMin)}
              </div>
            )}

            {/* 現在時間線（貫穿所有場地） */}
            {showNow && (
              <div
                data-testid="now-line"
                className="absolute inset-x-0 z-40 pointer-events-none flex items-center -translate-y-1/2"
                style={{ top: minToY(nowMin) }}
              >
                <div className="size-2.5 rounded-full bg-rose-600 -ml-1.5 shadow ring-2 ring-white" />
                <div className="flex-1 h-[2px] bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
                <span className="mr-2 px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-mono font-bold shadow">
                  {minToTime(Math.floor(nowMin))} LIVE
                </span>
              </div>
            )}

            {/* 空白狀態提示 */}
            {dayEvents.length === 0 && venues.length > 0 && (
              <div className="absolute inset-0 z-30 flex items-start justify-center pt-24 pointer-events-none p-6">
                <div className="bg-white/95 backdrop-blur-sm border border-dashed border-slate-300 rounded-2xl p-6 text-center max-w-sm shadow-sm">
                  <div className="size-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
                    <MousePointerClick className="size-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 mb-1">本日目前沒有賽程</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {canEdit ? (
                      <>
                        可以從右上角拖拉「<b>拖曳新增項目</b>」到任意時間格，或在空白時間格<b>連點兩下</b>建立賽程。
                      </>
                    ) : (
                      '管理者排定賽程後會自動顯示在這裡。'
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
