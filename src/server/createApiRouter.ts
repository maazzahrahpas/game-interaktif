import express from 'express';
import { serverStore } from './store.ts';
import {
  createAdminSessionToken,
  extractBearerToken,
  revokeAdminSessionToken,
  verifyAdminSessionToken,
} from './adminAuth.ts';
import {
  explainAnswerConcept,
  generateMissionPlan,
  generateQuestionVariations,
  getStudentHint,
  summarizeLearningResults,
} from './geminiService.ts';

export interface CreateApiAppOptions {
  onBroadcastRoom?: (sessionId: string, payload: unknown) => void;
  getOnlineCount?: (sessionId: string) => number;
}

export function createApiApp(options: CreateApiAppOptions = {}): express.Express {
  const app = express();
  const jsonParser = express.json({ limit: '16mb' });
  const broadcastToRoom = options.onBroadcastRoom ?? (() => undefined);
  const getOnlineCount = options.getOnlineCount ?? (() => 0);

  // Support both raw Node/Express streams and runtimes that pre-populate req.body cleanly
  app.use((req, res, next) => {
    const bodyDesc = Object.getOwnPropertyDescriptor(req, 'body');
    if (
      bodyDesc &&
      'value' in bodyDesc &&
      typeof bodyDesc.value === 'object' &&
      bodyDesc.value !== null &&
      !Buffer.isBuffer(bodyDesc.value)
    ) {
      (req as express.Request & { _body?: boolean })._body = true;
      return next();
    }
    return jsonParser(req, res, next);
  });

  // ==================== REST API ROUTES ====================
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'EDUVERSE Server', timestamp: new Date().toISOString() });
  });

  // ==================== ADMIN AUTH ROUTES ====================
  app.get('/api/admin/status', (_req, res) => {
    return res.json({
      ok: true,
      ...serverStore.getAdminAuthStatus(),
    });
  });

  app.post('/api/admin/setup', (req, res) => {
    try {
      const { password } = req.body || {};
      const clean = String(password || '');
      if (clean.length < 6) {
        return res.status(400).json({ ok: false, error: 'Password admin minimal 6 karakter.' });
      }
      const setup = serverStore.setupInitialAdminPassword(clean);
      if (!setup.ok) {
        return res.status(setup.status).json({ ok: false, error: setup.error });
      }
      const sessionToken = createAdminSessionToken('admin_website');
      return res.json({
        ok: true,
        token: sessionToken.token,
        expiresAt: sessionToken.expiresAt,
        source: 'stored',
      });
    } catch (err) {
      return res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal mengaktifkan password admin.',
      });
    }
  });

  app.post('/api/admin/login', (req, res) => {
    const status = serverStore.getAdminAuthStatus();
    if (status.needsSetup) {
      return res.status(412).json({
        ok: false,
        needsSetup: true,
        error: 'Password admin belum diaktifkan. Silakan atur password admin terlebih dahulu.',
      });
    }
    const { password } = req.body || {};
    if (!serverStore.verifyAdminLogin(String(password || ''))) {
      serverStore.logAudit(
        'anonymous',
        'guru',
        'ADMIN_LOGIN_FAILED',
        'adminAuth',
        'website_admin',
        'Percobaan login Admin Website dengan password tidak valid.'
      );
      return res.status(401).json({ ok: false, error: 'Password admin salah.' });
    }
    const sessionToken = createAdminSessionToken('admin_website');
    serverStore.logAudit(
      'admin_website',
      'super_admin',
      'ADMIN_LOGIN_SUCCESS',
      'adminAuth',
      'website_admin',
      'Admin Website berhasil masuk dengan verifikasi server.'
    );
    return res.json({
      ok: true,
      token: sessionToken.token,
      expiresAt: sessionToken.expiresAt,
      source: status.source,
    });
  });

  app.get('/api/admin/verify', (req, res) => {
    const token = extractBearerToken(req.headers.authorization);
    const verified = verifyAdminSessionToken(token);
    if (!verified) {
      return res.status(401).json({ ok: false, error: 'Sesi admin tidak valid atau sudah berakhir.' });
    }
    return res.json({
      ok: true,
      role: verified.role,
      subject: verified.sub,
      expiresAt: new Date(verified.exp * 1000).toISOString(),
    });
  });

  app.post('/api/admin/change-password', (req, res) => {
    const token = extractBearerToken(req.headers.authorization);
    if (!verifyAdminSessionToken(token)) {
      return res.status(401).json({ ok: false, error: 'Otorisasi admin diperlukan untuk mengganti password.' });
    }
    const { currentPassword, newPassword } = req.body || {};
    if (String(newPassword || '').length < 6) {
      return res.status(400).json({ ok: false, error: 'Password baru minimal 6 karakter.' });
    }
    try {
      const result = serverStore.changeAdminPassword(String(currentPassword || ''), String(newPassword || ''));
      if (!result.ok) {
        return res.status(result.status).json({ ok: false, error: result.error });
      }
      return res.json({ ok: true, updatedAt: result.updatedAt });
    } catch (err) {
      return res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal memperbarui password admin.',
      });
    }
  });

  app.post('/api/admin/logout', (req, res) => {
    const token = extractBearerToken(req.headers.authorization);
    revokeAdminSessionToken(token);
    return res.json({ ok: true });
  });

  // Public Session Link Validation & Sanitized Fetch (NEVER leaks answerKeys)
  app.get('/api/sessions/join/:code', (req, res) => {
    const result = serverStore.getPublicSessionPackage(req.params.code);
    if (!result.ok) {
      return res.status(result.access.code === 'NOT_FOUND' ? 404 : 403).json({
        ok: false,
        code: result.access.code,
        error: result.access.reason,
        sessionPreview: result.session,
      });
    }
    return res.json(result);
  });

  // Student joins active session via invite link
  app.post('/api/sessions/:code/join', (req, res) => {
    const { studentId, studentName, studentIdentity } = req.body || {};
    if (!studentId || !studentName) {
      return res.status(400).json({ ok: false, error: 'studentId dan studentName wajib diisi.' });
    }
    const result = serverStore.joinStudentToSession({
      joinCode: req.params.code,
      studentId: String(studentId),
      studentName: String(studentName),
      studentIdentity: studentIdentity ? String(studentIdentity) : undefined,
    });
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error });
    }
    broadcastToRoom(result.session.id, {
      type: 'progress_updated',
      progress: result.progress,
      leaderboard: serverStore.getSessionLeaderboard(result.session.id),
    });
    return res.json(result);
  });

  // Trusted Server-Side Answer Grading
  app.post('/api/sessions/:code/submit', (req, res) => {
    const { studentId, studentName, questionId, selectedIndex, streak } = req.body || {};
    if (!studentId || !questionId || typeof selectedIndex !== 'number') {
      return res.status(400).json({ ok: false, error: 'Payload jawaban tidak lengkap.' });
    }
    const result = serverStore.gradeSubmission({
      joinCode: req.params.code,
      studentId: String(studentId),
      studentName: String(studentName || 'Siswa'),
      questionId: String(questionId),
      selectedIndex: Number(selectedIndex),
      streak: Number(streak || 0),
    });

    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error });
    }

    const session = serverStore.getSessionByCode(req.params.code);
    if (session) {
      broadcastToRoom(session.id, {
        type: 'progress_updated',
        progress: result.progress,
        submission: 'submission' in result ? result.submission : undefined,
        leaderboard: result.leaderboard,
      });
    }

    return res.json(result);
  });

  // Safe Server-Side 50:50 Lifeline (NEVER leaks correctIndex to client)
  app.post('/api/sessions/:code/lifeline-5050', (req, res) => {
    const { questionId } = req.body || {};
    if (!questionId) {
      return res.status(400).json({ ok: false, error: 'questionId wajib diisi.' });
    }
    const result = serverStore.getFiftyFiftyDistractors(req.params.code, String(questionId));
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error });
    }
    return res.json(result);
  });

  app.get('/api/sessions/:code/leaderboard', (req, res) => {
    const session = serverStore.getSessionByCode(req.params.code);
    if (!session) {
      return res.status(404).json({ ok: false, error: 'Sesi tidak ditemukan.' });
    }
    return res.json({
      ok: true,
      leaderboard: serverStore.getSessionLeaderboard(session.id),
      onlineCount: getOnlineCount(session.id),
    });
  });

  app.get('/api/student/:studentId/summary', (req, res) => {
    const studentId = req.params.studentId;
    const overview = serverStore.getTeacherOverview();
    const myProgress = overview.studentProgress.filter((p) => p.studentId === studentId);
    const mySubmissions = overview.submissions.filter((s) => s.studentId === studentId);
    const myBadges = serverStore.getStudentAchievements(studentId);
    return res.json({
      ok: true,
      progressList: myProgress,
      submissions: mySubmissions,
      badges: myBadges,
      sessions: overview.gameSessions,
    });
  });

  // ==================== TEACHER ENDPOINTS ====================
  app.get('/api/teacher/overview', (req, res) => {
    const teacherId = typeof req.query.teacherId === 'string' ? req.query.teacherId : undefined;
    return res.json({
      ok: true,
      ...serverStore.getTeacherOverview(teacherId),
    });
  });

  app.post('/api/teacher/classes', (req, res) => {
    try {
      const { teacherId, name, grade, subject, description } = req.body || {};
      if (!name || !subject || !grade) {
        return res.status(400).json({ ok: false, error: 'Nama kelas, tingkat, dan mata pelajaran wajib diisi.' });
      }
      const classroom = serverStore.createClassroom({
        teacherId: String(teacherId || 'teacher_demo_1'),
        name: String(name),
        grade,
        subject: String(subject),
        description: description ? String(description) : undefined,
      });
      return res.json({ ok: true, classroom });
    } catch (err) {
      return res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal membuat kelas di server.',
      });
    }
  });

  app.post('/api/teacher/banks', (req, res) => {
    try {
      const {
        teacherId,
        title,
        subject,
        grade,
        topic,
        difficulty,
        driveFileId,
        driveFileName,
        driveModifiedTime,
        lastSyncedAt,
        items,
      } = req.body || {};
      const cleanTitle = String(title ?? '').trim();
      const cleanSubject = String(subject ?? '').trim();
      const cleanTopic = String(topic ?? '').trim() || cleanTitle;

      if (cleanTitle.length < 2 || cleanSubject.length < 2 || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          ok: false,
          error: 'Judul bank soal, mata pelajaran, dan minimal 1 soal wajib diisi.',
        });
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const promptText = String(item?.prompt ?? '').trim();
        const rawOptions = Array.isArray(item?.options) ? item.options.slice(0, 5) : [];
        const validOptions = rawOptions.map((o: unknown) => String(o ?? '').trim());
        const correctIdx = Number(item?.correctIndex);

        if (promptText.length < 2) {
          return res.status(400).json({
            ok: false,
            error: `Teks pertanyaan pada Soal #${i + 1} wajib diisi minimal 2 karakter.`,
          });
        }
        if (validOptions.length < 2 || validOptions.some((o: string) => o.length === 0)) {
          return res.status(400).json({
            ok: false,
            error: `Semua pilihan jawaban pada Soal #${i + 1} wajib diisi (minimal 2 opsi).`,
          });
        }
        if (!Number.isInteger(correctIdx) || correctIdx < 0 || correctIdx >= validOptions.length) {
          return res.status(400).json({
            ok: false,
            error: `Kunci jawaban pada Soal #${i + 1} tidak valid.`,
          });
        }
      }

      const created = serverStore.createQuestionBankWithQuestions({
        teacherId: String(teacherId || 'teacher_demo_1'),
        title: cleanTitle,
        subject: cleanSubject,
        grade: grade || '11',
        topic: cleanTopic,
        difficulty: difficulty || 'Sedang',
        driveFileId: driveFileId ? String(driveFileId) : undefined,
        driveFileName: driveFileName ? String(driveFileName) : undefined,
        driveModifiedTime: driveModifiedTime ? String(driveModifiedTime) : undefined,
        lastSyncedAt: lastSyncedAt ? String(lastSyncedAt) : undefined,
        items,
      });
      return res.json({ ok: true, ...created });
    } catch (err) {
      console.error('Error saving question bank:', err);
      return res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal menyimpan bank soal di server.',
      });
    }
  });

  app.put('/api/teacher/banks/:id/sync', (req, res) => {
    try {
      const {
        teacherId,
        title,
        subject,
        grade,
        topic,
        difficulty,
        driveFileId,
        driveFileName,
        driveModifiedTime,
        bankSnapshot,
        items,
      } = req.body || {};

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          ok: false,
          error: 'Minimal 1 soal wajib disertakan saat menyinkronkan bank soal.',
        });
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const promptText = String(item?.prompt ?? '').trim();
        const rawOptions = Array.isArray(item?.options) ? item.options.slice(0, 5) : [];
        const validOptions = rawOptions.map((o: unknown) => String(o ?? '').trim());
        const correctIdx = Number(item?.correctIndex);

        if (promptText.length < 2) {
          return res.status(400).json({
            ok: false,
            error: `Teks pertanyaan pada Soal #${i + 1} wajib diisi minimal 2 karakter.`,
          });
        }
        if (validOptions.length < 2 || validOptions.some((o: string) => o.length === 0)) {
          return res.status(400).json({
            ok: false,
            error: `Semua pilihan jawaban pada Soal #${i + 1} wajib diisi (minimal 2 opsi).`,
          });
        }
        if (!Number.isInteger(correctIdx) || correctIdx < 0 || correctIdx >= validOptions.length) {
          return res.status(400).json({
            ok: false,
            error: `Kunci jawaban pada Soal #${i + 1} tidak valid.`,
          });
        }
      }

      const synced = serverStore.syncQuestionBankFromDrive(req.params.id, {
        teacherId: teacherId ? String(teacherId) : undefined,
        title: title ? String(title) : undefined,
        subject: subject ? String(subject) : undefined,
        grade,
        topic: topic ? String(topic) : undefined,
        difficulty,
        driveFileId: driveFileId ? String(driveFileId) : undefined,
        driveFileName: driveFileName ? String(driveFileName) : undefined,
        driveModifiedTime: driveModifiedTime ? String(driveModifiedTime) : undefined,
        bankSnapshot,
        items,
      });

      if (!synced) {
        return res.status(404).json({ ok: false, error: 'Bank soal target sinkronisasi tidak ditemukan.' });
      }

      return res.json({ ok: true, ...synced });
    } catch (err) {
      return res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal menyinkronkan bank soal dari Google Drive.',
      });
    }
  });

  app.post('/api/teacher/sessions', (req, res) => {
    try {
      const {
        teacherId,
        classId,
        bankId,
        title,
        gameMode,
        arenaId,
        difficulty,
        durationMinutes,
        maxAttempts,
        requireIdentity,
        startsAt,
        endsAt,
        classroomSnapshot,
        bankSnapshot,
        questionsSnapshot,
        answerKeysSnapshot,
      } = req.body || {};
      if (!classId || !bankId || !title) {
        return res.status(400).json({ ok: false, error: 'Kelas, bank soal, dan judul sesi wajib diisi.' });
      }
      const session = serverStore.createGameSession({
        teacherId: String(teacherId || 'teacher_demo_1'),
        classId: String(classId),
        bankId: String(bankId),
        title: String(title),
        gameMode: gameMode || 'Quiz Adventure',
        arenaId,
        difficulty: difficulty || 'Sedang',
        durationMinutes: Number(durationMinutes || 30),
        maxAttempts: Number(maxAttempts || 3),
        requireIdentity: requireIdentity !== false,
        startsAt,
        endsAt,
        classroomSnapshot,
        bankSnapshot,
        questionsSnapshot,
        answerKeysSnapshot,
      });
      return res.json({ ok: true, session });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.patch('/api/teacher/sessions/:id', (req, res) => {
    try {
      const updated = serverStore.updateGameSession(req.params.id, req.body || {});
      if (!updated) {
        return res.status(404).json({ ok: false, error: 'Sesi tidak ditemukan.' });
      }
      broadcastToRoom(updated.id, {
        type: 'session_state_changed',
        session: updated,
      });
      return res.json({ ok: true, session: updated });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ==================== GEMINI AI ROUTES ====================
  app.post('/api/ai/teacher-assist', async (req, res) => {
    try {
      const { action, payload } = req.body || {};
      if (action === 'generate_questions') {
        const items = await generateQuestionVariations(payload);
        return res.json({ ok: true, items });
      }
      if (action === 'mission_plan') {
        const plan = await generateMissionPlan(payload);
        return res.json({ ok: true, text: plan });
      }
      if (action === 'summarize_results') {
        const session = serverStore.getSessionByCode(payload?.joinCode || '');
        if (!session) {
          return res.status(404).json({ ok: false, error: 'Sesi tidak ditemukan untuk diringkas.' });
        }
        const overview = serverStore.getTeacherOverview();
        const progressList = overview.studentProgress.filter((p) => p.sessionId === session.id);
        const summary = await summarizeLearningResults({ session, progressList });
        return res.json({ ok: true, text: summary });
      }
      return res.status(400).json({ ok: false, error: 'Aksi AI tidak dikenali.' });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal menghubungi Gemini AI.',
      });
    }
  });

  app.post('/api/ai/student-assist', async (req, res) => {
    try {
      const { action, payload } = req.body || {};
      if (action === 'hint') {
        const text = await getStudentHint(payload);
        return res.json({ ok: true, text });
      }
      if (action === 'explain') {
        const text = await explainAnswerConcept(payload);
        return res.json({ ok: true, text });
      }
      return res.status(400).json({ ok: false, error: 'Aksi AI siswa tidak dikenali.' });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal menghubungi Tutor AI Gemini.',
      });
    }
  });

  // Return JSON 404 for unknown API paths instead of falling through to SPA HTML
  app.use('/api', (_req, res) => {
    return res.status(404).json({ ok: false, error: 'Endpoint API tidak ditemukan.' });
  });

  // Ensure API errors (such as PayloadTooLargeError or malformed JSON) always return JSON instead of HTML
  app.use('/api', (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status =
      typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status: unknown }).status === 'number'
        ? (err as { status: number }).status
        : 500;
    const message =
      err instanceof Error
        ? err.message
        : 'Terjadi kesalahan internal pada server API.';
    return res.status(status).json({ ok: false, error: message });
  });

  return app;
}
