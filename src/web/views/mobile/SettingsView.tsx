// 手機「設定」：角色、密碼、同步、模擬時間；細流表與 JSON 匯出入；管理者另有場地、比賽日管理
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { DayManager } from '../../components/manage/DayManager';
import { VenueManager } from '../../components/manage/VenueManager';
import { SettingsPanel } from '../../components/settings/SettingsPanel';
import { exportBackup, onImportFileChange } from '../../features/backup';
import { RundownPanel } from '../../features/Rundown';
import { useCanEdit } from '../../hooks/useCanEdit';
import { useSession } from '../../stores/session';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { PageTitle, Section } from './parts';

export function SettingsView() {
  const canEdit = useCanEdit();
  const role = useSession((s) => s.role);
  const [rundownOpen, setRundownOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-4">
      <PageTitle title="設定" />
      <Section title="一般">
        <SettingsPanel />
      </Section>
      {role !== 'teacher' && (
        <Section title="細流表輸出 / JSON 匯出入" testId="export-section">
          <div className="grid grid-cols-1 gap-2">
            <Button block icon={<FileSpreadsheet className="size-4" />} onClick={() => setRundownOpen(true)}>
              細流表（列印 / CSV）
            </Button>
            <Button block icon={<Download className="size-4" />} onClick={exportBackup}>
              匯出 JSON 備份
            </Button>
            {canEdit && (
              <>
                <Button block icon={<Upload className="size-4" />} onClick={() => importRef.current?.click()}>
                  匯入 JSON 備份
                </Button>
                <input ref={importRef} type="file" accept=".json,application/json" hidden data-testid="import-json-input" onChange={onImportFileChange} />
              </>
            )}
          </div>
        </Section>
      )}
      {canEdit && (
        <>
          <Section title="場地管理">
            <VenueManager />
          </Section>
          <Section title="比賽日管理">
            <DayManager />
          </Section>
        </>
      )}
      <Modal open={rundownOpen} onClose={() => setRundownOpen(false)} title="賽務工作細流表" variant="fullscreen" width="2xl">
        <RundownPanel />
      </Modal>
    </div>
  );
}
