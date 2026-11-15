// 手機首頁「今日」：進行中、下一項（幾分鐘後檢錄）、司令台
import { checkInStart, liveAndNext } from '@shared/schedule';
import { minToTime } from '@shared/time';
import type { ScheduleEvent } from '@shared/types';
import { Link, useLocation } from 'react-router';
import { EventCard } from '../../components/event/EventCard';
import { LiveControls } from '../../components/event/LiveControls';
import { CommandDeck } from '../../components/manage/CommandDeck';
import { useCanEdit } from '../../hooks/useCanEdit';
import { useCurrentDay } from '../../hooks/useCurrentDay';
import { useNowMin } from '../../hooks/useNowMin';
import { useProject } from '../../stores/project';
import { useSession } from '../../stores/session';
import { cn } from '../../ui/cn';
import { PageTitle, Section } from './parts';

/** 「12 分鐘後檢錄」「檢錄中，5 分鐘後開始」 */
function checkInText(ev: ScheduleEvent, nowMin: number): string {
  const ci = checkInStart(ev);
  const untilCheckIn = Math.ceil(ci - nowMin);
  if (ci < ev.startMin && untilCheckIn > 0) return `${minToTime(ci)} 檢錄（${untilCheckIn} 分鐘後）`;
  const untilStart = Math.ceil(ev.startMin - nowMin);
  if (ci < ev.startMin) return `檢錄中，${untilStart} 分鐘後開始`;
  return untilStart > 0 ? `${minToTime(ev.startMin)} 開始（${untilStart} 分鐘後）` : '即將開始';
}

export function TodayView() {
  const day = useCurrentDay();
  const events = useProject((s) => s.events);
  const nowMin = useNowMin();
  const canEdit = useCanEdit();
  const selectEvent = useSession((s) => s.selectEvent);
  const simMode = useSession((s) => s.clock.mode === 'sim');
  const { search } = useLocation();

  if (!day) return null;
  const { live, next } = liveAndNext(events, day.id, nowMin);
  const hasEvents = events.some((e) => e.dateId === day.id);

  return (
    <div className="space-y-4">
      <PageTitle
        title="今日"
        aside={
          <span className={cn('text-sm font-semibold tabular-nums', simMode ? 'text-amber-600' : 'text-slate-500')}>
            {simMode ? '模擬 ' : '現在 '}
            {minToTime(Math.floor(nowMin))}
          </span>
        }
      />

      <Section title="進行中" tone="live" testId="today-live">
        {live.length === 0 ? (
          <p className="text-sm text-slate-500">目前沒有進行中的賽程</p>
        ) : (
          live.map((ev) => (
            <div key={ev.id} className="space-y-2">
              <EventCard event={ev} variant="full" onClick={() => selectEvent(ev.id)} />
              {canEdit && <LiveControls eventId={ev.id} size="large" />}
            </div>
          ))
        )}
      </Section>

      <Section title="下一項" tone="next" testId="today-next">
        {next.length === 0 ? (
          <p className="text-sm text-slate-500">
            {hasEvents ? '今天的賽程都已開始或結束' : '這一天還沒有賽程'}
          </p>
        ) : (
          next.map((ev) => (
            <div key={ev.id} className="space-y-2">
              <p className="text-sm font-bold text-amber-700">{checkInText(ev, nowMin)}</p>
              <EventCard event={ev} variant="full" onClick={() => selectEvent(ev.id)} />
              {canEdit && <LiveControls eventId={ev.id} size="large" />}
            </div>
          ))
        )}
      </Section>

      <CommandDeck dayId={day.id} layout="list" />

      <Link
        to={{ pathname: '/agenda', search }}
        className="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-semibold text-blue-700 active:bg-slate-100"
      >
        查看全部賽程
      </Link>
    </div>
  );
}
