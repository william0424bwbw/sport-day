// 手機「設定」：角色、密碼、同步、模擬時間；管理者另有場地、比賽日管理與匯出入入口
import { FileDown } from 'lucide-react';
import { DayManager } from '../../components/manage/DayManager';
import { VenueManager } from '../../components/manage/VenueManager';
import { SettingsPanel } from '../../components/settings/SettingsPanel';
import { useCanEdit } from '../../hooks/useCanEdit';
import { PageTitle, Section } from './parts';

export function SettingsView() {
  const canEdit = useCanEdit();
  return (
    <div className="space-y-4">
      <PageTitle title="設定" />
      <Section title="一般">
        <SettingsPanel />
      </Section>
      {canEdit && (
        <>
          <Section title="場地管理">
            <VenueManager />
          </Section>
          <Section title="比賽日管理">
            <DayManager />
          </Section>
          <Section title="細流表輸出 / JSON 匯出入">
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <FileDown className="size-5 shrink-0" aria-hidden />
              <span>即將推出：公文格式細流表、CSV 匯出、JSON 備份與匯入。</span>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
