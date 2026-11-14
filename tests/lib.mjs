// 測試共用工具（不需額外套件）

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 簡易測試記錄器
export function createReporter(suite) {
  const results = [];
  return {
    check(name, ok, detail = '') {
      results.push({ name, ok: Boolean(ok) });
      console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? `  → ${detail}` : ''}`);
    },
    get failed() { return results.filter(r => !r.ok).length; },
    summary() {
      const failed = this.failed;
      console.log(`  ${suite}: ${results.length - failed}/${results.length} 通過\n`);
      return failed;
    },
  };
}

// 正規化成可比較的形式，等同前端讀取時的處理：
// - 沒有這個屬性 與 值為 null 視為相同
// - 缺少的陣列（venueIds、referees、equipment、attachments、commandSlots）視為 []
// - 物件 key 排序
export function canonical(project) {
  const clean = (value) => {
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') {
      const out = {};
      for (const key of Object.keys(value).sort()) {
        if (value[key] !== null && value[key] !== undefined) out[key] = clean(value[key]);
      }
      return out;
    }
    return value;
  };
  const withArrays = (obj, keys) => {
    const copy = { ...obj };
    for (const k of keys) if (!Array.isArray(copy[k])) copy[k] = [];
    return copy;
  };
  return clean({
    venues: project.venues || [],
    dates: (project.dates || []).map(d => withArrays(d, ['commandSlots'])),
    events: (project.events || []).map(e => withArrays(e, ['venueIds', 'referees', 'equipment', 'attachments'])),
  });
}

// 回傳第一個不同之處的路徑，方便除錯
export function firstDiff(a, b, path = '$') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return `${path}: ${JSON.stringify(a)?.slice(0, 80)} ≠ ${JSON.stringify(b)?.slice(0, 80)}`;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const d = firstDiff(a[k], b[k], `${path}.${k}`);
    if (d) return d;
  }
  return `${path}: 不同`;
}
