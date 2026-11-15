// I5：比賽日切換（chips：手機橫向晶片；list：電腦左側樹狀清單），讀寫 useSession().currentDayId
import { FolderOpen } from 'lucide-react';
import { useMemo } from 'react';
import { useCurrentDay } from '../../hooks/useCurrentDay';
import { useProject } from '../../stores/project';
import { useSession } from '../../stores/session';
import { Chip } from '../../ui/Chip';
import { cn } from '../../ui/cn';
import { groupByCategory } from './labels';

export interface DayPickerProps {
  layout?: 'chips' | 'list';
  /** 選擇後通知呼叫端（例如關閉面板） */
  onSelect?: (dayId: string) => void;
  className?: string;
}

export function DayPicker({ layout = 'chips', onSelect, className }: DayPickerProps) {
  const dates = useProject((s) => s.dates);
  const events = useProject((s) => s.events);
  const current = useCurrentDay();

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) m.set(e.dateId, (m.get(e.dateId) ?? 0) + 1);
    return m;
  }, [events]);

  const select = (id: string) => {
    const s = useSession.getState();
    if (s.currentDayId !== id) {
      s.setCurrentDay(id);
      s.selectEvent(null);
    }
    onSelect?.(id);
  };

  if (dates.length === 0) {
    return <p className={cn('text-sm text-slate-400', className)}>尚未建立比賽日</p>;
  }

  if (layout === 'chips') {
    return (
      <nav aria-label="比賽日" className={cn('-mx-1 flex min-w-0 gap-1.5 overflow-x-auto px-1 py-1 [scrollbar-width:none]', className)}>
        {dates.map((d) => (
          <Chip key={d.id} className="min-h-11" active={d.id === current?.id} aria-current={d.id === current?.id ? 'date' : undefined}
            onClick={() => select(d.id)}>
            {d.label || '未命名'}
          </Chip>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label="比賽日" className={cn('space-y-3', className)}>
      {groupByCategory(dates).map((g) => (
        <div key={g.category}>
          <div className="mb-1 flex items-center gap-1.5 px-2 text-xs font-bold text-slate-400">
            <FolderOpen className="size-3.5" aria-hidden />
            <span>{g.category}</span>
          </div>
          {g.items.length === 0 ? (
            <p className="px-2.5 text-xs text-slate-300">（無）</p>
          ) : (
            <ul className="space-y-1">
              {g.items.map((d) => {
                const active = d.id === current?.id;
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => select(d.id)}
                      aria-current={active ? 'date' : undefined}
                      className={cn(
                        'flex min-h-10 w-full items-center justify-between gap-2 rounded-xl px-2.5 text-left text-sm font-semibold transition-colors',
                        active ? 'border border-blue-200 bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100',
                      )}
                    >
                      <span className="min-w-0 truncate">{d.label || '未命名'}</span>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-1.5 py-0.5 text-[11px]',
                          active ? 'bg-blue-600 text-white' : 'bg-slate-200/70 text-slate-500',
                        )}
                        aria-label={`${counts.get(d.id) ?? 0} 個賽程`}
                      >
                        {counts.get(d.id) ?? 0}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </nav>
  );
}
