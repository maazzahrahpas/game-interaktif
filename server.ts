import http from 'node:http';
import path from 'node:path';
import express from 'express';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { serverStore } from './src/server/store.ts';
import {
  explainAnswerConcept,
  generateMissionPlan,
  generateQuestionVariations,
  getStudentHint,
  summarizeLearningResults,
} from './src/server/geminiService.ts';
import type { PlayerAvatarState } from './src/types/eduverse.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '16mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  // ==================== REALTIME MULTIPLAYER ROOMS ====================
  interface SocketClient {
    ws: WebSocket;
    sessionId: string;
    studentId: string;
    displayName: string;
    role: 'guru' | 'siswa' | 'super_admin';
    playerState?: PlayerAvatarState;
  }

  const clients = new Map<WebSocket, SocketClient>();

  const broadcastToRoom = (sessionId: string, payload: unknown, excludeWs?: WebSocket) => {
    const serialized = JSON.stringify(payload);
    for (const [sock, info] of clients.entries()) {
      if (info.sessionId === sessionId && sock !== excludeWs && sock.readyState === WebSocket.OPEN) {
        sock.send(serialized);
      }
    }
  };

  const getRoomPlayers = (sessionId: string): PlayerAvatarState[] => {
    const list: PlayerAvatarState[] = [];
    for (const info of clients.values()) {
      if (info.sessionId === sessionId && info.playerState) {
        list.push(info.playerState);
      }
    }
    return list;
  };

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'join_room') {
          const sessionId = String(msg.sessionId || 'lobby');
          const studentId = String(msg.studentId || `guest_${Date.now()}`);
          const displayName = String(msg.displayName || 'Penjelajah').slice(0, 60);
          const role = msg.role === 'guru' || msg.role === 'super_admin' ? msg.role : 'siswa';
          const avatarColor = String(msg.avatarColor || '#3B82F6');

          const playerState: PlayerAvatarState | undefined =
            role === 'siswa'
              ? {
                  id: `ps_${sessionId}_${studentId}`,
                  sessionId,
                  studentId,
                  displayName,
                  avatarColor,
                  x: Number(msg.x ?? 0),
                  y: Number(msg.y ?? 0),
                  z: Number(msg.z ?? 18),
                  rotY: Number(msg.rotY ?? 0),
                  animState: 'idle',
                  currentZone: 'sekolah',
                  isOnline: true,
                  updatedAt: new Date().toISOString(),
                }
              : undefined;

          clients.set(ws, { ws, sessionId, studentId, displayName, role, playerState });

          // Send initial room snapshot to newly connected client
          ws.send(
            JSON.stringify({
              type: 'room_init',
              players: getRoomPlayers(sessionId),
            })
          );

          if (playerState) {
            broadcastToRoom(sessionId, { type: 'player_joined', player: playerState }, ws);
          }
        } else if (msg.type === 'player_move') {
          const info = clients.get(ws);
          if (!info || !info.playerState) return;
          info.playerState = {
            ...info.playerState,
            x: Number(msg.x ?? info.playerState.x),
            y: Number(msg.y ?? info.playerState.y),
            z: Number(msg.z ?? info.playerState.z),
            rotY: Number(msg.rotY ?? info.playerState.rotY),
            animState: msg.animState || 'idle',
            currentZone: msg.currentZone || info.playerState.currentZone,
            updatedAt: new Date().toISOString(),
          };
          broadcastToRoom(info.sessionId, { type: 'player_moved', player: info.playerState }, ws);
        }
      } catch {
        // Ignore malformed websocket packets
      }
    });

    ws.on('close', () => {
      const info = clients.get(ws);
      if (info) {
        clients.delete(ws);
        broadcastToRoom(info.sessionId, {
          type: 'player_left',
          studentId: info.studentId,
        });
      }
    });
  });

  // ==================== REST API ROUTES ====================
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'EDUVERSE Server', timestamp: new Date().toISOString() });
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

  app.get('/api/sessions/:code/leaderboard', (req, res) => {
    const session = serverStore.getSessionByCode(req.params.code);
    if (!session) {
      return res.status(404).json({ ok: false, error: 'Sesi tidak ditemukan.' });
    }
    return res.json({
      ok: true,
      leaderboard: serverStore.getSessionLeaderboard(session.id),
      onlineCount: getRoomPlayers(session.id).length,
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
      const { teacherId, title, subject, grade, topic, difficulty, items } = req.body || {};
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

  app.post('/api/teacher/sessions', (req, res) => {
    try {
      const {
        teacherId,
        classId,
        bankId,
        title,
        gameMode,
        difficulty,
        durationMinutes,
        maxAttempts,
        requireIdentity,
        startsAt,
        endsAt,
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
        difficulty: difficulty || 'Sedang',
        durationMinutes: Number(durationMinutes || 30),
        maxAttempts: Number(maxAttempts || 3),
        requireIdentity: requireIdentity !== false,
        startsAt,
        endsAt,
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

  // ==================== VITE DEV / PROD STATIC SERVING ====================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`EDUVERSE server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
