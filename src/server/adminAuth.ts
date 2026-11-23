import crypto from 'node:crypto';

export interface StoredAdminCredential {
  salt: string;
  hash: string;
  updatedAt: string;
}

export interface AdminTokenPayload {
  jti: string;
  sub: string;
  role: 'super_admin';
  iat: number;
  exp: number;
}

const RUNTIME_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');
const revokedTokenIds = new Set<string>();

function resolveSigningSecret(overrideSecret?: string): string {
  const fromArg = overrideSecret?.trim();
  if (fromArg) return fromArg;
  const fromEnv = process.env.ADMIN_SESSION_SECRET?.trim();
  if (fromEnv) return fromEnv;
  const fromGemini = process.env.GEMINI_API_KEY?.trim();
  if (fromGemini) {
    return crypto.createHash('sha256').update(`eduverse-admin:${fromGemini}`).digest('hex');
  }
  return RUNTIME_FALLBACK_SECRET;
}

export function hashAdminPassword(password: string, existingSalt?: string): StoredAdminCredential {
  const clean = String(password || '');
  if (clean.length < 6) {
    throw new Error('Password admin minimal 6 karakter.');
  }
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(clean, salt, 64).toString('hex');
  return {
    salt,
    hash: derived,
    updatedAt: new Date().toISOString(),
  };
}

export function verifyScryptPassword(candidate: string, stored: StoredAdminCredential): boolean {
  if (!candidate || !stored?.salt || !stored?.hash) return false;
  try {
    const candidateBuf = crypto.scryptSync(candidate, stored.salt, 64);
    const storedBuf = Buffer.from(stored.hash, 'hex');
    if (candidateBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(candidateBuf, storedBuf);
  } catch {
    return false;
  }
}

export function verifyPlainPasswordTimingSafe(candidate: string, expected: string): boolean {
  if (!candidate || !expected) return false;
  const candDigest = crypto.createHash('sha256').update(candidate).digest();
  const expDigest = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(candDigest, expDigest);
}

export function createAdminSessionToken(
  subject = 'admin_website',
  ttlSeconds = 60 * 60 * 12,
  overrideSecret?: string
): { token: string; expiresAt: string } {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: AdminTokenPayload = {
    jti: crypto.randomUUID(),
    sub: subject,
    role: 'super_admin',
    iat: nowSec,
    exp: nowSec + ttlSeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', resolveSigningSecret(overrideSecret))
    .update(encodedPayload)
    .digest('base64url');
  return {
    token: `${encodedPayload}.${sig}`,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

export function verifyAdminSessionToken(
  token: string | undefined | null,
  overrideSecret?: string
): AdminTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, providedSig] = parts;
  if (!encodedPayload || !providedSig) return null;

  const expectedSig = crypto
    .createHmac('sha256', resolveSigningSecret(overrideSecret))
    .update(encodedPayload)
    .digest('base64url');

  const providedBuf = Buffer.from(providedSig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (providedBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as AdminTokenPayload;
    if (!parsed || parsed.role !== 'super_admin' || !parsed.jti) return null;
    if (revokedTokenIds.has(parsed.jti)) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof parsed.exp !== 'number' || parsed.exp <= nowSec) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function revokeAdminSessionToken(token: string | undefined | null, overrideSecret?: string): boolean {
  const verified = verifyAdminSessionToken(token, overrideSecret);
  if (!verified) return false;
  revokedTokenIds.add(verified.jti);
  return true;
}

export function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader || typeof authHeader !== 'string') return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}
