// I5：比賽日管理（新增、改名、分類、刪除）與大會人員（主持、紀錄、場控）
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Day, GeneralStaff } from '@shared/types';
import { useCanEdit } from '../../hooks/useCanEdit';
import { useProject } from '../../stores/project';
import { useSession } from '../../stores/session';
import { Button, IconButton } from '../../ui/Button';
import { confirmDialog } from '../../ui/ConfirmDialog';
import { SelectField, TextField } from '../../ui/Field';
import { toast } from '../../ui/Toast';
import { DAY_CATEGORIES, groupByCategory } from '../common/labels';

const STAFF_FIELDS: { key: keyof GeneralStaff; label: string; placeholder: string }[] = [
  { key: 'hosts', label: '司儀主持', placeholder: '例如：佩琳、珠芸' },
  { key: 'recorders', label: '成績紀錄', placeholder: '例如：美蓉、郁婷' },
  { key: 'stageControl', label: '大會場控', placeholder: '例如：合萍｜拍照：志工*2' },
];

function categoryOptions(dates: Day[]): string[] {
  const out = [...DAY_CATEGORIES];
  for (const d of dates) if (d.category && !out.includes(d.category)) out.push(d.category);
  return out;
}

function DayRow({ day, count, categories }: { day: Day; count: number; categories: string[] }) {
  const update = (patch: Partial<Day>) => useProject.getState().updateDay(day.id, patch);
  const staff = day.generalStaff ?? {};

  const remove = async () => {
    if (useProject.getState().dates.length <= 1) {
      toast('至少需保留一個比賽日', 'error');
      return;
    }
    const ok = await confirmDialog({
      title: '刪除比賽日？',
      message: count
        ? `確定要刪除「${day.label}」嗎？這一天的 ${count} 個賽程也會一起刪除，無法復原。`
        : `確定要刪除「${day.label}」嗎？`,
      confirmText: '刪除',
      danger: true,
    });
    if (!ok) return;
    useProject.getState().deleteDay(day.id);
    toast(`已刪除比賽日「${day.label}」`);
  };

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_12rem]">
          <TextField label="名稱" value={day.label} hint={`${count} 個賽程`} onChange={(e) => update({ label: e.target.value })} />
          <SelectField label="分類" value={day.category ?? ''} onChange={(e) => update({ category: e.target.value })}>
            {!day.category && <option value="">（未分類）</option>}
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>
        </div>
        <IconButton label={`刪除比賽日 ${day.label}`} className="mt-6 shrink-0 hover:text-rose-600" onClick={() => void remove()}>
          <Trash2 className="size-4" />
        </IconButton>
      </div>
      <details className="group mt-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-slate-600 [&::-webkit-details-marker]:hidden">
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
          大會人員
        </summary>
        <div className="grid gap-2 pt-1 sm:grid-cols-3">
          {STAFF_FIELDS.map((f) => (
            <TextField key={f.key} label={f.label} value={staff[f.key] ?? ''} placeholder={f.placeholder}
              onChange={(e) => update({ generalStaff: { hosts: '', recorders: '', stageControl: '', ...staff, [f.key]: e.target.value } })} />
          ))}
        </div>
      </details>
    </li>
  );
}

function AddDayForm({ categories }: { categories: string[] }) {
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState(DAY_CATEGORIES[1]);

  const add = () => {
    const text = label.trim();
    if (!text) {
      toast('請輸入比賽日名稱', 'error');
      return;
    }
    const id = useProject.getState().addDay({
      label: text,
      category,
      commandDeckEnabled: false,
      generalStaff: { hosts: '', recorders: '', stageControl: '' },
      commandSlots: [],
    });
    useSession.getState().setCurrentDay(id);
    useSession.getState().selectEvent(null);
    setLabel('');
    toast(`已新增比賽日：${text}`, 'success');
  };

  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
      <h3 className="mb-2 text-sm font-bold text-slate-800">新增比賽日</h3>
      <div className="grid gap-2 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <TextField label="比賽日名稱" value={label} placeholder="例如：12/19 (六) 正式賽"
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }} />
        <SelectField label="比賽日分類" value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </SelectField>
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={add}>
          新增比賽日
        </Button>
      </div>
    </div>
  );
}

export function DayManager() {
  const dates = useProject((s) => s.dates);
  const events = useProject((s) => s.events);
  const canEdit = useCanEdit();
  const categories = categoryOptions(dates);
  const count = (id: string) => events.filter((e) => e.dateId === id).length;

  if (!canEdit) {
    return (
      <div className="space-y-4">
        {groupByCategory(dates).map((g) => (
          <section key={g.category}>
            <h3 className="mb-1.5 text-sm font-bold text-slate-500">{g.category}</h3>
            <ul className="space-y-2">
              {g.items.map((d) => (
                <li key={d.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                  <div className="flex justify-between gap-2 font-semibold">
                    <span className="min-w-0 break-words">{d.label}</span>
                    <span className="shrink-0 text-slate-400">{count(d.id)} 個賽程</span>
                  </div>
                  {STAFF_FIELDS.some((f) => d.generalStaff?.[f.key]) && (
                    <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-slate-600">
                      {STAFF_FIELDS.filter((f) => d.generalStaff?.[f.key]).map((f) => (
                        <div key={f.key} className="contents">
                          <dt className="text-slate-400">{f.label}</dt>
                          <dd className="min-w-0 break-words">{d.generalStaff?.[f.key]}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              ))}
              {g.items.length === 0 && <li className="text-sm text-slate-300">（無）</li>}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groupByCategory(dates).map((g) => (
        <section key={g.category}>
          <h3 className="mb-1.5 text-sm font-bold text-slate-500">{g.category}</h3>
          {g.items.length === 0 ? (
            <p className="text-sm text-slate-300">（無）</p>
          ) : (
            <ul className="space-y-2">
              {g.items.map((d) => (
                <DayRow key={d.id} day={d} count={count(d.id)} categories={categories} />
              ))}
            </ul>
          )}
        </section>
      ))}
      <AddDayForm categories={categories} />
    </div>
  );
}
