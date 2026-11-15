// 賽務細流表（舊版 rundownModal）：公文格式預覽、範圍（當日／全部）、CSV 匯出、列印／另存 A4 PDF
// 列印時只印 #print-root（見 index.css 的 @media print），畫面上的彈出層與其他內容都不會印出
import { Printer, Table } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { eventsOfDay } from '@shared/schedule';
import { formatRange } from '@shared/time';
import type { Day, GeneralStaff, ProjectData } from '@shared/types';
import { slotTypeLabel, venueNames } from '../components/common/labels';
import { useCanEdit } from '../hooks/useCanEdit';
import { useProject } from '../stores/project';
import { useSession } from '../stores/session';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import { eventColor } from '../ui/eventColors';
import { toast } from '../ui/Toast';
import { downloadText } from './download';
import {
  checkInText,
  GENERAL_STAFF_FIELDS,
  helperText,
  rundownDays,
  rundownFileName,
  rundownRows,
  rundownSlots,
  toCsv,
  validReferees,
  type RundownScope,
} from './exportData';

/** 細流表內容：工具列 + 文件預覽；放在 Modal 裡使用 */
export function RundownPanel() {
  const venues = useProject((s) => s.venues);
  const dates = useProject((s) => s.dates);
  const events = useProject((s) => s.events);
  const updateDay = useProject((s) => s.updateDay);
  const currentDayId = useSession((s) => s.currentDayId);
  const canEdit = useCanEdit();
  const [scope, setScope] = useState<RundownScope>('current');

  const data: ProjectData = { venues, dates, events };
  const days = rundownDays(dates, scope, currentDayId);

  const exportCsv = () => {
    downloadText(rundownFileName(), toCsv(rundownRows(data, days)), 'text/csv;charset=utf-8');
    toast('已匯出 Excel（.csv）細流表', 'success');
  };

  const setStaff = (day: Day, key: keyof GeneralStaff, value: string) =>
    updateDay(day.id, { generalStaff: { hosts: '', recorders: '', stageControl: '', ...day.generalStaff, [key]: value } });

  return (
    <div className="space-y-4" data-testid="rundown">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-bold" role="group" aria-label="細流表範圍">
          {(
            [
              ['current', '僅看本日'],
              ['all', '全部日期'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={scope === id}
              onClick={() => setScope(id)}
              className={cn(
                'min-h-9 rounded-lg px-3',
                scope === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-1 flex-wrap justify-end gap-2">
          <Button variant="success" icon={<Table className="size-4" />} onClick={exportCsv} disabled={days.length === 0}>
            匯出 Excel（.csv）
          </Button>
          <Button variant="primary" icon={<Printer className="size-4" />} onClick={() => window.print()} disabled={days.length === 0}>
            列印／另存 PDF
          </Button>
        </div>
      </div>

      <RundownDocument data={data} days={days} onStaffChange={canEdit ? setStaff : undefined} />

      {/* 列印用的副本：平常隱藏，列印時只印這一份（大會人員顯示為文字） */}
      {createPortal(
        <div id="print-root" className="hidden print:block">
          <RundownDocument data={data} days={days} print />
        </div>,
        document.body,
      )}
    </div>
  );
}

interface DocumentProps {
  data: ProjectData;
  days: Day[];
  /** 有傳入時大會人員可直接編輯（管理者） */
  onStaffChange?: (day: Day, key: keyof GeneralStaff, value: string) => void;
  print?: boolean;
}

/** 細流表文件本體（畫面預覽與列印共用） */
export function RundownDocument({ data, days, onStaffChange, print }: DocumentProps) {
  if (days.length === 0) {
    return <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">尚未建立比賽日</p>;
  }
  return (
    <div className="space-y-8 text-slate-800">
      {days.map((d, i) => {
        const dayEvents = eventsOfDay(data.events, d.id);
        const slots = rundownSlots(d);
        return (
          <section
            key={d.id}
            data-testid={print ? undefined : 'rundown-day'}
            className={cn(i > 0 && 'border-t-2 border-dashed border-slate-300 pt-8 print:break-before-page print:border-0 print:pt-0')}
          >
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b-2 border-slate-900 pb-3">
              <div className="min-w-0">
                {d.category && <span className="text-xs font-extrabold tracking-wider text-blue-600">{d.category}</span>}
                <h2 className="mt-0.5 text-xl font-black tracking-tight text-slate-900 break-words">{d.label} — 賽務工作細流表</h2>
              </div>
              <span className="text-xs font-semibold text-slate-500">共計 {dayEvents.length} 項賽程</span>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3 print:grid-cols-3">
              {GENERAL_STAFF_FIELDS.map((f) => (
                <label key={f.key} className="block min-w-0">
                  <span className="mb-1 block text-xs font-bold text-slate-500">{f.label}</span>
                  {onStaffChange ? (
                    <input
                      value={d.generalStaff?.[f.key] ?? ''}
                      placeholder={f.placeholder}
                      onChange={(e) => onStaffChange(d, f.key, e.target.value)}
                      className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <span className="block text-sm font-bold break-words">{d.generalStaff?.[f.key] || '—'}</span>
                  )}
                </label>
              ))}
            </div>

            {slots.length > 0 && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                <div className="mb-2 text-xs font-extrabold text-amber-900">司令台分時段任務（播報輪班／穿插頒獎）</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 print:grid-cols-2">
                  {slots.map((s) => (
                    <div key={s.id} className="rounded-lg border border-amber-200/80 bg-white px-3 py-2 text-xs break-inside-avoid">
                      <div className="mb-0.5 flex items-center justify-between gap-2 font-bold text-amber-800">
                        <span>{slotTypeLabel(s.type)}</span>
                        <span className="font-mono">{formatRange(s.startMin, s.endMin)}</span>
                      </div>
                      {s.staff && <div className="font-bold text-slate-800">{s.staff}</div>}
                      {s.content && <div className="text-slate-600">{s.content}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {dayEvents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-400">本日尚未排入任何賽程項目</div>
            ) : (
              <div className={cn('rounded-xl border border-slate-200', !print && 'overflow-x-auto')}>
                <table className={cn('w-full border-collapse text-left text-xs', !print && 'min-w-[44rem]')}>
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100 font-bold text-slate-700">
                      <th className="w-32 px-3 py-2.5">時間（開賽／檢錄）</th>
                      <th className="w-44 px-3 py-2.5">比賽項目與場地</th>
                      <th className="px-3 py-2.5">人力配置（裁判／公差／志工）</th>
                      <th className="w-48 px-3 py-2.5">器材與道次備註</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {dayEvents.map((ev) => {
                      const ci = checkInText(ev);
                      const refs = validReferees(ev);
                      const helpers = [
                        helperText('公差學生', ev.studentCount, ev.studentTask),
                        helperText('志工', ev.volunteerCount, ev.volunteerTask),
                      ].filter((t): t is string => t !== null);
                      return (
                        <tr key={ev.id} data-testid={print ? undefined : 'rundown-row'} className="break-inside-avoid align-top">
                          <td className={cn('border-l-4 px-3 py-3', eventColor(ev.color).border)}>
                            <div className="font-mono text-sm font-extrabold text-slate-900">{formatRange(ev.startMin, ev.endMin)}</div>
                            <div className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">
                              {ci ? `${ci} 檢錄` : '無提前檢錄'}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="text-sm font-extrabold leading-snug break-words text-slate-900">{ev.title || '未命名賽程'}</div>
                            <div className="mt-1 inline-block rounded-md bg-blue-50 px-2 py-0.5 font-bold text-blue-700">
                              {venueNames(ev, data.venues).join('、') || '未指定場地'}
                            </div>
                          </td>
                          <td className="space-y-1.5 px-3 py-3">
                            {refs.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {refs.map((r, idx) => (
                                  <span key={idx} className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 font-semibold">
                                    {r.role && <span className="text-slate-500">{r.role}：</span>}
                                    {r.name || '待定'}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <div className="text-slate-400">未指定裁判</div>
                            )}
                            {helpers.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {helpers.map((t) => (
                                  <span key={t} className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-bold text-emerald-800">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="space-y-1 px-3 py-3 text-slate-600">
                            {(ev.equipment || []).length > 0 && <div className="font-semibold text-slate-800">{ev.equipment.join('、')}</div>}
                            {ev.laneNote && <div className="leading-relaxed break-words text-slate-500">{ev.laneNote}</div>}
                            {!(ev.equipment || []).length && !ev.laneNote && <span className="text-slate-400">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
