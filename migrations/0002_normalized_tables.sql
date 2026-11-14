-- 把整份 JSON 拆成資料表。每張表用 project_id 區分不同場運動會。
-- 時間欄位（*_min）都是「從 0:00 起算的分鐘數」，例如 540 = 09:00。
-- extra：前端有、但資料表還沒有對應欄位的屬性，以 JSON 暫存，避免資料遺失。

-- 場地
CREATE TABLE venues (
  project_id  TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  id          TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL,
  name        TEXT,
  subtitle    TEXT,
  extra       TEXT,
  PRIMARY KEY (project_id, id)
);

-- 比賽日（含當日主持、紀錄、場控人員）
CREATE TABLE days (
  project_id            TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  id                    TEXT    NOT NULL,
  sort_order            INTEGER NOT NULL,
  label                 TEXT,
  category              TEXT,
  command_deck_enabled  INTEGER,            -- 0 / 1
  staff_hosts           TEXT,               -- generalStaff.hosts
  staff_recorders       TEXT,               -- generalStaff.recorders
  staff_stage_control   TEXT,               -- generalStaff.stageControl
  extra                 TEXT,
  PRIMARY KEY (project_id, id)
);

-- 司令台播報時段
CREATE TABLE command_slots (
  project_id  TEXT    NOT NULL,
  id          TEXT    NOT NULL,
  day_id      TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL,
  type        TEXT,
  start_min   INTEGER,
  end_min     INTEGER,
  staff       TEXT,
  content     TEXT,
  extra       TEXT,
  PRIMARY KEY (project_id, id),
  FOREIGN KEY (project_id, day_id) REFERENCES days(project_id, id) ON DELETE CASCADE
);

-- 賽程（畫面上的一個方塊）
-- day_id 不加外鍵：前端刪除比賽日時若還有賽程，不應讓整次儲存失敗（用 v_integrity_issues 檢查）
CREATE TABLE events (
  project_id           TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  id                   TEXT    NOT NULL,
  sort_order           INTEGER NOT NULL,
  day_id               TEXT,
  title                TEXT,
  color                TEXT,
  start_min            INTEGER,
  end_min              INTEGER,
  check_in_offset_min  INTEGER,
  link_prev            INTEGER,             -- 0 / 1：與前一項目磁吸連動
  volunteer_count      INTEGER,
  volunteer_task       TEXT,
  student_count        INTEGER,
  student_task         TEXT,
  lane_note            TEXT,
  actual_start_min     INTEGER,
  actual_end_min       INTEGER,
  extra                TEXT,
  PRIMARY KEY (project_id, id)
);
CREATE INDEX idx_events_day ON events (project_id, day_id, start_min);

-- 賽程使用的場地（一個賽程可以跨多個場地）
-- venue_id 不加外鍵，理由同 events.day_id
CREATE TABLE event_venues (
  project_id  TEXT    NOT NULL,
  event_id    TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL,
  venue_id    TEXT,
  PRIMARY KEY (project_id, event_id, sort_order),
  FOREIGN KEY (project_id, event_id) REFERENCES events(project_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_event_venues_venue ON event_venues (project_id, venue_id);

-- 裁判 / 工作分配
CREATE TABLE event_referees (
  project_id  TEXT    NOT NULL,
  event_id    TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL,
  role        TEXT,
  name        TEXT,
  extra       TEXT,
  PRIMARY KEY (project_id, event_id, sort_order),
  FOREIGN KEY (project_id, event_id) REFERENCES events(project_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_event_referees_name ON event_referees (project_id, name);

-- 器材
CREATE TABLE event_equipment (
  project_id  TEXT    NOT NULL,
  event_id    TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL,
  item        TEXT,
  PRIMARY KEY (project_id, event_id, sort_order),
  FOREIGN KEY (project_id, event_id) REFERENCES events(project_id, id) ON DELETE CASCADE
);

-- 道次表附件（目前 data_url 存 base64；之後改存 R2，只留 r2_key）
CREATE TABLE event_attachments (
  project_id  TEXT    NOT NULL,
  event_id    TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL,
  name        TEXT,
  type        TEXT,
  data_url    TEXT,
  extra       TEXT,
  PRIMARY KEY (project_id, event_id, sort_order),
  FOREIGN KEY (project_id, event_id) REFERENCES events(project_id, id) ON DELETE CASCADE
);

-- 方便閱讀的賽程總表（在 D1 Console 或 wrangler d1 execute 查詢用）
CREATE VIEW v_schedule AS
SELECT
  e.project_id,
  e.day_id,
  d.label AS day_label,
  printf('%02d:%02d', e.start_min / 60, e.start_min % 60) AS start_hhmm,
  printf('%02d:%02d', e.end_min / 60, e.end_min % 60)     AS end_hhmm,
  (SELECT group_concat(COALESCE(v.name, ev.venue_id), '、')
     FROM event_venues ev
     LEFT JOIN venues v ON v.project_id = ev.project_id AND v.id = ev.venue_id
    WHERE ev.project_id = e.project_id AND ev.event_id = e.id) AS venue_names,
  e.title,
  e.check_in_offset_min,
  (SELECT group_concat(r.role || '：' || COALESCE(r.name, ''), '；')
     FROM event_referees r
    WHERE r.project_id = e.project_id AND r.event_id = e.id) AS referees,
  e.volunteer_count,
  e.student_count,
  e.start_min,
  e.end_min,
  e.id AS event_id
FROM events e
LEFT JOIN days d ON d.project_id = e.project_id AND d.id = e.day_id;

-- 資料完整性檢查：指到不存在的比賽日或場地的賽程
CREATE VIEW v_integrity_issues AS
SELECT e.project_id, e.id AS event_id, e.title, 'day_not_found' AS issue, e.day_id AS ref
  FROM events e
 WHERE NOT EXISTS (SELECT 1 FROM days d WHERE d.project_id = e.project_id AND d.id = e.day_id)
UNION ALL
SELECT ev.project_id, ev.event_id, e.title, 'venue_not_found', ev.venue_id
  FROM event_venues ev
  JOIN events e ON e.project_id = ev.project_id AND e.id = ev.event_id
 WHERE NOT EXISTS (SELECT 1 FROM venues v WHERE v.project_id = ev.project_id AND v.id = ev.venue_id);
