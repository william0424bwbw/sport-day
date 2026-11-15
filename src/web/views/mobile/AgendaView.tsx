// 手機「賽程」：可收合的篩選面板 + 依小時分組的賽程卡片
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { useId, useState } from 'react';
import { eventsOfDay, matchesFilter } from '@shared/schedule';
import { minToTime } from '@shared/time';
import type { ScheduleEvent } from '@shared/types';
import { EventCard } from '../../components/event/EventCard';
import { FilterBar } from '../../components/filters/FilterBar';
import { useCurrentDay } from '../../hooks/useCurrentDay';
import { useProject } from '../../stores/project';
import { useSession } from '../../stores/session';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { PageTitle } from './parts';

/** 依開始時間的小時分組（輸入已排序） */
function groupByHour(events: ScheduleEvent[]): { hour: number; events: ScheduleEvent[] }[] {
  const groups: { hour: number; events: ScheduleEvent[] }[] = [];
  for (const ev of events) {
    const hour = Math.floor(ev.startMin / 60);
    const last = groups[groups.length - 1];
    if (last && last.hour === hour) last.events.push(ev);
    else groups.push({ hour, events: [ev] });
  }
  return groups;
}

export function AgendaView() {
  const day = useCurrentDay();
  const events = useProject((s) => s.events);
  const filter = useSession((s) => s.filter);
  const clearFilter = useSession((s) => s.clearFilter);
  const selectEvent = useSession((s) => s.selectEvent);
  const [filterOpen, setFilterOpen] = useState(false);
  const panelId = useId();

  if (!day) return null;
  const all = eventsOfDay(events, day.id);
  const shown = all.filter((ev) => matchesFilter(ev, filter));
  const activeCount = [filter.grade, filter.venueId, filter.query.trim()].filter(Boolean).length;

  return (
    <div className="space-y-3">
      <PageTitle
        title="賽程"
        aside={
          <span className="text-sm text-slate-500" data-testid="agenda-count">
            {activeCount ? `${shown.length} / ${all.length} 項` : `共 ${all.length} 項`}
          </span>
        }
      />

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-1 pr-2">
          <button
            type="button"
            aria-expanded={filterOpen}
            aria-controls={panelId}
            onClick={() => setFilterOpen((v) => !v)}
            className="flex min-h-12 flex-1 items-center gap-2 px-3 text-left text-sm font-semibold text-slate-700"
          >
            <SlidersHorizontal className="size-4 shrink-0" aria-hidden />
            <span>篩選</span>
            {activeCount > 0 && (
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">{activeCount}</span>
            )}
            <ChevronDown className={cn('ml-auto size-5 shrink-0 transition-transform', filterOpen && 'rotate-180')} aria-hidden />
          </button>
          {activeCount > 0 && (
            <Button variant="ghost" onClick={clearFilter}>
              清除
            </Button>
          )}
        </div>
        {filterOpen && (
          <div id={panelId} data-testid="filter-panel" className="min-w-0 border-t border-slate-100 p-3">
            <FilterBar layout="stacked" />
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          {all.length === 0 ? '這一天還沒有賽程' : '沒有符合篩選條件的賽程'}
        </p>
      ) : (
        groupByHour(shown).map((g) => (
          <section key={g.hour} className="space-y-2" aria-label={`${minToTime(g.hour * 60)} 時段`}>
            <h2 className="text-xs font-bold tracking-wide text-slate-500">{minToTime(g.hour * 60)}</h2>
            <ul className="space-y-2" data-testid="agenda-list">
              {g.events.map((ev) => (
                <li key={ev.id} className="min-w-0">
                  <EventCard event={ev} variant="full" onClick={() => selectEvent(ev.id)} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
