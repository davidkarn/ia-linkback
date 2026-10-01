// Signing in to the admin panel (/tl-admin): one username and password, from ADMIN_USERNAME and
// ADMIN_PASSWORD in .env, and a session cookie holding when it expires, signed with a key made
// from them (so changing the password ends every session). Pure functions; api/admin.controller.ts
// sets and reads the cookie.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type AdminCredentials = { username: string, password: string };

export const SESSION_COOKIE = 'tl_admin_session';
export const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

// The admin credentials from the environment; undefined when either is unset or empty, which
// leaves the admin panel closed
export const adminCredentials = (
  env: Record<string, string | undefined>
): AdminCredentials | undefined => {
  const username = env['ADMIN_USERNAME'] ?? '';
  const password = env['ADMIN_PASSWORD'] ?? '';

  return username.length > 0 && password.length > 0 ? { username, password } : undefined;
};

// Compared by their hashes, so the time taken says nothing about where they differ or how long
// the expected one is
const sameText = (a: string, b: string) => timingSafeEqual(
  createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest(),
);

// Whether the username and password given are the admin's. Both are always compared.
export const isAdmin = (given: { username: unknown, password: unknown }, admin: AdminCredentials) => {
  const username = typeof given.username === 'string' ? given.username : '';
  const password = typeof given.password === 'string' ? given.password : '';
  const userOk   = sameText(username, admin.username);
  const passOk   = sameText(password, admin.password);

  return userOk && passOk;
};

const signature = (expiresAt: number, admin: AdminCredentials) => (
  createHmac('sha256', `${ admin.username }\u0000${ admin.password }`)
    .update(String(expiresAt))
    .digest('base64url')
);

// A session cookie's value, good until expiresAt (ms since the epoch): "<expiresAt>.<signature>"
export const sessionToken = (expiresAt: number, admin: AdminCredentials): string => (
  `${ expiresAt }.${ signature(expiresAt, admin) }`
);

// Whether a session cookie's value was signed for these credentials and hasn't expired by now
export const isValidSession = (
  token: string | undefined, admin: AdminCredentials, now: number
): boolean => {
  const match = token?.match(/^(\d+)\.([\w-]+)$/);

  if (!match) {
    return false;
  }
  else {
    const expiresAt = Number(match[1]);
    const expected  = Buffer.from(signature(expiresAt, admin));
    const given     = Buffer.from(match[2]!);

    return expiresAt > now && given.length === expected.length && timingSafeEqual(given, expected);
  }
};

// A cookie's value from a Cookie header ("a=1; tl_admin_session=..."); undefined when absent
export const cookieValue = (header: string | undefined, name: string): string | undefined => (
  (header ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(name + '='))
    ?.slice(name.length + 1)
);

// The Set-Cookie header for a session good until expiresAt, or, without a token, one ending it.
// secure: the request came over https (not set over plain http, or the browser drops it).
export const sessionCookieHeader = (
  token: string | null, expiresAt: number, now: number, secure: boolean
): string => [
  `${ SESSION_COOKIE }=${ token ?? '' }`,
  'Path=/',
  'HttpOnly',
  'SameSite=Strict',
  `Max-Age=${ token === null ? 0 : Math.max(0, Math.floor((expiresAt - now) / 1000)) }`,
  ...(secure ? ['Secure'] : []),
].join('; ');
