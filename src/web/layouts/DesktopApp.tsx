// I7：電腦版排版（≥ 1024px）：頂部列 + 左側比賽日 + 中間時間 × 場地格狀表 + 右側細節面板
// 外觀與操作流程沿用舊版 legacy/index.html
import { useEffect, useState } from 'react';
import { EventEditorModal } from '../components/event/EventEditorModal';
import { useCurrentDay } from '../hooks/useCurrentDay';
import { useProject } from '../stores/project';
import { useSession } from '../stores/session';
import { CenterPane } from '../views/desktop/CenterPane';
import { DaySidebar } from '../views/desktop/DaySidebar';
import { DesktopHeader } from '../views/desktop/DesktopHeader';
import { InspectorPanel } from '../views/desktop/InspectorPanel';

/** 進行中賽程方塊的呼吸燈（舊版 .live-card-pulse） */
const LIVE_PULSE_CSS = `
@keyframes sd-live-pulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(244, 63, 94, 0.45), 0 8px 20px -4px rgba(244, 63, 94, 0.28); }
  50% { box-shadow: 0 0 0 5px rgba(244, 63, 94, 0.8), 0 12px 26px -2px rgba(244, 63, 94, 0.42); }
}
.sd-live-pulse { animation: sd-live-pulse 1.8s infinite ease-in-out; }
@media (prefers-reduced-motion: reduce) { .sd-live-pulse { animation: none; } }
`;

export function DesktopApp() {
  const day = useCurrentDay();
  const loaded = useProject((s) => s.loaded);
  const selectedId = useSession((s) => s.selectedEventId);
  const selectEvent = useSession((s) => s.selectEvent);
  const selectedDateId = useProject((s) => s.events.find((e) => e.id === selectedId)?.dateId ?? null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // 切換比賽日時，關閉不屬於這一天的細節面板（與舊版 selectDate 相同）
  useEffect(() => {
    if (selectedId && day && selectedDateId && selectedDateId !== day.id) selectEvent(null);
  }, [day, selectedId, selectedDateId, selectEvent]);

  const showInspector = Boolean(selectedId && selectedDateId && day && selectedDateId === day.id);

  return (
    <div className="h-full flex flex-col overflow-hidden select-none" data-testid="desktop-app">
      <style>{LIVE_PULSE_CSS}</style>
      <DesktopHeader />
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <DaySidebar />
        {day ? (
          <CenterPane day={day} onOpenEditor={setEditingId} />
        ) : (
          <main className="flex-1 flex items-center justify-center text-sm text-slate-500">
            {loaded ? '尚未建立比賽日，請由左側「管理」新增。' : '載入賽程中…'}
          </main>
        )}
        {showInspector && selectedId && (
          <InspectorPanel eventId={selectedId} onClose={() => selectEvent(null)} onEdit={() => setEditingId(selectedId)} />
        )}
      </div>
      <EventEditorModal
        open={editingId !== null}
        eventId={editingId ?? undefined}
        onClose={() => setEditingId(null)}
      />
    </div>
  );
}
