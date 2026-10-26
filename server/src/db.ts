import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_OWNED } from '@combat-strike/shared';

// node:sqlite 用运行时 require 加载（打包器/测试环境无需解析该内置模块）
const require_ = createRequire(import.meta.url);
const { DatabaseSync } = require_('node:sqlite') as typeof import('node:sqlite');

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.CS_DATA_DIR ?? join(__dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(join(DATA_DIR, 'game.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    pass_hash TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    xp INTEGER NOT NULL DEFAULT 0,
    gold INTEGER NOT NULL DEFAULT 1500,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_weapons (
    user_id INTEGER NOT NULL,
    weapon_id TEXT NOT NULL,
    acquired_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, weapon_id)
  );
  CREATE TABLE IF NOT EXISTS progress (
    user_id INTEGER PRIMARY KEY,
    chapter_unlocked INTEGER NOT NULL DEFAULT 1,
    chapter_cleared TEXT NOT NULL DEFAULT '[]',
    kills INTEGER NOT NULL DEFAULT 0,
    deaths INTEGER NOT NULL DEFAULT 0,
    runs INTEGER NOT NULL DEFAULT 0,
    best_wave INTEGER NOT NULL DEFAULT 0,
    playtime_sec INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS loadout (
    user_id INTEGER PRIMARY KEY,
    primary_w TEXT,
    secondary_w TEXT
  );
  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    chapter INTEGER NOT NULL,
    success INTEGER NOT NULL,
    kills INTEGER NOT NULL,
    wave INTEGER NOT NULL,
    gold INTEGER NOT NULL DEFAULT 0,
    xp INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_runs_user ON runs(user_id, chapter, created_at);
`);

/** 新用户初始化：赠送初始武器 + 默认配装 */
export function initNewUser(userId: number): void {
  const now = Date.now();
  const ins = db.prepare('INSERT OR IGNORE INTO user_weapons (user_id, weapon_id, acquired_at) VALUES (?, ?, ?)');
  for (const id of DEFAULT_OWNED) ins.run(userId, id, now);
  db.prepare('INSERT OR IGNORE INTO progress (user_id) VALUES (?)').run(userId);
  db.prepare('INSERT OR IGNORE INTO loadout (user_id, primary_w, secondary_w) VALUES (?, ?, ?)')
    .run(userId, DEFAULT_OWNED[0] ?? 'thunder-mk1', DEFAULT_OWNED[1] ?? 'shadow-smg');
}
