// 測試主程式：建立獨立的本機 D1 → 套用 migrations → 啟動 wrangler dev → 跑測試 → 關閉
// 用法：node tests/run.mjs [--snapshot <正式資料.json>] [--skip-e2e]
import { spawn, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runApiTests } from './api.test.mjs';
import { runE2eTests } from './e2e.test.mjs';
import { sleep } from './lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const snapshotFile = args.includes('--snapshot') ? args[args.indexOf('--snapshot') + 1] : null;
const skipE2e = args.includes('--skip-e2e');

const PORT = 8799;
const BASE = `http://localhost:${PORT}`;
const TOKEN = 'test-admin-token';
const PERSIST = join(root, '.wrangler', 'test-state');
const isWin = process.platform === 'win32';
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: process.env.CI || 'true' };
const wranglerBin = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

function wrangler(argv) {
  const r = spawnSync(process.execPath, [wranglerBin, ...argv], { cwd: root, env, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    throw new Error(`wrangler ${argv.join(' ')} 失敗`);
  }
  return r.stdout;
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (isWin) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); } }
}

let dev;
let failed = 0;
try {
  console.log('▶ 準備獨立的本機測試資料庫');
  rmSync(PERSIST, { recursive: true, force: true });
  wrangler(['d1', 'migrations', 'apply', 'sport-day-db', '--local', '--persist-to', PERSIST]);

  console.log('▶ 啟動 wrangler dev');
  dev = spawn(process.execPath, [wranglerBin, 'dev', '--port', String(PORT), '--persist-to', PERSIST,
    '--var', `ADMIN_TOKEN:${TOKEN}`, '--show-interactive-dev-session=false'],
  { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], detached: !isWin });
  let log = '';
  dev.stdout.on('data', d => { log += d; });
  dev.stderr.on('data', d => { log += d; });

  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) {
    try { ready = (await fetch(`${BASE}/api/health`)).ok; } catch { await sleep(500); }
  }
  if (!ready) {
    console.error(log);
    throw new Error('wrangler dev 沒有啟動');
  }
  console.log(`  ✔ ${BASE}\n`);

  failed += await runApiTests({ base: BASE, token: TOKEN, snapshotFile });
  if (!skipE2e) failed += await runE2eTests({ base: BASE, token: TOKEN });
} catch (err) {
  console.error('❌', err.message);
  failed += 1;
} finally {
  killTree(dev);
}

console.log(failed ? `❌ 共 ${failed} 項失敗` : '🎉 全部測試通過');
process.exit(failed ? 1 : 0);
