// 賽程資料 <-> D1 資料表
// 對外（API / 前端）仍是同一份 JSON：{ venues, dates, events }
// 寫入時用 SQLite 的 json_each 在資料庫內拆解，每張表只需 1 條 SQL，
// 不受「每條 SQL 最多 100 個參數」與「每次請求最多 50 條查詢」限制。
// 欄位對應需與 migrations/0003_copy_json_to_tables.sql 一致。

// ---------- 寫入 ----------
// ?1 = projectId，?2 = 整份 JSON 字串
const WRITE_SQL = [
  `INSERT INTO projects (id, updated_at) VALUES (?1, ?3)
   ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,

  // 先清掉這個專案的舊資料（子表先刪，不依賴外鍵 CASCADE）
  `DELETE FROM event_venues      WHERE project_id = ?1`,
  `DELETE FROM event_referees    WHERE project_id = ?1`,
  `DELETE FROM event_equipment   WHERE project_id = ?1`,
  `DELETE FROM event_attachments WHERE project_id = ?1`,
  `DELETE FROM events            WHERE project_id = ?1`,
  `DELETE FROM command_slots     WHERE project_id = ?1`,
  `DELETE FROM days              WHERE project_id = ?1`,
  `DELETE FROM venues            WHERE project_id = ?1`,

  `INSERT INTO venues (project_id, id, sort_order, name, subtitle, extra)
   SELECT ?1, json_extract(v.value, '$.id'), v.key,
          json_extract(v.value, '$.name'), json_extract(v.value, '$.subtitle'),
          NULLIF(json_remove(v.value, '$.id', '$.name', '$.subtitle'), '{}')
     FROM json_each(?2, '$.venues') v WHERE v.type = 'object'`,

  `INSERT INTO days (project_id, id, sort_order, label, category, command_deck_enabled,
                     staff_hosts, staff_recorders, staff_stage_control, extra)
   SELECT ?1, json_extract(d.value, '$.id'), d.key,
          json_extract(d.value, '$.label'), json_extract(d.value, '$.category'),
          json_extract(d.value, '$.commandDeckEnabled'),
          json_extract(d.value, '$.generalStaff.hosts'),
          json_extract(d.value, '$.generalStaff.recorders'),
          json_extract(d.value, '$.generalStaff.stageControl'),
          NULLIF(json_remove(d.value, '$.id', '$.label', '$.category', '$.commandDeckEnabled',
                             '$.generalStaff', '$.commandSlots'), '{}')
     FROM json_each(?2, '$.dates') d WHERE d.type = 'object'`,

  `INSERT INTO command_slots (project_id, id, day_id, sort_order, type, start_min, end_min, staff, content, extra)
   SELECT ?1, json_extract(s.value, '$.id'), json_extract(d.value, '$.id'), s.key,
          json_extract(s.value, '$.type'), json_extract(s.value, '$.startMin'),
          json_extract(s.value, '$.endMin'), json_extract(s.value, '$.staff'),
          json_extract(s.value, '$.content'),
          NULLIF(json_remove(s.value, '$.id', '$.type', '$.startMin', '$.endMin', '$.staff', '$.content'), '{}')
     FROM json_each(?2, '$.dates') d, json_each(d.value, '$.commandSlots') s
    WHERE d.type = 'object' AND s.type = 'object'`,

  `INSERT INTO events (project_id, id, sort_order, day_id, title, color, start_min, end_min,
                       check_in_offset_min, link_prev, volunteer_count, volunteer_task,
                       student_count, student_task, lane_note, actual_start_min, actual_end_min, extra)
   SELECT ?1, json_extract(e.value, '$.id'), e.key,
          json_extract(e.value, '$.dateId'), json_extract(e.value, '$.title'),
          json_extract(e.value, '$.color'), json_extract(e.value, '$.startMin'),
          json_extract(e.value, '$.endMin'), json_extract(e.value, '$.checkInOffsetMin'),
          json_extract(e.value, '$.linkPrev'), json_extract(e.value, '$.volunteerCount'),
          json_extract(e.value, '$.volunteerTask'), json_extract(e.value, '$.studentCount'),
          json_extract(e.value, '$.studentTask'), json_extract(e.value, '$.laneNote'),
          json_extract(e.value, '$.actualStartMin'), json_extract(e.value, '$.actualEndMin'),
          NULLIF(json_remove(e.value, '$.id', '$.dateId', '$.title', '$.color', '$.startMin', '$.endMin',
                             '$.checkInOffsetMin', '$.linkPrev', '$.volunteerCount', '$.volunteerTask',
                             '$.studentCount', '$.studentTask', '$.laneNote', '$.actualStartMin',
                             '$.actualEndMin', '$.venueIds', '$.referees', '$.equipment', '$.attachments'), '{}')
     FROM json_each(?2, '$.events') e WHERE e.type = 'object'`,

  `INSERT INTO event_venues (project_id, event_id, sort_order, venue_id)
   SELECT ?1, json_extract(e.value, '$.id'), v.key, v.value
     FROM json_each(?2, '$.events') e, json_each(e.value, '$.venueIds') v
    WHERE e.type = 'object'`,

  `INSERT INTO event_referees (project_id, event_id, sort_order, role, name, extra)
   SELECT ?1, json_extract(e.value, '$.id'), r.key,
          json_extract(r.value, '$.role'), json_extract(r.value, '$.name'),
          NULLIF(json_remove(r.value, '$.role', '$.name'), '{}')
     FROM json_each(?2, '$.events') e, json_each(e.value, '$.referees') r
    WHERE e.type = 'object' AND r.type = 'object'`,

  `INSERT INTO event_equipment (project_id, event_id, sort_order, item)
   SELECT ?1, json_extract(e.value, '$.id'), q.key, q.value
     FROM json_each(?2, '$.events') e, json_each(e.value, '$.equipment') q
    WHERE e.type = 'object'`,

  `INSERT INTO event_attachments (project_id, event_id, sort_order, name, type, data_url, extra)
   SELECT ?1, json_extract(e.value, '$.id'), a.key,
          json_extract(a.value, '$.name'), json_extract(a.value, '$.type'),
          json_extract(a.value, '$.dataUrl'),
          NULLIF(json_remove(a.value, '$.name', '$.type', '$.dataUrl'), '{}')
     FROM json_each(?2, '$.events') e, json_each(e.value, '$.attachments') a
    WHERE e.type = 'object' AND a.type = 'object'`,
];

// 檢查 payload：每筆資料要有 id，且同類型內不可重複（否則主鍵衝突、整次儲存失敗）
export function validatePayload(body) {
  if (!body || typeof body !== 'object') return 'payload 必須是物件';
  if (!Array.isArray(body.events)) return 'events 必須是陣列';
  for (const key of ['venues', 'dates']) {
    if (body[key] !== undefined && !Array.isArray(body[key])) return `${key} 必須是陣列`;
  }
  const checkIds = (label, list) => {
    const seen = new Set();
    for (const item of list) {
      if (!item || typeof item !== 'object') return `${label} 內有非物件的項目`;
      const id = item.id;
      if (typeof id !== 'string' && typeof id !== 'number') return `${label} 有項目缺少 id`;
      if (seen.has(String(id))) return `${label} 的 id 重複：${id}`;
      seen.add(String(id));
    }
    return null;
  };
  const slots = (body.dates || []).flatMap(d => (d && Array.isArray(d.commandSlots) ? d.commandSlots : []));
  return checkIds('venues', body.venues || [])
      || checkIds('dates', body.dates || [])
      || checkIds('commandSlots', slots)
      || checkIds('events', body.events);
}

export async function writeProject(db, projectId, body) {
  const updatedAt = Date.now();
  const payload = JSON.stringify({
    venues: body.venues ?? [],
    dates: body.dates ?? [],
    events: body.events,
  });
  const args = [projectId, payload, updatedAt];
  // batch = 單一交易：任何一條失敗就整批回復
  await db.batch(WRITE_SQL.map(sql => db.prepare(sql).bind(...args.slice(0, maxParam(sql)))));
  return updatedAt;
}

// 每條 SQL 只綁定用到的參數（?1..?N），多綁會被 D1 視為錯誤
function maxParam(sql) {
  return Math.max(...[...sql.matchAll(/\?(\d+)/g)].map(m => Number(m[1])));
}

// ---------- 讀取 ----------
const READ_SQL = [
  `SELECT updated_at FROM projects WHERE id = ?1`,
  `SELECT * FROM venues            WHERE project_id = ?1 ORDER BY sort_order`,
  `SELECT * FROM days              WHERE project_id = ?1 ORDER BY sort_order`,
  `SELECT * FROM command_slots     WHERE project_id = ?1 ORDER BY sort_order`,
  `SELECT * FROM events            WHERE project_id = ?1 ORDER BY sort_order`,
  `SELECT * FROM event_venues      WHERE project_id = ?1 ORDER BY sort_order`,
  `SELECT * FROM event_referees    WHERE project_id = ?1 ORDER BY sort_order`,
  `SELECT * FROM event_equipment   WHERE project_id = ?1 ORDER BY sort_order`,
  `SELECT * FROM event_attachments WHERE project_id = ?1 ORDER BY sort_order`,
];

// 組物件：NULL 欄位不輸出（與原本 JSON「沒有這個屬性」一致），再併入 extra
function build(fields, extra) {
  const obj = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== null && value !== undefined) obj[key] = value;
  }
  return extra ? { ...obj, ...JSON.parse(extra) } : obj;
}
const bool = (v) => (v === null || v === undefined ? null : Boolean(v));

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row[key])) map.set(row[key], []);
    map.get(row[key]).push(row);
  }
  return map;
}

export async function readProject(db, projectId) {
  const results = await db.batch(READ_SQL.map(sql => db.prepare(sql).bind(projectId)));
  const [project, venues, days, slots, events, evVenues, referees, equipment, attachments] =
    results.map(r => r.results);
  if (!project.length) return null;

  const slotsByDay = groupBy(slots, 'day_id');
  const venuesByEvent = groupBy(evVenues, 'event_id');
  const refsByEvent = groupBy(referees, 'event_id');
  const equipByEvent = groupBy(equipment, 'event_id');
  const attsByEvent = groupBy(attachments, 'event_id');

  return {
    venues: venues.map(v => build({ id: v.id, name: v.name, subtitle: v.subtitle }, v.extra)),

    dates: days.map(d => {
      const staff = build({ hosts: d.staff_hosts, recorders: d.staff_recorders, stageControl: d.staff_stage_control });
      return build({
        id: d.id,
        label: d.label,
        category: d.category,
        commandDeckEnabled: bool(d.command_deck_enabled),
        generalStaff: Object.keys(staff).length ? staff : null,
        commandSlots: (slotsByDay.get(d.id) || []).map(s => build({
          id: s.id, type: s.type, startMin: s.start_min, endMin: s.end_min, staff: s.staff, content: s.content,
        }, s.extra)),
      }, d.extra);
    }),

    events: events.map(e => build({
      id: e.id,
      dateId: e.day_id,
      venueIds: (venuesByEvent.get(e.id) || []).map(v => v.venue_id),
      startMin: e.start_min,
      endMin: e.end_min,
      checkInOffsetMin: e.check_in_offset_min,
      linkPrev: bool(e.link_prev),
      title: e.title,
      color: e.color,
      referees: (refsByEvent.get(e.id) || []).map(r => build({ role: r.role, name: r.name }, r.extra)),
      volunteerCount: e.volunteer_count,
      volunteerTask: e.volunteer_task,
      studentCount: e.student_count,
      studentTask: e.student_task,
      equipment: (equipByEvent.get(e.id) || []).map(q => q.item),
      laneNote: e.lane_note,
      attachments: (attsByEvent.get(e.id) || []).map(a => build({ name: a.name, type: a.type, dataUrl: a.data_url }, a.extra)),
      actualStartMin: e.actual_start_min,
      actualEndMin: e.actual_end_min,
    }, e.extra)),

    updatedAt: project[0].updated_at,
  };
}

export async function readVersion(db, projectId) {
  const row = await db.prepare('SELECT updated_at FROM projects WHERE id = ?1').bind(projectId).first();
  return row?.updated_at ?? null;
}
