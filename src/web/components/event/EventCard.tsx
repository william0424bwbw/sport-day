// I5：賽程卡片（手機列表、今日總覽、手機場地時間軸共用）
import { Clock, MapPin, Users } from 'lucide-react';
import { checkInOverlaps, checkInStart, eventStatus } from '@shared/schedule';
import type { ScheduleEvent } from '@shared/types';
import { formatRange, minToTime } from '@shared/time';
import { useCanEdit } from '../../hooks/useCanEdit';
import { useNowMin } from '../../hooks/useNowMin';
import { useProject } from '../../stores/project';
import { cn } from '../../ui/cn';
import { eventColor } from '../../ui/eventColors';
import { STATUS_CLASS, STATUS_LABEL, refereeSummary, venueNames } from '../common/labels';
import { LiveControls } from './LiveControls';

export interface EventCardProps {
  event: ScheduleEvent;
  onClick?: () => void;
  /** compact：單行精簡版；full：顯示檢錄時間、場地、裁判摘要、狀態 */
  variant?: 'compact' | 'full';
  /** 在卡片下方顯示現場調度按鈕（管理者） */
  showLiveControls?: boolean;
  /** 被選取（外框加粗） */
  selected?: boolean;
  /** 不符合目前篩選時淡化 */
  dimmed?: boolean;
  className?: string;
}

export function EventCard({ event, onClick, variant = 'full', showLiveControls, selected, dimmed, className }: EventCardProps) {
  const nowMin = useNowMin();
  const venues = useProject((s) => s.venues);
  const events = useProject((s) => s.events);
  const canEdit = useCanEdit();
  const color = eventColor(event.color);
  const status = eventStatus(event, nowMin);
  const names = venueNames(event, venues).join('、');
  const hasCheckIn = checkInStart(event) < event.startMin;
  const full = variant === 'full';

  const body = full ? (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn('rounded-md px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums', color.badge)}>
          {formatRange(event.startMin, event.endMin)}
        </span>
        <span className={cn('rounded-md px-1.5 py-0.5 text-xs font-bold', STATUS_CLASS[status])}>{STATUS_LABEL[status]}</span>
      </div>
      <div className="mt-1.5 text-base font-bold leading-snug break-words">{event.title || '未命名賽程'}</div>
      <div className="mt-1 space-y-0.5 text-sm text-slate-600">
        {hasCheckIn && (
          <div className={cn('flex items-center gap-1', checkInOverlaps(events, event) && 'text-amber-700')}>
            <Clock className="size-3.5 shrink-0" />
            <span>
              檢錄 {minToTime(checkInStart(event))}（提早 {event.checkInOffsetMin} 分）
            </span>
          </div>
        )}
        {names && (
          <div className="flex items-center gap-1 min-w-0">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{names}</span>
          </div>
        )}
        {refereeSummary(event) && (
          <div className="flex items-start gap-1 min-w-0">
            <Users className="mt-0.5 size-3.5 shrink-0" />
            <span className="line-clamp-2">{refereeSummary(event)}</span>
          </div>
        )}
      </div>
    </>
  ) : (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 font-mono text-sm font-bold tabular-nums">{formatRange(event.startMin, event.endMin)}</span>
      <span className="min-w-0 flex-1 truncate font-semibold">{event.title || '未命名賽程'}</span>
      <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold', STATUS_CLASS[status])}>{STATUS_LABEL[status]}</span>
    </div>
  );

  const surface = cn(
    'block w-full min-h-11 rounded-xl border border-l-4 text-left transition-shadow',
    color.border,
    color.bg,
    color.text,
    full ? 'p-3' : 'px-3 py-2',
    selected && 'ring-2 ring-blue-500 ring-offset-1',
    status === 'done' && 'opacity-75',
  );

  return (
    <div data-testid="event-card" data-event-id={event.id} className={cn('min-w-0', dimmed && 'opacity-40', className)}>
      {onClick ? (
        <button type="button" onClick={onClick} aria-current={selected || undefined}className={cn(surface, 'hover:shadow-md active:shadow-sm')}>
          {body}
        </button>
      ) : (
        <div className={surface}>{body}</div>
      )}
      {showLiveControls && canEdit && <LiveControls eventId={event.id} size="large" className="mt-2" />}
    </div>
  );
}
