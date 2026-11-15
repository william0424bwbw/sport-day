-- 專案層級的設定（API JSON 的 settings 物件），由管理者在「設定」頁修改
--   contact：聯絡窗口，例如「體育組 楊合萍老師」，所有人都看得到
--   settings_extra：settings 裡其他沒有對應欄位的屬性（JSON）
ALTER TABLE projects ADD COLUMN contact TEXT;
ALTER TABLE projects ADD COLUMN settings_extra TEXT;
