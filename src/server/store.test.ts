import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { serverStore } from './store.ts';
import { createApiApp } from './createApiRouter.ts';

test('createQuestionBankWithQuestions sanitizes options >5, clamps correctIndex, defaults missing topic, and isolates answer keys', () => {
  const result = serverStore.createQuestionBankWithQuestions({
    teacherId: 'teacher_unit_test',
    title: 'Uji Bank Soal Unit',
    subject: 'Biologi',
    grade: '11',
    topic: '',
    difficulty: 'Sedang',
    items: [
      {
        prompt: 'Apa pusat energi sel?',
        options: ['Ribosom', 'Mitokondria', 'Vakuola', 'Lisosom', 'Nukleus', 'Ekstra 6'],
        correctIndex: 5,
        explanation: 'Mitokondria menghasilkan ATP.',
        points: 25,
      },
    ],
  });

  assert.equal(result.bank.topic, 'Uji Bank Soal Unit');
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].options.length, 5);
  assert.equal(result.answerKeys.length, 1);
  assert.equal(result.answerKeys[0].correctIndex, 4);
  assert.equal(result.answerKeys[0].correctLetter, 'E');
  assert.equal('correctIndex' in result.questions[0], false);
});

test('createQuestionBankWithQuestions rejects blank option text clearly', () => {
  assert.throws(
    () =>
      serverStore.createQuestionBankWithQuestions({
        teacherId: 'teacher_unit_test',
        title: 'Uji Invalid',
        subject: 'Fisika',
        grade: '10',
        items: [
          {
            prompt: 'Pertanyaan valid',
            options: ['Opsi A', '   '],
            correctIndex: 0,
          },
        ],
      }),
    /minimal 2 pilihan jawaban yang tidak kosong/i
  );
});

test('syncQuestionBankFromDrive replaces questions, updates active GameSession totals, and preserves Drive metadata', () => {
  const cls = serverStore.createClassroom({
    teacherId: 'teacher_drive_test',
    name: 'XII IPA Drive Test',
    grade: '12',
    subject: 'Kimia',
  });

  const created = serverStore.createQuestionBankWithQuestions({
    teacherId: 'teacher_drive_test',
    title: 'Bank Kimia Drive v1',
    subject: 'Kimia',
    grade: '12',
    topic: 'Termokimia',
    difficulty: 'Sedang',
    driveFileId: 'drive_file_123',
    driveFileName: 'Soal_Termokimia.docx',
    driveModifiedTime: '2026-02-01T08:00:00.000Z',
    items: [
      {
        prompt: 'Reaksi yang melepas kalor disebut?',
        options: ['Eksoterm', 'Endoterm', 'Redoks', 'Netralisasi'],
        correctIndex: 0,
        points: 20,
      },
    ],
  });

  assert.equal(created.bank.driveFileId, 'drive_file_123');
  assert.equal(created.bank.driveFileName, 'Soal_Termokimia.docx');
  assert.ok(created.bank.lastSyncedAt);

  const session = serverStore.createGameSession({
    teacherId: 'teacher_drive_test',
    classId: cls.id,
    bankId: created.bank.id,
    title: 'Sesi Kimia Drive',
    gameMode: 'Quiz Adventure',
    difficulty: 'Sedang',
    durationMinutes: 30,
    maxAttempts: 2,
    requireIdentity: true,
  });
  assert.equal(session.questionCount, 1);
  assert.equal(session.totalPoints, 20);

  const synced = serverStore.syncQuestionBankFromDrive(created.bank.id, {
    teacherId: 'teacher_drive_test',
    title: 'Bank Kimia Drive v2',
    driveFileId: 'drive_file_123',
    driveFileName: 'Soal_Termokimia_Rev2.docx',
    driveModifiedTime: '2026-02-02T10:30:00.000Z',
    items: [
      {
        prompt: 'Perubahan entalpi reaksi eksoterm bernilai?',
        options: ['Positif', 'Negatif', 'Nol', 'Tak tentu'],
        correctIndex: 1,
        points: 30,
      },
      {
        prompt: 'Satuan SI energi kalor adalah?',
        options: ['Watt', 'Joule', 'Newton', 'Pascal'],
        correctIndex: 1,
        points: 25,
      },
    ],
  });

  assert.ok(synced);
  assert.equal(synced.bank.title, 'Bank Kimia Drive v2');
  assert.equal(synced.bank.driveFileName, 'Soal_Termokimia_Rev2.docx');
  assert.equal(synced.bank.driveModifiedTime, '2026-02-02T10:30:00.000Z');
  assert.equal(synced.bank.questionCount, 2);
  assert.equal(synced.questions.length, 2);
  assert.equal(synced.answerKeys.length, 2);
  assert.equal(synced.answerKeys[0].correctIndex, 1);

  const refreshedOverview = serverStore.getTeacherOverview('teacher_drive_test');
  const bankQuestions = refreshedOverview.questions.filter((q) => q.bankId === created.bank.id);
  const bankKeys = refreshedOverview.answerKeys.filter((k) => k.bankId === created.bank.id);
  const updatedSession = refreshedOverview.gameSessions.find((s) => s.id === session.id);

  assert.equal(bankQuestions.length, 2);
  assert.equal(bankKeys.length, 2);
  assert.equal(updatedSession?.questionCount, 2);
  assert.equal(updatedSession?.totalPoints, 55);
  assert.equal(refreshedOverview.auditLogs[0]?.action, 'SYNC_DRIVE_QUESTION_BANK');
});

test('PUT /api/teacher/banks/:id/sync validates payload, returns 404 on unknown id, and syncs existing bank', async () => {
  const app = createApiApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    // 1. Create bank via POST
    const createRes = await fetch(`${baseUrl}/api/teacher/banks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherId: 'teacher_http_test',
        title: 'Bank HTTP Drive',
        subject: 'Matematika',
        grade: '11',
        driveFileId: 'drive_http_1',
        driveFileName: 'Matematika.docx',
        driveModifiedTime: '2026-03-01T00:00:00.000Z',
        items: [
          { prompt: '2 + 2 = ?', options: ['3', '4', '5', '6'], correctIndex: 1, points: 20 },
        ],
      }),
    });
    assert.equal(createRes.status, 200);
    const createdJson = (await createRes.json()) as { ok: boolean; bank: { id: string } };
    assert.equal(createdJson.ok, true);

    // 2. Reject empty items (400)
    const badRes = await fetch(`${baseUrl}/api/teacher/banks/${createdJson.bank.id}/sync`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [] }),
    });
    assert.equal(badRes.status, 400);

    // 3. Reject unknown bankId (404)
    const notFoundRes = await fetch(`${baseUrl}/api/teacher/banks/bank_does_not_exist/sync`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ prompt: 'Pertanyaan 1', options: ['A', 'B'], correctIndex: 0 }],
      }),
    });
    assert.equal(notFoundRes.status, 404);

    // 4. Valid PUT sync (200)
    const syncRes = await fetch(`${baseUrl}/api/teacher/banks/${createdJson.bank.id}/sync`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherId: 'teacher_http_test',
        title: 'Bank HTTP Drive Updated',
        driveFileId: 'drive_http_1',
        driveFileName: 'Matematika_V2.docx',
        driveModifiedTime: '2026-03-02T00:00:00.000Z',
        items: [
          { prompt: '5 × 5 = ?', options: ['10', '20', '25', '30'], correctIndex: 2, points: 40 },
          { prompt: '10 / 2 = ?', options: ['2', '5', '8', '10'], correctIndex: 1, points: 40 },
        ],
      }),
    });
    assert.equal(syncRes.status, 200);
    const syncJson = (await syncRes.json()) as {
      ok: boolean;
      bank: { title: string; questionCount: number; driveFileName: string };
      questions: Array<{ id: string }>;
    };
    assert.equal(syncJson.ok, true);
    assert.equal(syncJson.bank.title, 'Bank HTTP Drive Updated');
    assert.equal(syncJson.bank.questionCount, 2);
    assert.equal(syncJson.bank.driveFileName, 'Matematika_V2.docx');
    assert.equal(syncJson.questions.length, 2);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

