// I5：篩選列（年級晶片、場地、人員搜尋），讀寫 useSession().filter
import { Search, X } from 'lucide-react';
import { useId, useMemo } from 'react';
import { GRADE_BLOCKS } from '@shared/constants';
import { peopleOfDay } from '@shared/schedule';
import { useCurrentDay } from '../../hooks/useCurrentDay';
import { useProject } from '../../stores/project';
import { useSession } from '../../stores/session';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { cn } from '../../ui/cn';
import { SelectField } from '../../ui/Field';

export interface FilterBarProps {
  /** horizontal：電腦版單列；stacked：手機篩選面板 */
  layout?: 'horizontal' | 'stacked';
}

/** 人員晶片最多顯示幾個（與舊版相同） */
const MAX_PEOPLE = 18;

export function FilterBar({ layout = 'horizontal' }: FilterBarProps) {
  const filter = useSession((s) => s.filter);
  const setFilter = useSession((s) => s.setFilter);
  const clearFilter = useSession((s) => s.clearFilter);
  const venues = useProject((s) => s.venues);
  const events = useProject((s) => s.events);
  const day = useCurrentDay();
  const uid = useId();

  const people = useMemo(
    () => (day ? peopleOfDay(events, day.id, day).slice(0, MAX_PEOPLE) : []),
    [events, day],
  );
  const active = Boolean(filter.grade || filter.venueId || filter.query.trim());
  const stacked = layout === 'stacked';
  const chipCls = stacked ? 'min-h-11' : undefined;
  const q = filter.query.trim();

  const gradeChips = (
    <div role="group" aria-labelledby={`${uid}-grade`} className="flex flex-wrap gap-1.5">
      {GRADE_BLOCKS.map((g) => (
        <Chip key={g.id} className={chipCls} active={filter.grade === g.id}
          onClick={() => setFilter({ grade: filter.grade === g.id ? null : g.id })}>
          {g.label}
        </Chip>
      ))}
    </div>
  );

  const venueSelect = (
    <SelectField label="場地" value={filter.venueId ?? ''} className={stacked ? undefined : 'w-48 shrink-0'}
      onChange={(e) => setFilter({ venueId: e.target.value || null })}>
      <option value="">全部場地</option>
      {venues.map((v) => (
        <option key={v.id} value={v.id}>
          {v.name}
        </option>
      ))}
    </SelectField>
  );

  const searchInput = (
    <div className={stacked ? undefined : 'w-56 shrink-0'}>
      <label htmlFor={`${uid}-q`} className="mb-1 block text-sm font-semibold text-slate-700">
        人員搜尋
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          id={`${uid}-q`}
          type="search"
          value={filter.query}
          placeholder="老師姓名、職務或項目"
          onChange={(e) => setFilter({ query: e.target.value })}
          className="min-h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  );

  const peopleChips = people.length > 0 && (
    <div role="group" aria-label="常見人員" className={cn('flex gap-1.5', stacked ? 'flex-wrap' : 'min-w-0 overflow-x-auto pb-1')}>
      {people.map((name) => (
        <Chip key={name} className={chipCls} active={q === name} onClick={() => setFilter({ query: q === name ? '' : name })}>
          {name}
        </Chip>
      ))}
    </div>
  );

  const clearBtn = (
    <Button variant="ghost" size={stacked ? 'md' : 'sm'} icon={<X className="size-4" />} disabled={!active} onClick={clearFilter}>
      清除篩選
    </Button>
  );

  if (stacked) {
    return (
      <div className="space-y-4">
        <section>
          <h3 id={`${uid}-grade`} className="mb-1.5 text-sm font-semibold text-slate-700">年級</h3>
          {gradeChips}
        </section>
        {venueSelect}
        <section className="space-y-2">
          {searchInput}
          {peopleChips}
        </section>
        <div className="flex justify-end">{clearBtn}</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <span id={`${uid}-grade`} className="mb-1 block text-sm font-semibold text-slate-700">年級</span>
          {gradeChips}
        </div>
        {venueSelect}
        {searchInput}
        <div className="pb-1.5">{clearBtn}</div>
      </div>
      {peopleChips}
    </div>
  );
}
