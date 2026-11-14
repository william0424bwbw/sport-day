-- 資料已拆進各資料表（0003），移除舊的整份 JSON 欄位
ALTER TABLE projects DROP COLUMN data;
