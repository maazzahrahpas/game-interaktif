import fs from 'node:fs';
import path from 'node:path';
import type {
  AchievementBadge,
  AnswerKey,
  AuditLogEntry,
  Classroom,
  GameSession,
  LeaderboardEntry,
  QuestionBank,
  StudentProgress,
  StudentQuestion,
  SubmissionRecord,
  UserRole,
  WorldZoneId,
} from '../types/eduverse.ts';
import {
  calculateLevelFromXp,
  calculateQuestionReward,
  calculateAccuracyPercent,
  evaluateUnlockedBadges,
  getUnlockedZonesForProgress,
  sortLeaderboard,
  validateSessionAccess,
} from '../utils/gameRules.ts';

const DATA_FILE = path.resolve(process.cwd(), '.eduverse-server-data.json');
const ZONE_ORDER: WorldZoneId[] = ['sekolah', 'taman', 'lab', 'perpustakaan', 'pulau', 'arena'];

export interface ServerDatabase {
  classes: Record<string, Classroom>;
  questionBanks: Record<string, QuestionBank>;
  questions: Record<string, StudentQuestion>;
  answerKeys: Record<string, AnswerKey>;
  gameSessions: Record<string, GameSession>;
  studentProgress: Record<string, StudentProgress>;
  submissions: Record<string, SubmissionRecord>;
  leaderboard: Record<string, LeaderboardEntry>;
  achievements: Record<string, AchievementBadge>;
  auditLogs: AuditLogEntry[];
}

function createSeedDatabase(): ServerDatabase {
  const now = new Date();
  const nowIso = now.toISOString();
  const endsIso = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const teacherId = 'teacher_demo_1';

  const classes: Record<string, Classroom> = {
    cls_bio_11: {
      id: 'cls_bio_11',
      teacherId,
      name: 'XI IPA 1 - Biologi Sel',
      grade: '11',
      subject: 'Biologi',
      description: 'Kelas interaktif eksplorasi struktur organel dan metabolisme seluler.',
      inviteCode: 'BIO11A',
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    cls_fis_10: {
      id: 'cls_fis_10',
      teacherId,
      name: 'X MIPA 2 - Dinamika Gerak',
      grade: '10',
      subject: 'Fisika',
      description: 'Kelas simulasi hukum Newton, usaha, dan kekekalan energi.',
      inviteCode: 'FIS10B',
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  };

  const questionBanks: Record<string, QuestionBank> = {
    bank_bio_sel: {
      id: 'bank_bio_sel',
      teacherId,
      title: 'Struktur & Fungsi Organel Sel',
      subject: 'Biologi',
      grade: '11',
      topic: 'Biologi Seluler',
      difficulty: 'Sedang',
      questionCount: 6,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    bank_fis_newton: {
      id: 'bank_fis_newton',
      teacherId,
      title: 'Hukum Newton & Energi Mekanik',
      subject: 'Fisika',
      grade: '10',
      topic: 'Mekanika Klasik',
      difficulty: 'Sedang',
      questionCount: 6,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  };

  const bioItems: Array<{
    prompt: string;
    options: string[];
    correctIndex: number;
    explanation: string;
    hint: string;
    points: number;
  }> = [
    {
      prompt: 'Apa fungsi utama organel mitokondria pada sel eukariotik?',
      options: [
        'Sintesis protein dari asam amino',
        'Menghasilkan energi ATP melalui respirasi seluler',
        'Mengatur keluar masuknya zat pada membran sel',
        'Menyimpan informasi genetik DNA inti',
      ],
      correctIndex: 1,
      explanation: 'Mitokondria disebut "powerhouse of the cell" karena menghasilkan ATP melalui siklus Krebs dan fosforilasi oksidatif.',
      hint: 'Ingat proses respirasi aerobik yang menghasilkan ATP.',
      points: 20,
    },
    {
      prompt: 'Organel yang berfungsi langsung dalam proses sintesis protein adalah...',
      options: ['Ribosom', 'Lisosom', 'Vakuola', 'Kloroplas'],
      correctIndex: 0,
      explanation: 'Ribosom membaca kode mRNA untuk merangkai asam amino menjadi rantai polipeptida (protein).',
      hint: 'Organel kecil yang menempel pada RE kasar atau bebas di sitoplasma.',
      points: 20,
    },
    {
      prompt: 'Perbedaan utama sel tumbuhan dibandingkan sel hewan adalah keberadaan...',
      options: [
        'Mitokondria dan ribosom',
        'Membran plasma dan sitoplasma',
        'Dinding sel selulosa dan kloroplas',
        'Nukleus dan retikulum endoplasma',
      ],
      correctIndex: 2,
      explanation: 'Sel tumbuhan memiliki dinding sel yang kaku dari selulosa serta kloroplas untuk fotosintesis.',
      hint: 'Struktur yang membuat tumbuhan kokoh dan mampu berfotosintesis.',
      points: 20,
    },
    {
      prompt: 'Proses perpindahan molekul air melalui membran semipermeabel dari konsentrasi air tinggi ke rendah disebut...',
      options: ['Transpor aktif', 'Osmosis', 'Endositosis', 'Fagositosis'],
      correctIndex: 1,
      explanation: 'Osmosis adalah difusi khusus pelarut (air) melintasi membran semipermeabel tanpa energi ATP.',
      hint: 'Merupakan bentuk difusi khusus untuk pelarut air.',
      points: 20,
    },
    {
      prompt: 'Organel yang berperan sebagai pencerna intraseluler menggunakan enzim hidrolitik adalah...',
      options: ['Badan Golgi', 'Peroksisom', 'Lisosom', 'Sentrosom'],
      correctIndex: 2,
      explanation: 'Lisosom mengandung enzim hidrolitik yang memecah makromolekul, organel rusak, maupun patogen.',
      hint: 'Sering disebut organel "daur ulang" pada sel hewan.',
      points: 20,
    },
    {
      prompt: 'Pada tahap manakah pembelahan mitosis kromatid saudara berpisah menuju kutub berlawanan?',
      options: ['Profase', 'Metafase', 'Anafase', 'Telofase'],
      correctIndex: 2,
      explanation: 'Pada fase Anafase, benang spindel memendek dan menarik kromatid saudara ke kutub sel yang berlawanan.',
      hint: 'Urutannya PMAT — fase ketiga setelah kromosom berjajar di ekuator.',
      points: 25,
    },
  ];

  const fisItems: Array<{
    prompt: string;
    options: string[];
    correctIndex: number;
    explanation: string;
    hint: string;
    points: number;
  }> = [
    {
      prompt: 'Sebuah benda bermassa 4 kg diberi gaya total 20 N. Berapakah percepatan benda tersebut?',
      options: ['2 m/s²', '4 m/s²', '5 m/s²', '80 m/s²'],
      correctIndex: 2,
      explanation: 'Menurut Hukum II Newton, a = F / m = 20 N / 4 kg = 5 m/s².',
      hint: 'Gunakan rumus F = m × a.',
      points: 20,
    },
    {
      prompt: 'Sifat benda yang cenderung mempertahankan keadaan diam atau gerak lurus beraturan disebut...',
      options: ['Momentum', 'Inersia (Kelembaman)', 'Impuls', 'Gaya Gesek'],
      correctIndex: 1,
      explanation: 'Hukum I Newton menjelaskan kelembaman atau inersia ketika resultan gaya bernilai nol.',
      hint: 'Berkaitan dengan Hukum I Newton.',
      points: 20,
    },
    {
      prompt: 'Jika kecepatan suatu benda menjadi 2 kali lipat, maka energi kinetiknya menjadi...',
      options: ['2 kali semula', '3 kali semula', '4 kali semula', 'Setengah semula'],
      correctIndex: 2,
      explanation: 'Ek = ½ m v². Karena v dikuadratkan, menggandakan v membuat Ek menjadi 2² = 4 kali lipat.',
      hint: 'Perhatikan pangkat pada variabel kecepatan v di rumus Ek.',
      points: 20,
    },
    {
      prompt: 'Sebuah bola bermassa 2 kg berada di ketinggian 10 m (g = 10 m/s²). Energi potensial gravitasinya adalah...',
      options: ['20 J', '100 J', '200 J', '400 J'],
      correctIndex: 2,
      explanation: 'Ep = m × g × h = 2 × 10 × 10 = 200 Joule.',
      hint: 'Kalikan massa, percepatan gravitasi, dan ketinggian.',
      points: 20,
    },
    {
      prompt: 'Pasangan gaya aksi-reaksi pada Hukum III Newton bekerja pada...',
      options: [
        'Satu benda yang sama dengan arah sama',
        'Dua benda berbeda dengan besar sama dan arah berlawanan',
        'Dua benda berbeda dengan besar berbeda',
        'Benda yang hanya bergerak melingkar',
      ],
      correctIndex: 1,
      explanation: 'Gaya aksi-reaksi selalu sama besar, berlawanan arah, dan bekerja pada dua benda yang berinteraksi.',
      hint: 'Misalnya kaki mendorong lantai, dan lantai mendorong kaki.',
      points: 20,
    },
    {
      prompt: 'Usaha yang dilakukan oleh gaya 15 N untuk memindahkan kotak sejauh 4 m searah gaya adalah...',
      options: ['19 J', '30 J', '60 J', '75 J'],
      correctIndex: 2,
      explanation: 'W = F × s = 15 N × 4 m = 60 Joule.',
      hint: 'Usaha adalah hasil kali gaya dengan perpindahan searah.',
      points: 25,
    },
  ];

  const questions: Record<string, StudentQuestion> = {};
  const answerKeys: Record<string, AnswerKey> = {};
  const letters = ['A', 'B', 'C', 'D', 'E'] as const;

  const populate = (bankId: string, items: typeof bioItems, prefix: string) => {
    items.forEach((item, idx) => {
      const qId = `${prefix}_q${idx + 1}`;
      questions[qId] = {
        id: qId,
        bankId,
        teacherId,
        orderIndex: idx,
        prompt: item.prompt,
        options: item.options,
        points: item.points,
        difficulty: idx >= 4 ? 'Sulit' : 'Sedang',
        hint: item.hint,
        zoneId: ZONE_ORDER[idx % ZONE_ORDER.length],
        isPublished: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      answerKeys[qId] = {
        questionId: qId,
        bankId,
        teacherId,
        correctIndex: item.correctIndex,
        correctLetter: letters[item.correctIndex],
        explanation: item.explanation,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    });
  };

  populate('bank_bio_sel', bioItems, 'bio');
  populate('bank_fis_newton', fisItems, 'fis');

  const gameSessions: Record<string, GameSession> = {
    sess_edu101: {
      id: 'sess_edu101',
      teacherId,
      classId: 'cls_bio_11',
      bankId: 'bank_bio_sel',
      joinCode: 'EDU101',
      title: 'Petualangan Biologi Sel: Misteri Organel',
      subject: 'Biologi',
      grade: '11',
      topic: 'Biologi Seluler & Mitokondria',
      difficulty: 'Sedang',
      gameMode: 'Quiz Adventure',
      worldId: 'world_eduverse_utama',
      durationMinutes: 45,
      maxAttempts: 3,
      questionCount: 6,
      totalPoints: 125,
      isLinkActive: true,
      status: 'active',
      requireIdentity: true,
      startsAt: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      endsAt: endsIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    sess_fis202: {
      id: 'sess_fis202',
      teacherId,
      classId: 'cls_fis_10',
      bankId: 'bank_fis_newton',
      joinCode: 'FIS202',
      title: 'Arena Tantangan Hukum Newton',
      subject: 'Fisika',
      grade: '10',
      topic: 'Mekanika & Energi',
      difficulty: 'Sedang',
      gameMode: 'Boss Battle',
      worldId: 'world_eduverse_utama',
      durationMinutes: 40,
      maxAttempts: 3,
      questionCount: 6,
      totalPoints: 125,
      isLinkActive: true,
      status: 'active',
      requireIdentity: true,
      startsAt: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      endsAt: endsIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  };

  return {
    classes,
    questionBanks,
    questions,
    answerKeys,
    gameSessions,
    studentProgress: {},
    submissions: {},
    leaderboard: {},
    achievements: {},
    auditLogs: [
      {
        id: 'log_seed_1',
        actorId: teacherId,
        actorRole: 'guru',
        action: 'SESSION_INITIALIZED',
        targetType: 'gameSession',
        targetId: 'sess_edu101',
        summary: 'Sesi awal EDU101 dan FIS202 siap digunakan untuk kelas 10–12.',
        createdAt: nowIso,
      },
    ],
  };
}

class EduverseServerStore {
  private db: ServerDatabase;

  constructor() {
    this.db = this.load();
  }

  private load(): ServerDatabase {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw) as ServerDatabase;
        if (parsed && parsed.gameSessions && parsed.answerKeys) {
          return parsed;
        }
      }
    } catch (err) {
      console.error('Failed to read server data file, re-seeding:', err);
    }
    const seeded = createSeedDatabase();
    this.persist(seeded);
    return seeded;
  }

  private persist(target: ServerDatabase = this.db) {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(target, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to write server data file:', err);
    }
  }

  public logAudit(actorId: string, actorRole: UserRole, action: string, targetType: string, targetId: string, summary: string) {
    const entry: AuditLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      actorId,
      actorRole,
      action,
      targetType,
      targetId,
      summary: summary.slice(0, 300),
      createdAt: new Date().toISOString(),
    };
    this.db.auditLogs.unshift(entry);
    if (this.db.auditLogs.length > 200) {
      this.db.auditLogs.length = 200;
    }
    this.persist();
    return entry;
  }

  public getSessionByCode(joinCode: string): GameSession | null {
    const normalized = joinCode.trim().toUpperCase();
    return (
      Object.values(this.db.gameSessions).find((s) => s.joinCode.toUpperCase() === normalized) ?? null
    );
  }

  public getPublicSessionPackage(joinCode: string) {
    const session = this.getSessionByCode(joinCode);
    const access = validateSessionAccess(session);
    if (!access.allowed || !session) {
      return { ok: false as const, access, session: session ? { title: session.title, joinCode: session.joinCode, status: session.status, isLinkActive: session.isLinkActive } : null };
    }

    const questions = Object.values(this.db.questions)
      .filter((q) => q.bankId === session.bankId)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((q) => ({ ...q })); // Note: answerKeys are stored in separate map and never attached

    const classroom = this.db.classes[session.classId] || null;
    const leaderboard = sortLeaderboard(
      Object.values(this.db.leaderboard).filter((l) => l.sessionId === session.id)
    );

    return {
      ok: true as const,
      access,
      session,
      classroom,
      questions,
      leaderboard,
    };
  }

  public joinStudentToSession(params: {
    joinCode: string;
    studentId: string;
    studentName: string;
    studentIdentity?: string;
  }) {
    const session = this.getSessionByCode(params.joinCode);
    const access = validateSessionAccess(session);
    if (!access.allowed || !session) {
      return { ok: false as const, status: access.code === 'NOT_FOUND' ? 404 : 403, error: access.reason || 'Sesi tidak tersedia.' };
    }

    if (session.requireIdentity && (!params.studentName.trim() || params.studentName.trim().length < 2)) {
      return { ok: false as const, status: 400, error: 'Nama siswa wajib diisi minimal 2 karakter.' };
    }

    const progressId = `prog_${session.id}_${params.studentId}`;
    const existing = this.db.studentProgress[progressId];
    const nowIso = new Date().toISOString();

    if (existing) {
      if (existing.status === 'completed' && existing.attemptsUsed >= session.maxAttempts) {
        return {
          ok: false as const,
          status: 403,
          error: `Batas percobaan (${session.maxAttempts}x) pada sesi ini telah habis.`,
        };
      }
      existing.studentName = params.studentName.trim().slice(0, 80);
      if (params.studentIdentity) {
        existing.studentIdentity = params.studentIdentity.trim().slice(0, 40);
      }
      existing.updatedAt = nowIso;
      this.persist();
      return { ok: true as const, session, progress: existing };
    }

    const progress: StudentProgress = {
      id: progressId,
      sessionId: session.id,
      studentId: params.studentId,
      teacherId: session.teacherId,
      studentName: params.studentName.trim().slice(0, 80),
      studentIdentity: params.studentIdentity?.trim().slice(0, 40) || '',
      score: 0,
      xpEarned: 0,
      correctCount: 0,
      totalAnswered: 0,
      attemptsUsed: 1,
      completedQuests: [],
      unlockedZones: getUnlockedZonesForProgress(0),
      currentZone: 'sekolah',
      status: 'active',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.db.studentProgress[progressId] = progress;
    this.db.leaderboard[`lb_${session.id}_${params.studentId}`] = {
      id: `lb_${session.id}_${params.studentId}`,
      sessionId: session.id,
      studentId: params.studentId,
      teacherId: session.teacherId,
      studentName: progress.studentName,
      score: 0,
      xp: 0,
      level: 1,
      accuracy: 0,
      isPublicInSession: true,
      updatedAt: nowIso,
    };

    this.logAudit(params.studentId, 'siswa', 'JOIN_SESSION', 'gameSession', session.id, `${progress.studentName} bergabung ke sesi ${session.joinCode}`);
    this.persist();
    return { ok: true as const, session, progress };
  }

  public gradeSubmission(params: {
    joinCode: string;
    studentId: string;
    studentName: string;
    questionId: string;
    selectedIndex: number;
    streak?: number;
  }) {
    const session = this.getSessionByCode(params.joinCode);
    const access = validateSessionAccess(session);
    if (!access.allowed || !session) {
      return { ok: false as const, status: 403, error: access.reason || 'Sesi tidak aktif.' };
    }

    const question = this.db.questions[params.questionId];
    const answerKey = this.db.answerKeys[params.questionId];
    if (!question || !answerKey || question.bankId !== session.bankId) {
      return { ok: false as const, status: 404, error: 'Soal atau kunci jawaban tidak ditemukan.' };
    }

    const progressId = `prog_${session.id}_${params.studentId}`;
    let progress = this.db.studentProgress[progressId];
    const nowIso = new Date().toISOString();

    if (!progress) {
      const joined = this.joinStudentToSession({
        joinCode: params.joinCode,
        studentId: params.studentId,
        studentName: params.studentName || 'Siswa Eduverse',
      });
      if (!joined.ok) return joined;
      progress = joined.progress;
    }

    // Count previous submissions for this specific question by this student
    const prevAttemptsForQ = Object.values(this.db.submissions).filter(
      (s) => s.sessionId === session.id && s.studentId === params.studentId && s.questionId === params.questionId
    );
    const alreadyCorrect = prevAttemptsForQ.some((s) => s.isCorrect);
    if (alreadyCorrect) {
      return {
        ok: true as const,
        alreadyCompleted: true,
        isCorrect: true,
        correctIndex: answerKey.correctIndex,
        explanation: answerKey.explanation || '',
        pointsEarned: 0,
        xpEarned: 0,
        progress,
        newlyUnlockedBadges: [],
        leaderboard: this.getSessionLeaderboard(session.id),
      };
    }

    const attemptNumber = prevAttemptsForQ.length + 1;
    if (attemptNumber > session.maxAttempts) {
      return {
        ok: false as const,
        status: 403,
        error: `Percobaan untuk soal ini melebihi batas (${session.maxAttempts}x).`,
      };
    }

    const isCorrect = params.selectedIndex === answerKey.correctIndex;
    const { pointsEarned, xpEarned } = calculateQuestionReward({
      basePoints: question.points,
      isCorrect,
      attemptNumber,
      streak: params.streak || 0,
      difficulty: question.difficulty,
    });

    const subId = `sub_${session.id}_${params.studentId}_${params.questionId}_${attemptNumber}`;
    const submission: SubmissionRecord = {
      id: subId,
      sessionId: session.id,
      studentId: params.studentId,
      studentName: progress.studentName,
      teacherId: session.teacherId,
      questionId: params.questionId,
      selectedIndex: params.selectedIndex,
      isCorrect,
      pointsEarned,
      xpEarned,
      attemptNumber,
      submittedAt: nowIso,
    };
    this.db.submissions[subId] = submission;

    progress.totalAnswered += 1;
    progress.score += pointsEarned;
    progress.xpEarned += xpEarned;
    if (isCorrect) {
      progress.correctCount += 1;
      if (!progress.completedQuests.includes(params.questionId)) {
        progress.completedQuests.push(params.questionId);
      }
    }
    progress.unlockedZones = getUnlockedZonesForProgress(progress.correctCount);
    if (progress.completedQuests.length >= session.questionCount && session.questionCount > 0) {
      progress.status = 'completed';
    }
    progress.updatedAt = nowIso;

    // Evaluate achievements
    const existingCodes = Object.values(this.db.achievements)
      .filter((a) => a.studentId === params.studentId)
      .map((a) => a.badgeCode);
    const newlyUnlockedBadges = evaluateUnlockedBadges({
      studentId: params.studentId,
      correctCount: progress.correctCount,
      totalAnswered: progress.totalAnswered,
      score: progress.score,
      totalPoints: session.totalPoints,
      unlockedZonesCount: progress.unlockedZones.length,
      existingCodes,
      nowIso,
    });
    for (const badge of newlyUnlockedBadges) {
      this.db.achievements[badge.id] = badge;
      progress.xpEarned += badge.xpBonus;
    }

    const accuracy = calculateAccuracyPercent(progress.correctCount, progress.totalAnswered);
    this.db.leaderboard[`lb_${session.id}_${params.studentId}`] = {
      id: `lb_${session.id}_${params.studentId}`,
      sessionId: session.id,
      studentId: params.studentId,
      teacherId: session.teacherId,
      studentName: progress.studentName,
      score: progress.score,
      xp: progress.xpEarned,
      level: calculateLevelFromXp(progress.xpEarned),
      accuracy,
      isPublicInSession: true,
      updatedAt: nowIso,
    };

    this.persist();

    return {
      ok: true as const,
      alreadyCompleted: false,
      isCorrect,
      correctIndex: isCorrect || attemptNumber >= session.maxAttempts ? answerKey.correctIndex : undefined,
      explanation: isCorrect || attemptNumber >= session.maxAttempts ? answerKey.explanation || '' : '',
      pointsEarned,
      xpEarned,
      progress,
      submission,
      newlyUnlockedBadges,
      leaderboard: this.getSessionLeaderboard(session.id),
    };
  }

  public getSessionLeaderboard(sessionId: string) {
    return sortLeaderboard(Object.values(this.db.leaderboard).filter((l) => l.sessionId === sessionId));
  }

  public getStudentAchievements(studentId: string) {
    return Object.values(this.db.achievements).filter((a) => a.studentId === studentId);
  }

  public getStudentSubmissions(sessionId: string, studentId: string) {
    return Object.values(this.db.submissions).filter(
      (s) => s.sessionId === sessionId && s.studentId === studentId
    );
  }

  public getTeacherOverview(teacherId?: string) {
    const filterByTeacher = <T extends { teacherId: string }>(arr: T[]) =>
      teacherId ? arr.filter((x) => x.teacherId === teacherId || x.teacherId === 'teacher_demo_1') : arr;

    const classes = filterByTeacher(Object.values(this.db.classes));
    const questionBanks = filterByTeacher(Object.values(this.db.questionBanks));
    const questions = filterByTeacher(Object.values(this.db.questions));
    const answerKeys = filterByTeacher(Object.values(this.db.answerKeys));
    const gameSessions = filterByTeacher(Object.values(this.db.gameSessions));
    const studentProgress = filterByTeacher(Object.values(this.db.studentProgress));
    const submissions = filterByTeacher(Object.values(this.db.submissions)).sort(
      (a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt)
    );

    return {
      classes,
      questionBanks,
      questions,
      answerKeys,
      gameSessions,
      studentProgress,
      submissions,
      auditLogs: this.db.auditLogs.slice(0, 60),
    };
  }

  public createClassroom(input: {
    teacherId: string;
    name: string;
    grade: Classroom['grade'];
    subject: string;
    description?: string;
  }) {
    const nowIso = new Date().toISOString();
    const id = `cls_${Date.now()}`;
    const inviteCode = `${input.subject.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'K')}${Math.floor(100 + Math.random() * 900)}`;
    const classroom: Classroom = {
      id,
      teacherId: input.teacherId,
      name: input.name.trim().slice(0, 100),
      grade: input.grade,
      subject: input.subject.trim().slice(0, 80),
      description: input.description?.trim().slice(0, 400),
      inviteCode,
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this.db.classes[id] = classroom;
    this.logAudit(input.teacherId, 'guru', 'CREATE_CLASS', 'class', id, `Membuat kelas ${classroom.name}`);
    this.persist();
    return classroom;
  }

  public createQuestionBankWithQuestions(input: {
    teacherId: string;
    title: string;
    subject: string;
    grade: QuestionBank['grade'];
    topic?: string;
    difficulty?: QuestionBank['difficulty'];
    items: Array<{
      prompt: string;
      options: string[];
      correctIndex: number;
      explanation?: string;
      points?: number;
      difficulty?: QuestionBank['difficulty'];
      hint?: string;
    }>;
  }) {
    const nowIso = new Date().toISOString();
    const bankId = `bank_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const letters = ['A', 'B', 'C', 'D', 'E'] as const;

    const cleanTitle = String(input.title || '').trim().slice(0, 120);
    const cleanSubject = String(input.subject || '').trim().slice(0, 80);
    const cleanTopic = (String(input.topic || '').trim() || cleanTitle || 'Umum').slice(0, 100);
    const validGrades: QuestionBank['grade'][] = ['10', '11', '12', 'Umum'];
    const cleanGrade: QuestionBank['grade'] = validGrades.includes(input.grade) ? input.grade : '11';
    const validDiffs: QuestionBank['difficulty'][] = ['Mudah', 'Sedang', 'Sulit'];
    const cleanDifficulty: QuestionBank['difficulty'] =
      input.difficulty && validDiffs.includes(input.difficulty) ? input.difficulty : 'Sedang';

    if (cleanTitle.length < 2 || cleanSubject.length < 2) {
      throw new Error('Judul bank soal dan mata pelajaran minimal 2 karakter.');
    }
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new Error('Minimal 1 soal wajib disertakan dalam bank soal.');
    }

    const normalizedItems = input.items.map((item, idx) => {
      const prompt = String(item?.prompt ?? '').trim().slice(0, 1000);
      if (prompt.length < 2) {
        throw new Error(`Teks pertanyaan pada Soal #${idx + 1} wajib diisi minimal 2 karakter.`);
      }
      const rawOptions = Array.isArray(item?.options) ? item.options : [];
      const cleanOptions = rawOptions
        .slice(0, 5)
        .map((o) => String(o ?? '').trim().slice(0, 300));
      if (cleanOptions.length < 2 || cleanOptions.some((o) => o.length === 0)) {
        throw new Error(`Soal #${idx + 1} harus memiliki minimal 2 pilihan jawaban yang tidak kosong.`);
      }
      const parsedIndex = Math.trunc(Number(item.correctIndex));
      const safeIndex = Number.isFinite(parsedIndex)
        ? Math.min(Math.max(0, parsedIndex), cleanOptions.length - 1)
        : 0;
      const rawPoints = Math.round(Number(item.points));
      const safePoints = Number.isFinite(rawPoints) ? Math.min(1000, Math.max(1, rawPoints)) : 20;
      const itemDiff: QuestionBank['difficulty'] =
        item.difficulty && validDiffs.includes(item.difficulty) ? item.difficulty : cleanDifficulty;

      return {
        prompt,
        cleanOptions,
        safeIndex,
        safePoints,
        itemDiff,
        hint: item.hint ? String(item.hint).trim().slice(0, 400) : undefined,
        explanation: item.explanation ? String(item.explanation).trim().slice(0, 1000) : '',
      };
    });

    const bank: QuestionBank = {
      id: bankId,
      teacherId: String(input.teacherId || 'teacher_demo_1'),
      title: cleanTitle,
      subject: cleanSubject,
      grade: cleanGrade,
      topic: cleanTopic,
      difficulty: cleanDifficulty,
      questionCount: normalizedItems.length,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this.db.questionBanks[bankId] = bank;

    const savedQuestions: StudentQuestion[] = [];
    const savedKeys: AnswerKey[] = [];

    normalizedItems.forEach((item, idx) => {
      const qId = `${bankId}_q${idx + 1}`;
      const q: StudentQuestion = {
        id: qId,
        bankId,
        teacherId: bank.teacherId,
        orderIndex: idx,
        prompt: item.prompt,
        options: item.cleanOptions,
        points: item.safePoints,
        difficulty: item.itemDiff,
        ...(item.hint ? { hint: item.hint } : {}),
        zoneId: ZONE_ORDER[idx % ZONE_ORDER.length],
        isPublished: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      const k: AnswerKey = {
        questionId: qId,
        bankId,
        teacherId: bank.teacherId,
        correctIndex: item.safeIndex,
        correctLetter: letters[item.safeIndex] || 'A',
        explanation: item.explanation,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      this.db.questions[qId] = q;
      this.db.answerKeys[qId] = k;
      savedQuestions.push(q);
      savedKeys.push(k);
    });

    this.logAudit(
      bank.teacherId,
      'guru',
      'IMPORT_QUESTION_BANK',
      'questionBank',
      bankId,
      `Menyimpan bank soal "${bank.title}" (${savedQuestions.length} soal terverifikasi guru)`
    );
    this.persist();
    return { bank, questions: savedQuestions, answerKeys: savedKeys };
  }

  public createGameSession(input: {
    teacherId: string;
    classId: string;
    bankId: string;
    title: string;
    gameMode: GameSession['gameMode'];
    difficulty: GameSession['difficulty'];
    durationMinutes: number;
    maxAttempts: number;
    requireIdentity: boolean;
    startsAt?: string;
    endsAt?: string;
  }) {
    const classroom = this.db.classes[input.classId];
    const bank = this.db.questionBanks[input.bankId];
    if (!classroom || !bank) {
      throw new Error('Kelas atau Bank Soal yang dipilih tidak ditemukan.');
    }

    const bankQuestions = Object.values(this.db.questions).filter((q) => q.bankId === bank.id);
    const totalPoints = bankQuestions.reduce((acc, q) => acc + q.points, 0);

    const now = new Date();
    const nowIso = now.toISOString();
    const randomCode = `${bank.subject.slice(0, 2).toUpperCase().replace(/[^A-Z]/g, 'E')}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const id = `sess_${Date.now()}`;

    const session: GameSession = {
      id,
      teacherId: input.teacherId,
      classId: classroom.id,
      bankId: bank.id,
      joinCode: randomCode,
      title: input.title.trim().slice(0, 140),
      subject: bank.subject,
      grade: bank.grade,
      topic: bank.topic,
      difficulty: input.difficulty,
      gameMode: input.gameMode,
      worldId: 'world_eduverse_utama',
      durationMinutes: Math.min(240, Math.max(1, input.durationMinutes)),
      maxAttempts: Math.min(20, Math.max(1, input.maxAttempts)),
      questionCount: bankQuestions.length,
      totalPoints,
      isLinkActive: true,
      status: 'active',
      requireIdentity: input.requireIdentity,
      startsAt: input.startsAt || nowIso,
      endsAt: input.endsAt || new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.db.gameSessions[id] = session;
    this.logAudit(
      input.teacherId,
      'guru',
      'CREATE_GAME_SESSION',
      'gameSession',
      id,
      `Membuat sesi ${session.title} dengan kode tautan ${session.joinCode}`
    );
    this.persist();
    return session;
  }

  public updateGameSession(
    sessionId: string,
    patch: Partial<Pick<GameSession, 'isLinkActive' | 'status' | 'endsAt' | 'maxAttempts' | 'durationMinutes' | 'title'>>
  ) {
    const existing = this.db.gameSessions[sessionId];
    if (!existing) return null;
    const updated: GameSession = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.db.gameSessions[sessionId] = updated;
    this.logAudit(
      updated.teacherId,
      'guru',
      'UPDATE_GAME_SESSION',
      'gameSession',
      sessionId,
      `Memperbarui sesi ${updated.joinCode}: status=${updated.status}, tautan=${updated.isLinkActive ? 'aktif' : 'nonaktif'}`
    );
    this.persist();
    return updated;
  }
}

export const serverStore = new EduverseServerStore();
