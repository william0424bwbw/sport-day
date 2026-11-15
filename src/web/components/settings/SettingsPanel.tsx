// I5：設定（角色切換、管理者密碼、專案代碼、同步狀態、模擬時間）
import { Clock, KeyRound, Minus, Phone, Plus, RefreshCw, UserRound } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { DAY_END_MIN, DAY_START_MIN } from '@shared/constants';
import { minToTime } from '@shared/time';
import type { Role } from '@shared/types';
import { useCanEdit } from '../../hooks/useCanEdit';
import { useNowMin } from '../../hooks/useNowMin';
import { PROJECT_ID_RE } from '../../services/api';
import { useProject } from '../../stores/project';
import { useSession } from '../../stores/session';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { confirmDialog } from '../../ui/ConfirmDialog';
import { TextField, Toggle } from '../../ui/Field';
import { toast } from '../../ui/Toast';
import { CONNECTION_DOT, CONNECTION_LABEL, ROLE_OPTIONS, formatVersion } from '../common/labels';

function Card({ title, icon, children, testId }: { title: string; icon: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section data-testid={testId} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

/** 分段切換（角色、時鐘模式） */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'min-h-11 rounded-lg px-2 text-sm font-semibold transition-colors',
            value === o.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AdminPassword() {
  const adminToken = useSession((s) => s.adminToken);
  const verified = useSession((s) => s.sync.adminVerified);
  const [value, setValue] = useState(adminToken);
  const dirty = value.trim() !== adminToken;

  // 驗證結果由同步服務顯示提示，這裡只更新密碼
  const save = () => useSession.getState().setAdminToken(value);

  const status = verified ? '已通過驗證，可以編輯並自動儲存到雲端' : adminToken ? '尚未通過驗證（目前只能瀏覽）' : '尚未輸入密碼（目前只能瀏覽）';

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <TextField
          className="min-w-0 flex-1"
          label="管理者密碼"
          type="password"
          autoComplete="current-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            }
          }}
        />
        <Button variant="primary" onClick={save} disabled={!dirty}>
          儲存
        </Button>
      </div>
      <p className={cn('text-sm', verified ? 'text-emerald-700' : 'text-slate-500')}>{status}</p>
      {adminToken && (
        <Button size="sm" variant="ghost" onClick={() => {
          setValue('');
          useSession.getState().setAdminToken('');
        }}>
          清除這台裝置的密碼
        </Button>
      )}
    </div>
  );
}

function ProjectCode() {
  const projectId = useSession((s) => s.projectId);
  const [value, setValue] = useState(projectId);
  const trimmed = value.trim();
  const valid = PROJECT_ID_RE.test(trimmed);

  const apply = async () => {
    if (!valid) {
      toast('專案代碼只能使用英文、數字、底線與連字號', 'error');
      return;
    }
    if (trimmed === projectId) return;
    const ok = await confirmDialog({
      title: '切換專案？',
      message: `切換到「${trimmed}」後會載入那個專案的賽程。這台裝置目前專案的資料仍保留在雲端。`,
      confirmText: '切換',
    });
    if (!ok) return;
    useSession.getState().setProjectId(trimmed);
    toast(`已切換到專案「${trimmed}」`);
  };

  return (
    <div className="flex items-end gap-2">
      <TextField className="min-w-0 flex-1" label="專案代碼" value={value} autoCapitalize="off" autoCorrect="off" spellCheck={false}
        onChange={(e) => setValue(e.target.value)} hint={valid ? undefined : '格式不正確'} />
      <Button onClick={() => void apply()} disabled={trimmed === projectId}>
        套用
      </Button>
    </div>
  );
}

function SyncDetails() {
  const sync = useSession((s) => s.sync);
  const canEdit = useCanEdit();
  const rows: [string, ReactNode][] = [
    [
      '連線',
      <span key="c" className="inline-flex items-center gap-1.5">
        <span className={cn('size-2 rounded-full', CONNECTION_DOT[sync.connection])} aria-hidden />
        {CONNECTION_LABEL[sync.connection]}
      </span>,
    ],
    ['權限', canEdit ? '可編輯' : '瀏覽'],
    ['線上人數', sync.online === null ? '—' : `${sync.online} 人`],
    ['未上傳修改', sync.pending ? '有（恢復連線後自動上傳）' : '無'],
    ['雲端版本', formatVersion(sync.updatedAt)],
  ];
  return (
    <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-500">{k}</dt>
            <dd className="min-w-0 break-words font-semibold text-slate-800">{v}</dd>
          </div>
        ))}
      </dl>
      {sync.error && <p className="rounded-xl bg-rose-50 p-2 text-sm text-rose-700">{sync.error}</p>}
    </>
  );
}

function ClockControls() {
  const clock = useSession((s) => s.clock);
  const setClock = useSession((s) => s.setClock);
  const nowMin = useNowMin();
  const sim = clock.mode === 'sim';

  return (
    <div className="space-y-3">
      <Segmented
        label="時鐘"
        value={clock.mode}
        options={[
          { id: 'real', label: '真實時間' },
          { id: 'sim', label: '模擬時間' },
        ]}
        onChange={(mode) => setClock({ mode })}
      />
      <p className="text-sm text-slate-600">
        目前時間：<span className="font-mono text-base font-bold tabular-nums text-slate-900">{minToTime(Math.floor(nowMin))}</span>
        {sim && <span className="ml-1 text-amber-700">（模擬，只影響這台裝置）</span>}
      </p>
      {sim && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button icon={<Minus className="size-4" />} aria-label="模擬時間倒退 10 分鐘"
              disabled={clock.simMin <= DAY_START_MIN} onClick={() => setClock({ simMin: clock.simMin - 10 })}>
              10 分
            </Button>
            <Button icon={<Plus className="size-4" />} aria-label="模擬時間前進 10 分鐘"
              disabled={clock.simMin >= DAY_END_MIN} onClick={() => setClock({ simMin: clock.simMin + 10 })}>
              10 分
            </Button>
          </div>
          <Toggle label="自動播放" description="每 5 秒前進 10 分鐘（演練用）" checked={clock.autoplay}
            onChange={(autoplay) => setClock({ autoplay })} />
        </>
      )}
    </div>
  );
}

export interface SettingsPanelProps {
  className?: string;
}

/** 聯絡窗口：所有人都看得到；管理者（已驗證）可以修改，存到雲端後所有裝置同步 */
function ContactCard() {
  const canEdit = useCanEdit();
  const contact = useProject((s) => s.settings?.contact ?? '');
  const [value, setValue] = useState(contact);
  const [editing, setEditing] = useState(false);

  if (!canEdit && !contact.trim()) return null;

  const save = () => {
    useProject.getState().updateSettings({ contact: value.trim() });
    setEditing(false);
    toast('已更新聯絡窗口', 'success');
  };

  return (
    <Card title="聯絡窗口" testId="contact-card" icon={<Phone className="size-5 text-blue-600" aria-hidden />}>
      {canEdit && editing ? (
        <div className="space-y-2">
          <TextField
            label="有問題請聯絡"
            value={value}
            maxLength={200}
            placeholder="例如：體育組 王老師（分機 123）"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setEditing(false)}>取消</Button>
            <Button variant="primary" onClick={save} disabled={value.trim() === contact.trim()}>
              儲存
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-slate-700 break-words" data-testid="contact-text">
            {contact.trim() ? (
              <>
                有問題請聯絡：<strong className="text-slate-900">{contact}</strong>
              </>
            ) : (
              <span className="text-slate-400">尚未設定。設定後，所有老師都會在這裡看到。</span>
            )}
          </p>
          {canEdit && (
            <Button
              onClick={() => {
                setValue(contact);
                setEditing(true);
              }}
            >
              修改
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

export function SettingsPanel({ className }: SettingsPanelProps) {
  const role = useSession((s) => s.role);

  const changeRole = (r: Role) => {
    if (r === role) return;
    useSession.getState().setRole(r);
    toast(`已切換為「${ROLE_OPTIONS.find((o) => o.id === r)?.label}」視角`);
  };

  return (
    <div className={cn('space-y-4', className)}>
      <ContactCard />
      <Card title="角色" icon={<UserRound className="size-5 text-blue-600" aria-hidden />}>
        <Segmented label="角色" value={role} options={ROLE_OPTIONS} onChange={changeRole} />
        <p className="text-xs text-slate-500">
          {role === 'teacher' && '導師：精簡檢視，可用年級篩選。'}
          {role === 'staff' && '工作人員：完整檢視（志工、器材），可用人員搜尋。'}
          {role === 'admin' && '管理者：輸入管理者密碼後才能修改賽程。'}
        </p>
        {role === 'admin' && <AdminPassword />}
      </Card>

      <Card title="同步狀態" icon={<RefreshCw className="size-5 text-blue-600" aria-hidden />}>
        <SyncDetails />
      </Card>

      <Card title="專案" icon={<KeyRound className="size-5 text-blue-600" aria-hidden />}>
        <ProjectCode />
      </Card>

      {role === 'admin' && (
        <Card title="時鐘" icon={<Clock className="size-5 text-blue-600" aria-hidden />}>
          <ClockControls />
        </Card>
      )}
    </div>
  );
}
