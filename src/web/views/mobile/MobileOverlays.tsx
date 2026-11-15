// 手機版彈出層：賽程細節（底部滑出面板）與賽程表單（全螢幕）
// 放在 MobileApp 最外層一次即可，各頁面用 session.selectEvent / useMobileUi.openEditor 開啟
import { EventDetail } from '../../components/event/EventDetail';
import { EventEditorModal } from '../../components/event/EventEditorModal';
import { useProject } from '../../stores/project';
import { useSession } from '../../stores/session';
import { Modal } from '../../ui/Modal';
import { useMobileUi } from './mobileUi';

export function MobileOverlays() {
  const selectedId = useSession((s) => s.selectedEventId);
  const selectEvent = useSession((s) => s.selectEvent);
  const selected = useProject((s) => s.events.find((e) => e.id === selectedId) ?? null);
  const editor = useMobileUi((s) => s.editor);
  const openEditor = useMobileUi((s) => s.openEditor);
  const closeEditor = useMobileUi((s) => s.closeEditor);

  const close = () => selectEvent(null);

  return (
    <>
      <Modal open={selected !== null} onClose={close} title={selected?.title || '賽程細節'} variant="sheet">
        {selected && (
          <EventDetail eventId={selected.id} hideTitle onEdit={() => openEditor({ eventId: selected.id })} onClose={close} />
        )}
      </Modal>
      <EventEditorModal
        open={editor !== null}
        onClose={closeEditor}
        eventId={editor && 'eventId' in editor ? editor.eventId : undefined}
        init={editor && 'init' in editor ? editor.init : undefined}
        onSaved={closeEditor}
      />
    </>
  );
}
