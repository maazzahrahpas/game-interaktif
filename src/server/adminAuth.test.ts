import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createAdminSessionToken,
  extractBearerToken,
  hashAdminPassword,
  revokeAdminSessionToken,
  verifyAdminSessionToken,
  verifyPlainPasswordTimingSafe,
  verifyScryptPassword,
} from './adminAuth.ts';
import { createApiApp } from './createApiRouter.ts';

test('scrypt password hashing and timing-safe verification', () => {
  const cred = hashAdminPassword('SamplePass#2026');
  assert.equal(verifyScryptPassword('SamplePass#2026', cred), true);
  assert.equal(verifyScryptPassword('WrongPass#9999', cred), false);

  assert.equal(verifyPlainPasswordTimingSafe('EnvSecret#1', 'EnvSecret#1'), true);
  assert.equal(verifyPlainPasswordTimingSafe('EnvSecret#1', 'EnvSecret#2'), false);
});

test('admin session token creation, verification, bearer parsing, and revocation', () => {
  const { token } = createAdminSessionToken('admin_website', 120, 'unit-test-secret');
  const verified = verifyAdminSessionToken(token, 'unit-test-secret');
  assert.ok(verified);
  assert.equal(verified.role, 'super_admin');
  assert.equal(extractBearerToken(`Bearer ${token}`), token);

  assert.equal(verifyAdminSessionToken(token, 'wrong-secret'), null);
  assert.equal(revokeAdminSessionToken(token, 'unit-test-secret'), true);
  assert.equal(verifyAdminSessionToken(token, 'unit-test-secret'), null);
});

test('admin API endpoints handle env login, token verification, and 50:50 lifeline securely', async () => {
  const prevAdminPass = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = 'UnitTestAdminPassword!42';

  const app = createApiApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const statusRes = await fetch(`${baseUrl}/api/admin/status`);
    const statusJson = await statusRes.json();
    assert.equal(statusRes.status, 200);
    assert.equal(statusJson.configured, true);
    assert.equal(statusJson.source, 'env');

    const badLogin = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'WrongPassword' }),
    });
    assert.equal(badLogin.status, 401);

    const goodLogin = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'UnitTestAdminPassword!42' }),
    });
    const loginJson = await goodLogin.json();
    assert.equal(goodLogin.status, 200);
    assert.equal(loginJson.ok, true);
    assert.ok(loginJson.token);

    const verifyRes = await fetch(`${baseUrl}/api/admin/verify`, {
      headers: { Authorization: `Bearer ${loginJson.token}` },
    });
    assert.equal(verifyRes.status, 200);

    // Fetch public questions of EDU101 (no correctIndex leaked)
    const joinInfoRes = await fetch(`${baseUrl}/api/sessions/join/EDU101`);
    const joinInfoJson = await joinInfoRes.json();
    assert.equal(joinInfoRes.status, 200);
    assert.ok(Array.isArray(joinInfoJson.questions) && joinInfoJson.questions.length > 0);
    const firstQ = joinInfoJson.questions[0];
    assert.equal('correctIndex' in firstQ, false);

    // Request 50:50 distractors from backend
    const lifelineRes = await fetch(`${baseUrl}/api/sessions/EDU101/lifeline-5050`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: firstQ.id }),
    });
    const lifelineJson = await lifelineRes.json();
    assert.equal(lifelineRes.status, 200);
    assert.equal(lifelineJson.ok, true);
    assert.ok(Array.isArray(lifelineJson.eliminatedIndices));
    assert.equal(lifelineJson.eliminatedIndices.length, 2);
    assert.equal('correctIndex' in lifelineJson, false);
  } finally {
    server.close();
    if (prevAdminPass === undefined) {
      delete process.env.ADMIN_PASSWORD;
    } else {
      process.env.ADMIN_PASSWORD = prevAdminPass;
    }
  }
});
