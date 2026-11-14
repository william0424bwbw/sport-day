import type { ColorTheme } from './types';

// 時間軸範圍與網格（與舊版相同）
export const START_HOUR = 7;
export const END_HOUR = 17;
export const DAY_START_MIN = START_HOUR * 60;
export const DAY_END_MIN = END_HOUR * 60;
/** 時間網格單位（分鐘） */
export const STEP_MINUTES = 10;

export const DEFAULT_PROJECT_ID = 'school-sports-115';

/** 年級積木：依標題關鍵字判斷賽程屬於哪個年級 */
export const GRADE_BLOCKS = [
  { id: '一年級', label: '一年級', keywords: ['一年級', '一立定', '一網', '一全'] },
  { id: '二年級', label: '二年級', keywords: ['二年級', '二立定', '二對', '二全'] },
  { id: '三年級', label: '三年級', keywords: ['三年級', '三立定', '三網'] },
  { id: '四年級', label: '四年級', keywords: ['四年級', '四立定', '四壘'] },
  { id: '五年級', label: '五年級', keywords: ['五年級', '五壘', '五、六年級'] },
  { id: '六年級', label: '六年級', keywords: ['六年級', '六壘', '五、六年級'] },
  { id: '特教', label: '特教班', keywords: ['特教'] },
  { id: '全校', label: '全校 / 親師', keywords: ['預演', '閉幕', '親師', '開幕'] },
] as const;

export type GradeId = (typeof GRADE_BLOCKS)[number]['id'];

export const COLOR_OPTIONS: { id: ColorTheme; label: string }[] = [
  { id: 'blue', label: '藍' },
  { id: 'emerald', label: '綠' },
  { id: 'amber', label: '橘' },
  { id: 'rose', label: '紅' },
  { id: 'purple', label: '紫' },
];

export const EQUIPMENT_PRESETS = [
  '起跑架 + 發令槍(起+終)',
  '立定跳遠墊 x8組',
  '跳高墊 + 橫桿 + 丈量尺',
  '跳遠沙坑耙子 + 皮尺',
  '壘球 + 標誌盤',
  '網球趣味器材 x2組',
  '大隊接力棒 + 號碼背心',
  '計時碼表 + 名次牌 + 紀錄夾',
];

export const REFEREE_ROLE_PRESETS = ['裁判長', '丈量', '叫人/檢錄', '發令', '終點判定', '紀錄成績'];

export const COMMAND_SLOT_TYPES = [
  { id: 'host', label: '司儀播報' },
  { id: 'award', label: '穿插頒獎' },
] as const;
