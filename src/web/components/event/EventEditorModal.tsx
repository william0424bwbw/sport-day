// I5：新增／編輯賽程表單（手機全螢幕、電腦對話框）
// 編輯草稿，按「儲存」才寫入 store；取消則捨棄
import { Check, Plus, X } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { COLOR_OPTIONS, EQUIPMENT_PRESETS, REFEREE_ROLE_PRESETS } from '@shared/constants';
import { createEvent } from '@shared/schedule';
import type { Attachment, Referee, ScheduleEvent } from '@shared/types';
import { useProject } from '../../stores/project';
import { useSession } from '../../stores/session';
import { Button, IconButton } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { cn } from '../../ui/cn';
import { eventColor } from '../../ui/eventColors';
import { FieldLabel, NumberField, SelectField, TextArea, TextField, TimeSelect, Toggle } from '../../ui/Field';
import { Modal } from '../../ui/Modal';
import { toast } from '../../ui/Toast';
import { AttachmentList, AttachmentUploader } from './Attachments';
import { addItem, moveStartKeepDuration, toggleItem, toggleVenue, validateDraft, type EventDraft } from './editorUtils';

export interface EventEditorModalProps {
  open: boolean;
  onClose: () => void;
  /** 編輯既有賽程 */
  eventId?: string;
  /** 新增賽程的初始值（例如點擊格狀表空白處帶入的日期、場地、時間） */
  init?: Partial<ScheduleEvent> & { dateId: string; venueIds: string[]; startMin: number };
  /** 新增成功後回傳新 id */
  onSaved?: (id: string) => void;
}

export function EventEditorModal(props: EventEditorModalProps) {
  // 關閉時整個卸載：每次開啟都重新建立草稿
  if (!props.open) return null;
  return <EditorInner key={props.eventId ?? 'new'} {...props} />;
}

/** 建立草稿：編輯時複製既有賽程，新增時用 createEvent 的預設值 */
function initialDraft(eventId: string | undefined, init: EventEditorModalProps['init']): EventDraft | null {
  const { events, dates, venues } = useProject.getState();
  if (eventId) {
    const ev = events.find((e) => e.id === eventId);
    return ev ? structuredClone(ev) : null;
  }
  const currentDayId = useSession.getState().currentDayId;
  const dateId = init?.dateId ?? (dates.find((d) => d.id === currentDayId) ?? dates[0])?.id ?? '';
  const venueIds = init?.venueIds?.length ? init.venueIds : venues[0] ? [venues[0].id] : [];
  return createEvent({ title: '', ...init, dateId, venueIds, startMin: init?.startMin ?? 540 }, 'draft');
}

function Group({ title, children, hint }: { title: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <fieldset className="space-y-3 border-t border-slate-100 pt-4 first:border-t-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden className="flex items-baseline justify-between gap-2">
        <span className="text-base font-bold text-slate-900">{title}</span>
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
      </div>
      {children}
    </fieldset>
  );
}

function EditorInner({ onClose, eventId, init, onSaved }: EventEditorModalProps) {
  const dates = useProject((s) => s.dates);
  const venues = useProject((s) => s.venues);
  const [draft, setDraft] = useState<EventDraft | null>(() => initialDraft(eventId, init));
  const [error, setError] = useState<string | null>(null);
  const [customEq, setCustomEq] = useState('');
  const uid = useId();
  const roleListId = `${uid}-roles`;
  const colorLabelId = `${uid}-color`;
  const venueLabelId = `${uid}-venue`;

  const isNew = !eventId;
  const title = isNew ? '新增賽程' : '編輯賽程';

  if (!draft) {
    return (
      <Modal open onClose={onClose} title={title} variant="fullscreen" footer={<Button onClick={onClose}>取消</Button>}>
        <p className="text-sm text-slate-500">找不到這個賽程（可能已被其他裝置刪除）。</p>
      </Modal>
    );
  }

  const patch = (p: Partial<EventDraft>) => {
    setDraft((d) => (d ? { ...d, ...p } : d));
    setError(null);
  };
  const setReferee = (idx: number, p: Partial<Referee>) =>
    patch({ referees: draft.referees.map((r, i) => (i === idx ? { ...r, ...p } : r)) });
  const venueOrder = venues.map((v) => v.id);
  const allVenues = venues.length > 0 && venues.every((v) => draft.venueIds.includes(v.id));

  const save = () => {
    const err = validateDraft(draft);
    if (err) {
      setError(err);
      toast(err, 'error');
      return;
    }
    const store = useProject.getState();
    const data: EventDraft = {
      ...draft,
      title: draft.title.trim() || '新比賽項目',
      referees: draft.referees.filter((r) => (r.role || '').trim() || (r.name || '').trim()),
      volunteerCount: Math.max(0, Math.round(draft.volunteerCount || 0)),
      studentCount: Math.max(0, Math.round(draft.studentCount || 0)),
      checkInOffsetMin: Math.max(0, Math.round(draft.checkInOffsetMin)),
    };
    // 不使用草稿的 id：新增時由 store 產生，編輯時以 eventId 為準
    const { id: _draftId, ...fields } = data;
    if (isNew) {
      const id = store.addEvent(fields);
      toast(`已新增賽程：${data.title}`, 'success');
      onSaved?.(id);
    } else {
      const current = store.events.find((e) => e.id === eventId);
      if (!current) {
        toast('這個賽程已被刪除，無法儲存', 'error');
        onClose();
        return;
      }
      const { startMin, endMin, ...rest } = fields;
      store.updateEvent(eventId, rest);
      // 時間改變時走 setEventTime，讓同場地後續賽程套用磁吸連動
      if (startMin !== current.startMin || endMin !== current.endMin) store.setEventTime(eventId, startMin, endMin);
      toast('已儲存賽程', 'success');
      onSaved?.(eventId);
    }
    onClose();
  };

  const presetSet = new Set<string>(EQUIPMENT_PRESETS);
  const customItems = draft.equipment.filter((e) => !presetSet.has(e));

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      variant="fullscreen"
      width="xl"
      footer={
        <>
          {error && <p className="mr-auto self-center text-sm font-semibold text-rose-600" role="alert">{error}</p>}
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" icon={<Check className="size-4" />} onClick={save}>
            儲存
          </Button>
        </>
      }
    >
      <form
        className="space-y-5 pb-4"
        // 輸入框按 Enter 不送出（避免打字時誤關表單），一律按「儲存」
        onSubmit={(e) => e.preventDefault()}
      >
        <Group title="基本資料">
          <TextField label="標題" value={draft.title} placeholder="例如：三年級 60M 決賽" onChange={(e) => patch({ title: e.target.value })} />
          <div>
            <FieldLabel>
              <span id={colorLabelId}>顏色</span>
            </FieldLabel>
            <div role="radiogroup" aria-labelledby={colorLabelId} className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((c) => {
                const active = draft.color === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={c.label}
                    onClick={() => patch({ color: c.id })}
                    className={cn(
                      'flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl border-2 px-3 text-sm font-semibold',
                      active ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white',
                    )}
                  >
                    <span className={cn('size-4 rounded-full', eventColor(c.id).dot)} aria-hidden />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
          <SelectField label="比賽日" value={draft.dateId} onChange={(e) => patch({ dateId: e.target.value })}>
            {!dates.some((d) => d.id === draft.dateId) && <option value={draft.dateId}>（未選擇）</option>}
            {dates.map((d) => (
              <option key={d.id} value={d.id}>
                {d.category ? `${d.category}｜` : ''}
                {d.label}
              </option>
            ))}
          </SelectField>
        </Group>

        <Group title="時間">
          <div className="grid grid-cols-2 gap-3">
            <TimeSelect label="開始時間" value={draft.startMin}
              onValueChange={(v) => patch(moveStartKeepDuration(draft.startMin, draft.endMin, v))} />
            <TimeSelect label="結束時間" value={draft.endMin} onValueChange={(v) => patch({ endMin: v })} />
          </div>
          <NumberField label="檢錄提早（分鐘）" min={0} max={120} step={5} value={draft.checkInOffsetMin}
            onValueChange={(v) => patch({ checkInOffsetMin: v })} hint="0 = 不需檢錄" />
          <Toggle label="與前一項目磁吸連動" description="前一項提早結束或延後時，本項目自動跟著移動"
            checked={draft.linkPrev} onChange={(v) => patch({ linkPrev: v })} />
        </Group>

        <Group title="場地" hint="可多選；第一個為主要場地">
          <span id={venueLabelId} className="sr-only">場地</span>
          <div role="group" aria-labelledby={venueLabelId} className="flex flex-wrap gap-2">
            <Chip className="min-h-11" active={allVenues}
              onClick={() => patch({ venueIds: allVenues ? [draft.venueIds[0] ?? venueOrder[0]].filter(Boolean) : venueOrder.slice() })}>
              全部場地
            </Chip>
            {venues.map((v) => (
              <Chip key={v.id} className="min-h-11" active={draft.venueIds.includes(v.id)}
                onClick={() => {
                  const next = toggleVenue(draft.venueIds, v.id, venueOrder);
                  if (next) patch({ venueIds: next });
                  else toast('至少需保留一個場地');
                }}>
                {v.name}
              </Chip>
            ))}
          </div>
        </Group>

        <Group title="裁判">
          <datalist id={roleListId}>
            {REFEREE_ROLE_PRESETS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          <ul className="space-y-2">
            {draft.referees.map((r, idx) => (
              <li key={idx} className="flex items-center gap-2">
                <input aria-label={`裁判 ${idx + 1} 職務`} list={roleListId} value={r.role ?? ''} placeholder="職務"
                  onChange={(e) => setReferee(idx, { role: e.target.value })}
                  className="min-h-11 w-28 shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-2 text-base focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input aria-label={`裁判 ${idx + 1} 姓名`} value={r.name ?? ''} placeholder="老師姓名"
                  onChange={(e) => setReferee(idx, { name: e.target.value })}
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <IconButton label={`移除裁判 ${idx + 1}`} className="shrink-0 hover:text-rose-600"
                  onClick={() => patch({ referees: draft.referees.filter((_, i) => i !== idx) })}>
                  <X className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button size="md" icon={<Plus className="size-4" />} onClick={() => patch({ referees: [...draft.referees, { role: '', name: '' }] })}>
              新增裁判
            </Button>
            {REFEREE_ROLE_PRESETS.map((role) => (
              <Chip key={role} className="min-h-11" aria-label={`新增 ${role}`}
                onClick={() => patch({ referees: [...draft.referees, { role, name: '' }] })}>
                + {role}
              </Chip>
            ))}
          </div>
        </Group>

        <Group title="器材">
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT_PRESETS.map((eq) => (
              <Chip key={eq} className="min-h-11 whitespace-normal text-left" active={draft.equipment.includes(eq)}
                onClick={() => patch({ equipment: toggleItem(draft.equipment, eq) })}>
                {eq}
              </Chip>
            ))}
          </div>
          <div className="flex gap-2">
            <TextField className="min-w-0 flex-1" label="自訂器材" value={customEq} placeholder="輸入其他器材"
              onChange={(e) => setCustomEq(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  patch({ equipment: addItem(draft.equipment, customEq) });
                  setCustomEq('');
                }
              }} />
            <Button className="self-end" icon={<Plus className="size-4" />} disabled={!customEq.trim()}
              onClick={() => {
                patch({ equipment: addItem(draft.equipment, customEq) });
                setCustomEq('');
              }}>
              新增器材
            </Button>
          </div>
          {customItems.length > 0 && (
            <ul className="space-y-1.5">
              {customItems.map((eq) => (
                <li key={eq} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 pl-3">
                  <span className="min-w-0 flex-1 break-words text-sm">{eq}</span>
                  <IconButton label={`移除器材 ${eq}`} className="shrink-0 hover:text-rose-600"
                    onClick={() => patch({ equipment: draft.equipment.filter((x) => x !== eq) })}>
                    <X className="size-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </Group>

        <Group title="志工與公差" hint="導師視角不顯示">
          <div className="grid grid-cols-[6rem_1fr] gap-3">
            <NumberField label="志工人數" min={0} value={draft.volunteerCount ?? 0} onValueChange={(v) => patch({ volunteerCount: v })} />
            <TextField label="志工任務" value={draft.volunteerTask ?? ''} placeholder="例如：終點拉線、安全維護"
              onChange={(e) => patch({ volunteerTask: e.target.value })} />
            <NumberField label="公差人數" min={0} value={draft.studentCount ?? 0} onValueChange={(v) => patch({ studentCount: v })} />
            <TextField label="公差任務" value={draft.studentTask ?? ''} placeholder="例如：撿橫桿、撿球"
              onChange={(e) => patch({ studentTask: e.target.value })} />
          </div>
        </Group>

        <Group title="道次表">
          <TextArea label="道次備註" value={draft.laneNote ?? ''} placeholder="例如：第1道紅、第2道黃；最後一棒穿白色背心"
            onChange={(e) => patch({ laneNote: e.target.value })} />
          <div>
            <FieldLabel>附件</FieldLabel>
            <div className="space-y-2">
              <AttachmentList attachments={draft.attachments} titlePrefix={draft.title}
                onRemove={(idx) => patch({ attachments: draft.attachments.filter((_, i) => i !== idx) })} />
              <AttachmentUploader onAdd={(list: Attachment[]) => setDraft((d) => (d ? { ...d, attachments: [...d.attachments, ...list] } : d))} />
            </div>
          </div>
        </Group>
      </form>
    </Modal>
  );
}
