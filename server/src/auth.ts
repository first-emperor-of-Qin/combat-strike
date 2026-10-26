import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Context, Next } from 'hono';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SECRET_FILE = join(__dirname, '..', 'data', 'jwt.key');

// ---- JWT 密钥：首次启动生成并持久化 ----
let secretKey: Uint8Array;
if (existsSync(SECRET_FILE)) {
  secretKey = new Uint8Array(readFileSync(SECRET_FILE));
} else {
  mkdirSync(dirname(SECRET_FILE), { recursive: true });
  secretKey = new Uint8Array(randomBytes(48));
  writeFileSync(SECRET_FILE, secretKey, { mode: 0o600 });
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export async function signToken(userId: number, username: string): Promise<string> {
  return new SignJWT({ uid: userId, name: username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey);
}

export async function verifyToken(token: string): Promise<{ uid: number; name: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    if (typeof payload.uid !== 'number' || typeof payload.name !== 'string') return null;
    return { uid: payload.uid, name: payload.name };
  } catch {
    return null;
  }
}

/** 认证中间件：校验 Bearer token 并注入 uid */
export type Env = { Variables: { uid: number; username: string } };

export async function requireAuth(c: Context<Env>, next: Next) {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return c.json({ error: '未登录' }, 401);
  const claims = await verifyToken(token);
  if (!claims) return c.json({ error: '登录已过期，请重新登录' }, 401);
  c.set('uid', claims.uid);
  c.set('username', claims.name);
  await next();
}

// ---- 输入校验 ----
const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/;

export function validateCredentials(username: unknown, password: unknown): string | null {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return '用户名需 2-20 位，仅限中英文、数字或下划线';
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 64) {
    return '密码长度需在 6-64 位之间';
  }
  return null;
}
