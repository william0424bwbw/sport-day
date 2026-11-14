-- 每個專案（例如 school-sports-115）存一份完整賽程 JSON
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  data        TEXT    NOT NULL,          -- { venues, dates, events }
  updated_at  INTEGER NOT NULL           -- epoch ms，前端用來判斷有沒有新版本
);
