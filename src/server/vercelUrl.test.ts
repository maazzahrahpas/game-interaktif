import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import handler from '../../api/index.ts';
import { normalizeVercelApiUrl } from './vercelUrl.ts';

test('normalizeVercelApiUrl restores rewritten Vercel paths and preserves query params', () => {
  assert.equal(normalizeVercelApiUrl('/api/index?__path=teacher/banks'), '/api/teacher/banks');
  assert.equal(
    normalizeVercelApiUrl('/api/index?__path=teacher/overview&teacherId=teacher_demo_1'),
    '/api/teacher/overview?teacherId=teacher_demo_1'
  );
  assert.equal(normalizeVercelApiUrl('/api/index?__path='), '/api');
  assert.equal(normalizeVercelApiUrl('/api/index'), '/api');
  assert.equal(normalizeVercelApiUrl('/api/health?verbose=1'), '/api/health?verbose=1');
});

async function withTestServer(fn: (baseUrl: string) => Promise<void>) {
  const server = http.createServer((req, res) => {
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

test('Vercel API handler routes /api/* rewrites to Express endpoints and returns JSON 404 for unknown routes', async () => {
  await withTestServer(async (baseUrl) => {
    // 1. Health check via Vercel rewrite URL
    const healthRes = await fetch(`${baseUrl}/api/index?__path=health`);
    assert.equal(healthRes.status, 200);
    const healthJson = (await healthRes.json()) as { ok: boolean };
    assert.equal(healthJson.ok, true);

    // 2. Save question bank via Vercel rewrite URL
    const bankRes = await fetch(`${baseUrl}/api/index?__path=teacher/banks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherId: 'teacher_vercel_test',
        title: 'Bank Soal Uji Vercel',
        subject: 'Matematika',
        grade: '11',
        topic: 'Aljabar',
        difficulty: 'Sedang',
        items: [
          {
            prompt: 'Berapakah hasil dari 3 x 4?',
            options: ['7', '12', '15', '9'],
            correctIndex: 1,
            explanation: '3 dikali 4 sama dengan 12.',
            points: 20,
          },
        ],
      }),
    });
    assert.equal(bankRes.status, 200);
    const bankJson = (await bankRes.json()) as {
      ok: boolean;
      bank: { id: string; title: string };
      questions: Array<{ id: string }>;
      answerKeys: Array<{ questionId: string }>;
    };
    assert.equal(bankJson.ok, true);
    assert.equal(bankJson.bank.title, 'Bank Soal Uji Vercel');
    assert.equal(bankJson.questions.length, 1);
    assert.equal(bankJson.answerKeys.length, 1);

    // 3. Create classroom via Vercel rewrite URL
    const clsRes = await fetch(`${baseUrl}/api/index?__path=teacher/classes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherId: 'teacher_vercel_test',
        name: 'XI IPA Vercel',
        grade: '11',
        subject: 'Matematika',
      }),
    });
    assert.equal(clsRes.status, 200);
    const clsJson = (await clsRes.json()) as { ok: boolean; classroom: { id: string } };
    assert.equal(clsJson.ok, true);

    // 4. Create session using snapshot hydration (simulates cold serverless instance)
    const nowIso = new Date().toISOString();
    const sessRes = await fetch(`${baseUrl}/api/index?__path=teacher/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherId: 'teacher_vercel_test',
        classId: 'cls_cold_snapshot',
        bankId: 'bank_cold_snapshot',
        title: 'Sesi Snapshot Cold Lambda',
        gameMode: 'Quiz Adventure',
        difficulty: 'Sedang',
        durationMinutes: 30,
        maxAttempts: 2,
        requireIdentity: true,
        classroomSnapshot: {
          id: 'cls_cold_snapshot',
          teacherId: 'teacher_vercel_test',
          name: 'XI Snapshot',
          grade: '11',
          subject: 'Matematika',
          inviteCode: 'SNP11',
          isActive: true,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        bankSnapshot: {
          id: 'bank_cold_snapshot',
          teacherId: 'teacher_vercel_test',
          title: 'Bank Snapshot',
          subject: 'Matematika',
          grade: '11',
          topic: 'Aljabar',
          difficulty: 'Sedang',
          questionCount: 1,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        questionsSnapshot: [
          {
            id: 'q_cold_1',
            bankId: 'bank_cold_snapshot',
            teacherId: 'teacher_vercel_test',
            orderIndex: 0,
            prompt: 'Berapakah 5 + 5?',
            options: ['8', '10', '12', '14'],
            points: 25,
            difficulty: 'Mudah',
            isPublished: true,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        ],
        answerKeysSnapshot: [
          {
            questionId: 'q_cold_1',
            bankId: 'bank_cold_snapshot',
            teacherId: 'teacher_vercel_test',
            correctIndex: 1,
            correctLetter: 'B',
            explanation: '5 + 5 = 10',
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        ],
      }),
    });
    assert.equal(sessRes.status, 200);
    const sessJson = (await sessRes.json()) as {
      ok: boolean;
      session: { joinCode: string; questionCount: number; totalPoints: number };
    };
    assert.equal(sessJson.ok, true);
    assert.equal(sessJson.session.questionCount, 1);
    assert.equal(sessJson.session.totalPoints, 25);

    // 5. Unknown API route returns JSON 404 (not HTML)
    const missingRes = await fetch(`${baseUrl}/api/index?__path=unknown/route`);
    assert.equal(missingRes.status, 404);
    const missingJson = (await missingRes.json()) as { ok: boolean; error: string };
    assert.equal(missingJson.ok, false);
    assert.ok(missingJson.error.length > 0);
  });
});
