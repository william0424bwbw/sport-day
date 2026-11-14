-- 把 projects.data（整份 JSON）拆進 0002 建立的資料表。
-- 欄位對應與 src/db.js 的寫入邏輯相同；未知屬性存進 extra。

INSERT INTO venues (project_id, id, sort_order, name, subtitle, extra)
SELECT p.id,
       json_extract(v.value, '$.id'),
       v.key,
       json_extract(v.value, '$.name'),
       json_extract(v.value, '$.subtitle'),
       NULLIF(json_remove(v.value, '$.id', '$.name', '$.subtitle'), '{}')
  FROM projects p, json_each(p.data, '$.venues') v
 WHERE json_valid(p.data) AND v.type = 'object';

INSERT INTO days (project_id, id, sort_order, label, category, command_deck_enabled,
                  staff_hosts, staff_recorders, staff_stage_control, extra)
SELECT p.id,
       json_extract(d.value, '$.id'),
       d.key,
       json_extract(d.value, '$.label'),
       json_extract(d.value, '$.category'),
       json_extract(d.value, '$.commandDeckEnabled'),
       json_extract(d.value, '$.generalStaff.hosts'),
       json_extract(d.value, '$.generalStaff.recorders'),
       json_extract(d.value, '$.generalStaff.stageControl'),
       NULLIF(json_remove(d.value, '$.id', '$.label', '$.category', '$.commandDeckEnabled',
                          '$.generalStaff', '$.commandSlots'), '{}')
  FROM projects p, json_each(p.data, '$.dates') d
 WHERE json_valid(p.data) AND d.type = 'object';

INSERT INTO command_slots (project_id, id, day_id, sort_order, type, start_min, end_min, staff, content, extra)
SELECT p.id,
       json_extract(s.value, '$.id'),
       json_extract(d.value, '$.id'),
       s.key,
       json_extract(s.value, '$.type'),
       json_extract(s.value, '$.startMin'),
       json_extract(s.value, '$.endMin'),
       json_extract(s.value, '$.staff'),
       json_extract(s.value, '$.content'),
       NULLIF(json_remove(s.value, '$.id', '$.type', '$.startMin', '$.endMin', '$.staff', '$.content'), '{}')
  FROM projects p, json_each(p.data, '$.dates') d, json_each(d.value, '$.commandSlots') s
 WHERE json_valid(p.data) AND d.type = 'object' AND s.type = 'object';

INSERT INTO events (project_id, id, sort_order, day_id, title, color, start_min, end_min,
                    check_in_offset_min, link_prev, volunteer_count, volunteer_task,
                    student_count, student_task, lane_note, actual_start_min, actual_end_min, extra)
SELECT p.id,
       json_extract(e.value, '$.id'),
       e.key,
       json_extract(e.value, '$.dateId'),
       json_extract(e.value, '$.title'),
       json_extract(e.value, '$.color'),
       json_extract(e.value, '$.startMin'),
       json_extract(e.value, '$.endMin'),
       json_extract(e.value, '$.checkInOffsetMin'),
       json_extract(e.value, '$.linkPrev'),
       json_extract(e.value, '$.volunteerCount'),
       json_extract(e.value, '$.volunteerTask'),
       json_extract(e.value, '$.studentCount'),
       json_extract(e.value, '$.studentTask'),
       json_extract(e.value, '$.laneNote'),
       json_extract(e.value, '$.actualStartMin'),
       json_extract(e.value, '$.actualEndMin'),
       NULLIF(json_remove(e.value, '$.id', '$.dateId', '$.title', '$.color', '$.startMin', '$.endMin',
                          '$.checkInOffsetMin', '$.linkPrev', '$.volunteerCount', '$.volunteerTask',
                          '$.studentCount', '$.studentTask', '$.laneNote', '$.actualStartMin',
                          '$.actualEndMin', '$.venueIds', '$.referees', '$.equipment', '$.attachments'), '{}')
  FROM projects p, json_each(p.data, '$.events') e
 WHERE json_valid(p.data) AND e.type = 'object';

INSERT INTO event_venues (project_id, event_id, sort_order, venue_id)
SELECT p.id, json_extract(e.value, '$.id'), v.key, v.value
  FROM projects p, json_each(p.data, '$.events') e, json_each(e.value, '$.venueIds') v
 WHERE json_valid(p.data) AND e.type = 'object';

INSERT INTO event_referees (project_id, event_id, sort_order, role, name, extra)
SELECT p.id,
       json_extract(e.value, '$.id'),
       r.key,
       json_extract(r.value, '$.role'),
       json_extract(r.value, '$.name'),
       NULLIF(json_remove(r.value, '$.role', '$.name'), '{}')
  FROM projects p, json_each(p.data, '$.events') e, json_each(e.value, '$.referees') r
 WHERE json_valid(p.data) AND e.type = 'object' AND r.type = 'object';

INSERT INTO event_equipment (project_id, event_id, sort_order, item)
SELECT p.id, json_extract(e.value, '$.id'), q.key, q.value
  FROM projects p, json_each(p.data, '$.events') e, json_each(e.value, '$.equipment') q
 WHERE json_valid(p.data) AND e.type = 'object';

INSERT INTO event_attachments (project_id, event_id, sort_order, name, type, data_url, extra)
SELECT p.id,
       json_extract(e.value, '$.id'),
       a.key,
       json_extract(a.value, '$.name'),
       json_extract(a.value, '$.type'),
       json_extract(a.value, '$.dataUrl'),
       NULLIF(json_remove(a.value, '$.name', '$.type', '$.dataUrl'), '{}')
  FROM projects p, json_each(p.data, '$.events') e, json_each(e.value, '$.attachments') a
 WHERE json_valid(p.data) AND e.type = 'object' AND a.type = 'object';
