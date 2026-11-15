// 中欄：當日標題、時間線控制器、新增積木、篩選列、司令台中控列、時間 × 場地格狀表
import { GripVertical, Lock, Mic, SquarePlus } from 'lucide-react';
import { useRef } from 'react';
import { eventsOfDay } from '@shared/schedule';
import { minToTime } from '@shared/time';
import type { Day } from '@shared/types';
import { FilterBar } from '../../components/filters/FilterBar';
import { CommandDeck } from '../../components/manage/CommandDeck';
import { useCanEdit } from '../../hooks/useCanEdit';
import { useNowMin } from '../../hooks/useNowMin';
import { useProject } from '../../stores/project';
import { useSession } from '../../stores/session';
import { cn } from '../../ui/cn';
import { toast } from '../../ui/Toast';
import { TimeControls } from './TimeControls';
import { TimelineGrid } from './TimelineGrid';
import { useGridDrag } from './useGridDrag';

export interface CenterPaneProps {
  day: Day;
  /** 新增賽程後開啟編輯表單 */
  onOpenEditor: (eventId: string) => void;
}

export function CenterPane({ day, onOpenEditor }: CenterPaneProps) {
  const venues = useProject((s) => s.venues);
  const events = useProject((s) => s.events);
  const role = useSession((s) => s.role);
  const filter = useSession((s) => s.filter);
  const selectedId = useSession((s) => s.selectedEventId);
  const selectEvent = useSession((s) => s.selectEvent);
  const canEdit = useCanEdit();
  const nowMin = useNowMin();
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const dayEvents = eventsOfDay(events, day.id);

  /** 舊版 createNewEventAt：建立 40 分鐘的新項目並選取，接著開啟編輯表單 */
  const createAt = (venueId: string, startMin: number) => {
    const id = useProject.getState().addEvent({ dateId: day.id, venueIds: [venueId], startMin });
    selectEvent(id);
    onOpenEditor(id);
    toast(`已新增項目（${minToTime(startMin)}）`, 'success');
  };

  const drag = useGridDrag({
    canvasRef,
    scrollRef,
    venues,
    onMove: (id, startMin, venueId) => {
      useProject.getState().moveEvent(id, startMin, venueId);
      selectEvent(id);
      const ev = useProject.getState().events.find((e) => e.id === id);
      toast(`已移動至 ${minToTime(ev?.startMin ?? startMin)}`);
    },
    onResize: (id, startMin, endMin) => {
      useProject.getState().setEventTime(id, startMin, endMin);
      const ev = useProject.getState().events.find((e) => e.id === id);
      toast(`已調整時間：${minToTime(ev?.startMin ?? startMin)} - ${minToTime(ev?.endMin ?? endMin)}`);
    },
    onCreate: createAt,
    onToolboxClick: () => toast('把積木拖到下方格狀表的時間格上放開，即可新增賽程'),
  });

  const ghost = drag.preview?.kind === 'new' ? drag.preview : null;

  return (
    <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-slate-50/70 relative">
      {/* 畫布頂部控制列 */}
      <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {day.category && (
            <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-indigo-100 text-indigo-700">{day.category}</span>
          )}
          <h2 data-testid="day-title" className="text-base font-bold text-slate-900">
            {day.label}
          </h2>
          <span data-testid="event-count" className="text-xs text-slate-400 font-medium">
            {dayEvents.length} 個項目
          </span>
          {canEdit && !day.commandDeckEnabled && (
            <button
              type="button"
              onClick={() => useProject.getState().updateDay(day.id, { commandDeckEnabled: true })}
              title="為本日開啟置頂司令台播報與穿插頒獎中控列"
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-amber-50 text-slate-600 hover:text-amber-700 border border-slate-200 hover:border-amber-200 text-xs font-semibold transition-colors"
            >
              <Mic className="size-3.5 text-amber-500" />
              <span>+ 啟用司令台中控</span>
            </button>
          )}
        </div>

        <TimeControls />

        {canEdit ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 hidden xl:inline">拖拉積木或連點兩下時間格新增：</span>
            <div
              role="button"
              tabIndex={0}
              data-testid="toolbox-new-event"
              onPointerDown={drag.startToolboxDrag}
              title="拖曳到下方時間格放開即可新增賽程"
              className={cn(
                'cursor-grab active:cursor-grabbing touch-none select-none flex items-center gap-2 px-3 py-1.5 rounded-xl',
                'bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-bold shadow-sm hover:shadow-md transition-shadow',
                ghost && 'opacity-50',
              )}
            >
              <GripVertical className="size-3.5 text-blue-200" />
              <SquarePlus className="size-3.5" />
              <span>拖曳新增項目</span>
            </div>
          </div>
        ) : (
          <div data-testid="readonly-banner" className="flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-600">
            <Lock className="size-3.5 text-slate-400" />
            <span>唯讀檢視中：點擊賽程方塊可看細節與道次表</span>
          </div>
        )}
      </div>

      {/* 篩選列（導師：年級；工作人員／管理者：人員搜尋） */}
      <div className="bg-white/95 border-b border-slate-200 px-4 py-1.5 shrink-0">
        <FilterBar layout="horizontal" />
      </div>

      {day.commandDeckEnabled && (
        <div className="shrink-0 z-20">
          <CommandDeck dayId={day.id} layout="strip" />
        </div>
      )}

      {venues.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-500 p-6">
          尚未設定場地{canEdit ? '，請先從上方「管理場地」新增場地。' : '。'}
        </div>
      ) : (
        <TimelineGrid
          scrollRef={scrollRef}
          canvasRef={canvasRef}
          venues={venues}
          allEvents={events}
          dayEvents={dayEvents}
          filter={filter}
          showCrew={role !== 'teacher'}
          canEdit={canEdit}
          selectedId={selectedId}
          nowMin={nowMin}
          preview={drag.preview}
          onSelect={selectEvent}
          onCreateAt={createAt}
          onEventPointerDown={drag.startEventDrag}
          consumeSuppressedClick={drag.consumeSuppressedClick}
        />
      )}

      {/* 拖曳積木時跟著指標的小卡 */}
      {ghost && (
        <div
          aria-hidden
          className="fixed z-[90] pointer-events-none -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-lg"
          style={{ left: ghost.clientX, top: ghost.clientY }}
        >
          <SquarePlus className="size-3.5" />
          {ghost.inside ? `放開新增於 ${minToTime(ghost.startMin)}` : '拖到時間格上'}
        </div>
      )}
    </main>
  );
}
