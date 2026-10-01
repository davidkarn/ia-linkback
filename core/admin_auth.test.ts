import { describe, expect, it } from '@jest/globals';
import {
  adminCredentials, cookieValue, isAdmin, isValidSession, SESSION_COOKIE, sessionCookieHeader,
  sessionToken,
} from './admin_auth.ts';

const admin = { username: 'librarian', password: 'correct horse' };
const NOW   = 1_800_000_000_000;

describe('adminCredentials', () => {
  it('reads both from the environment, or leaves the panel closed without either', () => {
    expect(adminCredentials({ ADMIN_USERNAME: 'a', ADMIN_PASSWORD: 'b' })).toEqual({ username: 'a', password: 'b' });
    expect(adminCredentials({ ADMIN_USERNAME: 'a' })).toBeUndefined();
    expect(adminCredentials({ ADMIN_USERNAME: 'a', ADMIN_PASSWORD: '' })).toBeUndefined();
  });
});

describe('isAdmin', () => {
  it('takes only the exact username and password', () => {
    expect(isAdmin(admin, admin)).toBe(true);
    expect(isAdmin({ ...admin, password: 'correct horse ' }, admin)).toBe(false);
    expect(isAdmin({ ...admin, username: 'Librarian' }, admin)).toBe(false);
    expect(isAdmin({ username: undefined, password: 42 }, admin)).toBe(false);
  });
});

describe('isValidSession', () => {
  const token = sessionToken(NOW + 1000, admin);

  it('takes a token signed for these credentials until it expires', () => {
    expect(isValidSession(token, admin, NOW)).toBe(true);
    expect(isValidSession(token, admin, NOW + 1000)).toBe(false);
  });

  it('refuses one signed with other credentials, tampered with, or malformed', () => {
    expect(isValidSession(token, { ...admin, password: 'new password' }, NOW)).toBe(false);
    expect(isValidSession(token.replace(/^\d+/, String(NOW + 9_999_999)), admin, NOW)).toBe(false);
    expect(isValidSession('not a token', admin, NOW)).toBe(false);
    expect(isValidSession(undefined, admin, NOW)).toBe(false);
  });
});

describe('cookieValue and sessionCookieHeader', () => {
  it('finds a cookie among others', () => {
    expect(cookieValue(`a=1; ${ SESSION_COOKIE }=123.abc; b=2`, SESSION_COOKIE)).toBe('123.abc');
    expect(cookieValue('a=1', SESSION_COOKIE)).toBeUndefined();
    expect(cookieValue(undefined, SESSION_COOKIE)).toBeUndefined();
  });

  it('sets an http-only, same-site cookie until the session expires, or ends it', () => {
    expect(sessionCookieHeader('t', NOW + 60_000, NOW, true))
      .toBe(`${ SESSION_COOKIE }=t; Path=/; HttpOnly; SameSite=Strict; Max-Age=60; Secure`);
    expect(sessionCookieHeader(null, 0, NOW, false))
      .toBe(`${ SESSION_COOKIE }=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
  });
});
