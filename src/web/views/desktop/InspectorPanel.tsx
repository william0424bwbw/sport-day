// 右欄：選取賽程的細節面板（舊版 rightInspector；沒有選取時不顯示）
import { X } from 'lucide-react';
import { EventDetail } from '../../components/event/EventDetail';
import { IconButton } from '../../ui/Button';

export interface InspectorPanelProps {
  eventId: string;
  onClose: () => void;
  onEdit: () => void;
}

export function InspectorPanel({ eventId, onClose, onEdit }: InspectorPanelProps) {
  return (
    <aside
      data-testid="inspector"
      aria-label="賽程細節"
      className="w-96 bg-white border-l border-slate-200 flex flex-col shrink-0 z-20 shadow-lg min-h-0"
    >
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 shrink-0">
        <h2 className="flex-1 text-sm font-bold text-slate-700">賽程細節</h2>
        <IconButton label="關閉細節" size="sm" onClick={onClose} data-testid="inspector-close">
          <X className="size-4" />
        </IconButton>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 select-text">
        <EventDetail eventId={eventId} onEdit={onEdit} onClose={onClose} />
      </div>
    </aside>
  );
}
