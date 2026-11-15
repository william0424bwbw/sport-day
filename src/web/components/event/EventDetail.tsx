// I5：賽程細節（電腦版右側面板、手機版底部滑出面板共用）
// 內容：時間、檢錄、場地、裁判、器材、志工、公差、備註、附件；
// 管理者另有：編輯、複製、刪除、LiveControls
import { AlertTriangle, Copy, Pencil, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { checkInOverlaps, checkInStart, eventStatus } from '@shared/schedule';
import { formatRange, minToTime } from '@shared/time';
import { useCanEdit } from '../../hooks/useCanEdit';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { useNowMin } from '../../hooks/useNowMin';
import { useProject } from '../../stores/project';
import { useSession } from '../../stores/session';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { confirmDialog } from '../../ui/ConfirmDialog';
import { eventColor } from '../../ui/eventColors';
import { toast } from '../../ui/Toast';
import { STATUS_CLASS, STATUS_LABEL, venueNames } from '../common/labels';
import { AttachmentList } from './Attachments';
import { LiveControls } from './LiveControls';

export interface EventDetailProps {
  eventId: string;
  /** 按下「編輯」：由呼叫端開啟 EventEditorModal */
  onEdit?: () => void;
  /** 刪除或關閉後通知呼叫端 */
  onClose?: () => void;
  /** 現場調度按鈕大小（預設：手機 large、電腦 compact） */
  liveSize?: 'large' | 'compact';
  /** 不顯示標題列（呼叫端的 Modal 已經顯示標題時使用） */
  hideTitle?: boolean;
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {aside}
      </div>
      <div className="text-sm text-slate-700">{children}</div>
    </section>
  );
}

export function EventDetail({ eventId, onEdit, onClose, liveSize, hideTitle }: EventDetailProps) {
  const ev = useProject((s) => s.events.find((e) => e.id === eventId));
  const events = useProject((s) => s.events);
  const venues = useProject((s) => s.venues);
  const role = useSession((s) => s.role);
  const canEdit = useCanEdit();
  const isDesktop = useIsDesktop();
  const nowMin = useNowMin();

  if (!ev) {
    return (
      <div data-testid="event-detail" className="p-4 text-sm text-slate-500">
        找不到這個賽程（可能已被刪除）
      </div>
    );
  }

  const color = eventColor(ev.color);
  const status = eventStatus(ev, nowMin);
  const ciStart = checkInStart(ev);
  const hasCheckIn = ciStart < ev.startMin;
  const overlap = checkInOverlaps(events, ev);
  // 舊版：志工、公差、器材在導師視角自動隱藏
  const showStaffInfo = role !== 'teacher';
  const referees = (ev.referees || []).filter((r) => (r.role || '').trim() || (r.name || '').trim());

  const duplicate = () => {
    const id = useProject.getState().duplicateEvent(ev.id);
    if (!id) return;
    useSession.getState().selectEvent(id);
    toast('已複製賽程方塊', 'success');
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: '刪除賽程？',
      message: `確定要刪除「${ev.title || '未命名賽程'}」嗎？刪除後無法復原。`,
      confirmText: '刪除',
      danger: true,
    });
    if (!ok) return;
    useProject.getState().deleteEvent(ev.id);
    toast('已刪除該賽程方塊');
    onClose?.();
  };

  return (
    <div data-testid="event-detail" data-event-id={ev.id} className="space-y-4">
      {!hideTitle && (
        <div className={cn('rounded-xl border border-l-4 p-3', color.border, color.bg, color.text)}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn('rounded-md px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums', color.badge)}>
              {formatRange(ev.startMin, ev.endMin)}
            </span>
            <span className={cn('rounded-md px-1.5 py-0.5 text-xs font-bold', STATUS_CLASS[status])}>{STATUS_LABEL[status]}</span>
          </div>
          <h2 className="mt-1.5 text-lg font-bold leading-snug break-words">{ev.title || '未命名賽程'}</h2>
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={<Pencil className="size-4" />} onClick={onEdit} disabled={!onEdit}>
            編輯
          </Button>
          <Button icon={<Copy className="size-4" />} onClick={duplicate}>
            複製
          </Button>
          <Button variant="ghost" className="text-rose-600 hover:bg-rose-50" icon={<Trash2 className="size-4" />} onClick={() => void remove()}>
            刪除
          </Button>
        </div>
      )}

      {canEdit && (
        <Section title="現場調度">
          <LiveControls eventId={ev.id} size={liveSize ?? (isDesktop ? 'compact' : 'large')} />
        </Section>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="font-semibold text-slate-500">比賽時間</dt>
        <dd className="font-mono tabular-nums">{formatRange(ev.startMin, ev.endMin)}</dd>
        <dt className="font-semibold text-slate-500">檢錄</dt>
        <dd>
          {hasCheckIn ? (
            <span className="font-mono tabular-nums">
              {formatRange(ciStart, ev.startMin)}
              <span className="ml-1 font-sans text-slate-500">（提早 {ev.checkInOffsetMin} 分）</span>
            </span>
          ) : (
            '無'
          )}
        </dd>
        {(ev.actualStartMin || ev.actualEndMin) && (
          <>
            <dt className="font-semibold text-slate-500">實際時間</dt>
            <dd className="font-mono tabular-nums">
              {ev.actualStartMin ? minToTime(ev.actualStartMin) : '—'} – {ev.actualEndMin ? minToTime(ev.actualEndMin) : '進行中'}
            </dd>
          </>
        )}
        <dt className="font-semibold text-slate-500">場地</dt>
        <dd className="min-w-0 break-words">{venueNames(ev, venues).join('、') || '—'}</dd>
        <dt className="font-semibold text-slate-500">磁吸連動</dt>
        <dd>{ev.linkPrev ? '與前一項目連動' : '不連動'}</dd>
      </dl>

      {overlap && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>檢錄時段與同場地的前一項賽程重疊，請提醒選手在場邊等候或調整檢錄時間。</span>
        </div>
      )}

      <Section title="裁判">
        {referees.length ? (
          <ul className="space-y-1">
            {referees.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">{r.role || '裁判'}</span>
                <span className="min-w-0 break-words">{r.name || '待定'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-400">尚未登錄裁判名單</p>
        )}
      </Section>

      {showStaffInfo && (
        <>
          <Section title="器材">
            {ev.equipment.length ? (
              <ul className="list-inside list-disc space-y-0.5">
                {ev.equipment.map((eq, i) => (
                  <li key={i} className="break-words">{eq}</li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-400">本項目無需額外搬運器材</p>
            )}
          </Section>
          <Section title="志工與公差">
            <p>
              志工 {ev.volunteerCount || 0} 人：{ev.volunteerTask || '無特殊任務'}
            </p>
            <p>
              公差學生 {ev.studentCount || 0} 人：{ev.studentTask || '無特殊任務'}
            </p>
          </Section>
        </>
      )}

      <Section title="道次備註">
        {ev.laneNote ? <p className="whitespace-pre-wrap break-words">{ev.laneNote}</p> : <p className="text-slate-400">無</p>}
      </Section>

      <Section title="道次表／選手名單">
        <AttachmentList attachments={ev.attachments || []} titlePrefix={ev.title} />
      </Section>
    </div>
  );
}
