// 手機「場地」：選場地 + 單一場地 07:00–17:00 直向時間軸
// 管理者：長按賽程拖曳移動、拖曳上下邊緣調整長度、點空白處新增
import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { DAY_END_MIN, DAY_START_MIN, END_HOUR, START_HOUR, STEP_MINUTES } from '@shared/constants';
import { checkInOverlaps, checkInStart, eventStatus, eventsOfDay } from '@shared/schedule';
import { formatRange, minToTime } from '@shared/time';
import type { ScheduleEvent } from '@shared/types';
import { useCanEdit } from '../../hooks/useCanEdit';
import { useCurrentDay } from '../../hooks/useCurrentDay';
import { useNowMin } from '../../hooks/useNowMin';
import { useProject } from '../../stores/project';
import { useSession } from '../../stores/session';
import { Chip } from '../../ui/Chip';
import { cn } from '../../ui/cn';
import { eventColor } from '../../ui/eventColors';
import { toast } from '../../ui/Toast';
import { useMobileUi, useMobileVenue } from './mobileUi';
import { PageTitle } from './parts';
import { layoutLanes, NEW_EVENT_DURATION } from './slots';
import { useTimelineDrag, type DragPreview } from './useTimelineDrag';

/** 每分鐘幾 px（與舊版相近：10 分鐘 = 20px） */
const PX_PER_MIN = 2;
const TIMELINE_HEIGHT = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
const y = (min: number) => (min - DAY_START_MIN) * PX_PER_MIN;

// 10 分鐘細線 + 整點粗線
const GRID_STYLE = {
  height: TIMELINE_HEIGHT,
  backgroundImage: [
    `repeating-linear-gradient(to bottom, rgb(203 213 225) 0 1px, transparent 1px ${60 * PX_PER_MIN}px)`,
    `repeating-linear-gradient(to bottom, rgb(241 245 249) 0 1px, transparent 1px ${STEP_MINUTES * PX_PER_MIN}px)`,
  ].join(','),
};

export function VenueView() {
  const day = useCurrentDay();
  const venues = useProject((s) => s.venues);
  const venue = useMobileVenue();
  const setVenueId = useMobileUi((s) => s.setVenueId);
  const canEdit = useCanEdit();

  if (!day) return null;

  return (
    <div className="space-y-3">
      <PageTitle title="場地時間軸" />
      {venues.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          還沒有場地，請到「設定」新增
        </p>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="選擇場地">
            {venues.map((v) => (
              <Chip key={v.id} active={v.id === venue?.id} onClick={() => setVenueId(v.id)} className="min-h-11">
                {v.name}
              </Chip>
            ))}
          </div>
          {venue && (
            <>
              {venue.subtitle && <p className="text-sm text-slate-500">{venue.subtitle}</p>}
              {canEdit && (
                <p className="text-xs text-slate-500">長按賽程可拖曳改時間，拖曳上下邊緣調整長度，點空白處新增。</p>
              )}
              <VenueTimeline dayId={day.id} venueId={venue.id} canEdit={canEdit} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function VenueTimeline({ dayId, venueId, canEdit }: { dayId: string; venueId: string; canEdit: boolean }) {
  const allEvents = useProject((s) => s.events);
  const moveEvent = useProject((s) => s.moveEvent);
  const setEventTime = useProject((s) => s.setEventTime);
  const selectEvent = useSession((s) => s.selectEvent);
  const openEditor = useMobileUi((s) => s.openEditor);
  const nowMin = useNowMin();
  const containerRef = useRef<HTMLDivElement>(null);

  const dayEvents = eventsOfDay(allEvents, dayId);
  const events = dayEvents.filter((e) => (e.venueIds || []).includes(venueId));

  const { preview, start, consumeDragClick } = useTimelineDrag({
    pxPerMin: PX_PER_MIN,
    enabled: canEdit,
    onCommit: (p: DragPreview) => {
      if (p.mode === 'move') moveEvent(p.id, p.startMin);
      else setEventTime(p.id, p.startMin, p.endMin);
      toast(`已調整為 ${formatRange(p.startMin, p.endMin)}`, 'success');
    },
  });

  // 拖曳中的賽程用預覽時間排版
  const shown = events.map((ev) =>
    preview && preview.id === ev.id ? { ...ev, startMin: preview.startMin, endMin: preview.endMin } : ev,
  );
  const lanes = layoutLanes(shown);

  // 切換場地或日期時，捲動到現在時間（不在當日範圍時捲到第一個賽程）
  const firstStart = events[0]?.startMin;
  const nowInDay = nowMin >= DAY_START_MIN && nowMin <= DAY_END_MIN;
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const target = nowInDay ? nowMin : firstStart;
    if (target === undefined) return;
    const top = el.getBoundingClientRect().top + window.scrollY + y(target) - window.innerHeight / 3;
    window.scrollTo({ top: Math.max(0, top) });
    // 只在場地／日期切換時捲動，時間前進時不打擾使用者
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayId, venueId]);

  const onBackgroundClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!canEdit || e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = DAY_START_MIN + (e.clientY - rect.top) / PX_PER_MIN;
    const startMin = Math.min(
      DAY_END_MIN - STEP_MINUTES,
      Math.max(DAY_START_MIN, Math.floor(raw / STEP_MINUTES) * STEP_MINUTES),
    );
    openEditor({
      init: { dateId: dayId, venueIds: [venueId], startMin, endMin: Math.min(DAY_END_MIN, startMin + NEW_EVENT_DURATION) },
    });
  };

  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white py-3 pr-1 shadow-sm">
      <div ref={containerRef} className="relative" style={{ height: TIMELINE_HEIGHT }} data-testid="venue-timeline">
        {/* 時間刻度 */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-12" aria-hidden>
          {HOURS.map((h) => (
            <span
              key={h}
              className="absolute right-2 -translate-y-1/2 text-[11px] font-semibold tabular-nums text-slate-400"
              style={{ top: y(h * 60) }}
            >
              {minToTime(h * 60)}
            </span>
          ))}
        </div>

        {/* 賽程區：點空白處新增 */}
        <div
          className={cn('absolute inset-y-0 right-0 left-12', canEdit && 'cursor-copy')}
          style={GRID_STYLE}
          onClick={onBackgroundClick}
          data-testid="venue-timeline-area"
        >
          {shown.map((ev) => {
            const lane = lanes.get(ev.id) ?? { lane: 0, lanes: 1 };
            return (
              <TimelineBlock
                key={ev.id}
                event={ev}
                lane={lane.lane}
                lanes={lane.lanes}
                dragging={preview?.id === ev.id ? preview.mode : null}
                warn={checkInOverlaps(dayEvents, ev)}
                status={eventStatus(ev, nowMin)}
                canEdit={canEdit}
                onPointerDown={(e, mode) => start(e, ev, mode)}
                onOpen={() => {
                  if (!consumeDragClick()) selectEvent(ev.id);
                }}
              />
            );
          })}

          {nowInDay && (
            <div className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-rose-500" style={{ top: y(nowMin) }} aria-hidden>
              <span className="absolute -top-2.5 right-0 rounded bg-rose-500 px-1 text-[10px] font-bold text-white tabular-nums">
                {minToTime(Math.floor(nowMin))}
              </span>
            </div>
          )}
        </div>
      </div>
      {events.length === 0 && (
        <p className="pointer-events-none absolute inset-x-12 top-16 text-center text-sm text-slate-400">
          這個場地當天沒有賽程{canEdit ? '，點時間軸空白處新增' : ''}
        </p>
      )}
    </div>
  );
}

function TimelineBlock({
  event: ev,
  lane,
  lanes,
  dragging,
  warn,
  status,
  canEdit,
  onPointerDown,
  onOpen,
}: {
  event: ScheduleEvent;
  lane: number;
  lanes: number;
  dragging: DragPreview['mode'] | null;
  warn: boolean;
  status: ReturnType<typeof eventStatus>;
  canEdit: boolean;
  onPointerDown: (e: PointerEvent, mode: DragPreview['mode']) => void;
  onOpen: () => void;
}) {
  const color = eventColor(ev.color);
  const ci = checkInStart(ev);
  const height = Math.max(STEP_MINUTES * PX_PER_MIN, (ev.endMin - ev.startMin) * PX_PER_MIN);
  const left = `calc(${(lane / lanes) * 100}% + 2px)`;
  const width = `calc(${100 / lanes}% - 4px)`;
  const tall = ev.endMin - ev.startMin >= 30;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };

  return (
    <>
      {/* 檢錄緩衝區 */}
      {ci < ev.startMin && (
        <div
          className={cn(
            'pointer-events-none absolute rounded-t-md border border-b-0 border-dashed',
            warn ? 'checkin-stripes-warn border-amber-400' : 'checkin-stripes border-slate-300',
          )}
          style={{ top: y(ci), height: (ev.startMin - ci) * PX_PER_MIN, left, width }}
          aria-hidden
        >
          {(ev.startMin - ci) * PX_PER_MIN >= 14 && (
            <span className={cn('block truncate px-1 text-[10px] font-semibold leading-3', warn ? 'text-amber-700' : 'text-slate-500')}>
              {warn ? '檢錄重疊' : '檢錄'} {minToTime(ci)}
            </span>
          )}
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        aria-label={`${ev.title || '未命名賽程'} ${formatRange(ev.startMin, ev.endMin)}`}
        data-testid={`venue-event-${ev.id}`}
        data-start={ev.startMin}
        data-end={ev.endMin}
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => onPointerDown(e, 'move')}
        onContextMenu={(e) => canEdit && e.preventDefault()}
        className={cn(
          'absolute rounded-md border-l-4 shadow-sm select-none [-webkit-touch-callout:none]',
          color.border,
          color.bg,
          color.text,
          status === 'done' && !dragging && 'opacity-60',
          status === 'live' && 'ring-2 ring-emerald-500',
          dragging && 'z-30 shadow-xl ring-2 ring-blue-500',
          dragging === 'move' && 'scale-[1.02] opacity-95',
        )}
        style={{ top: y(ev.startMin), height, left, width }}
      >
        <div className="h-full overflow-hidden px-1.5 py-0.5">
          <p className="truncate text-[11px] font-bold leading-4 tabular-nums">
            {formatRange(ev.startMin, ev.endMin)}
            {(ev.venueIds || []).length > 1 && <span className="ml-1 font-normal opacity-70">跨 {ev.venueIds.length} 場地</span>}
          </p>
          {height >= 36 && <p className="line-clamp-2 text-xs font-semibold leading-4">{ev.title}</p>}
        </div>

        {dragging && (
          <span className="pointer-events-none absolute -top-6 left-0 rounded bg-blue-600 px-1.5 py-0.5 text-xs font-bold text-white tabular-nums shadow">
            {formatRange(ev.startMin, ev.endMin)}
          </span>
        )}

        {canEdit && tall && (
          <ResizeHandle edge="start" onPointerDown={(e) => onPointerDown(e, 'resize-start')} />
        )}
        {canEdit && <ResizeHandle edge="end" onPointerDown={(e) => onPointerDown(e, 'resize-end')} />}
      </div>
    </>
  );
}

/** 上／下邊緣把手：觸控區域往外延伸，按下立即開始調整（不會捲動畫面） */
function ResizeHandle({ edge, onPointerDown }: { edge: 'start' | 'end'; onPointerDown: (e: PointerEvent) => void }) {
  return (
    <div
      aria-hidden
      data-testid={edge === 'end' ? 'resize-end' : 'resize-start'}
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'absolute inset-x-2 z-10 flex h-4 cursor-ns-resize items-center justify-center touch-none',
        edge === 'end' ? '-bottom-2' : '-top-2',
      )}
    >
      <span className="h-1 w-8 rounded-full bg-slate-500/50" />
    </div>
  );
}
