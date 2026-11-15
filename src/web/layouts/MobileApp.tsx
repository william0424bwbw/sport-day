// I6：手機版排版（今日、賽程、場地時間軸、設定、底部導覽）
// 寬度 < 1024px 使用；所有功能（含管理者功能）都要能在手機上操作（docs/mobile-ux.md）
import { CalendarClock, ListOrdered, MapPin, Plus, Settings } from 'lucide-react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router';
import { DayPicker } from '../components/common/DayPicker';
import { SyncBadge } from '../components/common/SyncBadge';
import { useCanEdit } from '../hooks/useCanEdit';
import { useCurrentDay } from '../hooks/useCurrentDay';
import { useNowMin } from '../hooks/useNowMin';
import { useProject } from '../stores/project';
import { useSession } from '../stores/session';
import { cn } from '../ui/cn';
import { AgendaView } from '../views/mobile/AgendaView';
import { MobileOverlays } from '../views/mobile/MobileOverlays';
import { useMobileUi, useMobileVenue } from '../views/mobile/mobileUi';
import { SettingsView } from '../views/mobile/SettingsView';
import { NEW_EVENT_DURATION, nextFreeSlot } from '../views/mobile/slots';
import { TodayView } from '../views/mobile/TodayView';
import { VenueView } from '../views/mobile/VenueView';

const TABS = [
  { to: '/', label: '今日', icon: CalendarClock },
  { to: '/agenda', label: '賽程', icon: ListOrdered },
  { to: '/venue', label: '場地', icon: MapPin },
  { to: '/settings', label: '設定', icon: Settings },
] as const;

export function MobileApp() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const canEdit = useCanEdit();
  const loaded = useProject((s) => s.loaded);
  const hasDays = useProject((s) => s.dates.length > 0);
  const onSettings = pathname === '/settings';
  // 管理者的「新增賽程」浮動按鈕（設定頁不需要）
  const showFab = canEdit && hasDays && !onSettings;

  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 pt-safe backdrop-blur">
        <div className="flex min-h-14 items-center gap-2 px-3 py-1.5">
          <div className="min-w-0 flex-1">
            <DayPicker layout="chips" />
          </div>
          <div className="shrink-0">
            <SyncBadge onClick={() => navigate({ pathname: '/settings', search })} />
          </div>
        </div>
      </header>

      <main
        className={cn(
          'mx-auto w-full max-w-2xl min-w-0 flex-1 px-4 pt-4',
          // 底部預留導覽列高度（+ 浮動按鈕），內容捲到底不會被遮住
          showFab ? 'pb-[calc(9.5rem+env(safe-area-inset-bottom,0px))]' : 'pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]',
        )}
      >
        {!loaded && !onSettings ? (
          <p className="py-16 text-center text-sm text-slate-500">載入賽程資料中…</p>
        ) : !hasDays && !onSettings ? (
          <NoDays />
        ) : (
          <Routes>
            <Route index element={<TodayView />} />
            <Route path="agenda" element={<AgendaView />} />
            <Route path="venue" element={<VenueView />} />
            <Route path="settings" element={<SettingsView />} />
            <Route path="*" element={<Navigate to={{ pathname: '/', search }} replace />} />
          </Routes>
        )}
      </main>

      {showFab && <AddEventFab />}

      <nav
        aria-label="主選單"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-safe backdrop-blur"
      >
        <ul className="mx-auto grid max-w-2xl grid-cols-4">
          {TABS.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={{ pathname: to, search }}
                end
                className={({ isActive }) =>
                  cn(
                    'flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors',
                    isActive ? 'text-blue-600' : 'text-slate-500 active:text-slate-700',
                  )
                }
              >
                <Icon className="size-6" aria-hidden />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <MobileOverlays />
    </div>
  );
}

/** 沒有比賽日時的提示 */
function NoDays() {
  const canEdit = useCanEdit();
  const { search } = useLocation();
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
      <p>目前還沒有比賽日。</p>
      {canEdit && (
        <NavLink to={{ pathname: '/settings', search }} className="mt-3 inline-flex min-h-11 items-center font-semibold text-blue-700">
          到「設定」新增比賽日
        </NavLink>
      )}
    </div>
  );
}

/** 新增賽程：帶入目前比賽日、目前場地、該場地下一個 10 分鐘空檔 */
function AddEventFab() {
  const { pathname } = useLocation();
  const day = useCurrentDay();
  const events = useProject((s) => s.events);
  const venues = useProject((s) => s.venues);
  const filterVenue = useSession((s) => s.filter.venueId);
  const mobileVenue = useMobileVenue();
  const openEditor = useMobileUi((s) => s.openEditor);
  const nowMin = useNowMin();

  const open = () => {
    if (!day) return;
    // 場地頁用正在看的場地；其他頁用篩選中的場地，否則第一個場地
    const venueId =
      pathname === '/venue' ? (mobileVenue?.id ?? null) : (venues.find((v) => v.id === filterVenue)?.id ?? venues[0]?.id ?? null);
    const startMin = nextFreeSlot(events, day.id, venueId, nowMin);
    openEditor({
      init: {
        dateId: day.id,
        venueIds: venueId ? [venueId] : [],
        startMin,
        endMin: startMin + NEW_EVENT_DURATION,
      },
    });
  };

  return (
    <button
      type="button"
      onClick={open}
      className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-30 inline-flex h-14 items-center gap-2 rounded-full bg-blue-600 pr-5 pl-4 text-base font-bold text-white shadow-lg shadow-blue-600/30 active:bg-blue-700"
    >
      <Plus className="size-6" aria-hidden />
      新增賽程
    </button>
  );
}
