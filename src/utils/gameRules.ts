import type {
  AchievementBadge,
  GameSession,
  LeaderboardEntry,
  StudentProgress,
  WorldZoneId,
} from '../types/eduverse.ts';

export const WORLD_ZONES: {
  id: WorldZoneId;
  name: string;
  subtitle: string;
  requiredCorrect: number;
  npcName: string;
  npcRole: string;
  position: [number, number, number];
  color: string;
}[] = [
  {
    id: 'sekolah',
    name: 'Sekolah Virtual',
    subtitle: 'Gerbang utama akademi & menara jam pengetahuan',
    requiredCorrect: 0,
    npcName: 'Prof. Aksara',
    npcRole: 'Penjaga Gerbang Akademi',
    position: [0, 0, 10],
    color: '#2563EB',
  },
  {
    id: 'taman',
    name: 'Taman Cendekia',
    subtitle: 'Zona diskusi santai & kristal wawasan',
    requiredCorrect: 0,
    npcName: 'Kak Flora',
    npcRole: 'Pemandu Eksplorasi',
    position: [-20, 0, 12],
    color: '#10B981',
  },
  {
    id: 'lab',
    name: 'Laboratorium Sains',
    subtitle: 'Kubah eksperimen & teka-teki STEM',
    requiredCorrect: 1,
    npcName: 'Dr. Proton',
    npcRole: 'Kepala Riset Sains',
    position: [22, 0, -8],
    color: '#06B6D4',
  },
  {
    id: 'perpustakaan',
    name: 'Perpustakaan Digital',
    subtitle: 'Ruang arsip puzzle & logika cepat',
    requiredCorrect: 2,
    npcName: 'Pustakawan Lyra',
    npcRole: 'Penjaga Arsip Ilmu',
    position: [-22, 0, -14],
    color: '#F59E0B',
  },
  {
    id: 'pulau',
    name: 'Pulau Pengetahuan',
    subtitle: 'Pulau mercusuar & berburu harta karun soal',
    requiredCorrect: 3,
    npcName: 'Kapten Nalar',
    npcRole: 'Navigator Pulau',
    position: [0, 0, -34],
    color: '#8B5CF6',
  },
  {
    id: 'arena',
    name: 'Arena Tantangan',
    subtitle: 'Pertarungan Boss Ujian Akhir Eduverse',
    requiredCorrect: 4,
    npcName: 'Guardian Chronos',
    npcRole: 'Boss Ujian Akhir',
    position: [24, 0, 20],
    color: '#EF4444',
  },
];

export function calculateLevelFromXp(xp: number): number {
  const safeXp = Math.max(0, Math.floor(xp));
  return Math.floor(safeXp / 100) + 1;
}

export function calculateXpProgressInLevel(xp: number): {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  percent: number;
} {
  const safeXp = Math.max(0, Math.floor(xp));
  const level = calculateLevelFromXp(safeXp);
  const currentLevelXp = safeXp % 100;
  return {
    level,
    currentLevelXp,
    nextLevelXp: 100,
    percent: currentLevelXp,
  };
}

export function calculateQuestionReward(params: {
  basePoints: number;
  isCorrect: boolean;
  attemptNumber: number;
  streak: number;
  difficulty: 'Mudah' | 'Sedang' | 'Sulit';
}): { pointsEarned: number; xpEarned: number } {
  if (!params.isCorrect) {
    // Give small effort XP on wrong answer to encourage learning
    return { pointsEarned: 0, xpEarned: 5 };
  }

  const attemptFactor = params.attemptNumber <= 1 ? 1 : Math.max(0.5, 1 - (params.attemptNumber - 1) * 0.2);
  const pointsEarned = Math.round(params.basePoints * attemptFactor);
  const diffBonus = params.difficulty === 'Sulit' ? 20 : params.difficulty === 'Sedang' ? 12 : 8;
  const streakBonus = Math.min(30, Math.max(0, params.streak) * 5);
  const xpEarned = 20 + diffBonus + streakBonus;

  return { pointsEarned, xpEarned };
}

export function getUnlockedZonesForProgress(correctCount: number): WorldZoneId[] {
  return WORLD_ZONES.filter((z) => correctCount >= z.requiredCorrect).map((z) => z.id);
}

export function evaluateUnlockedBadges(params: {
  studentId: string;
  correctCount: number;
  totalAnswered: number;
  score: number;
  totalPoints: number;
  unlockedZonesCount: number;
  existingCodes: string[];
  nowIso: string;
}): AchievementBadge[] {
  const newBadges: AchievementBadge[] = [];
  const has = (code: string) => params.existingCodes.includes(code);

  const pushBadge = (badgeCode: string, title: string, description: string, xpBonus: number) => {
    if (has(badgeCode)) return;
    newBadges.push({
      id: `ach_${params.studentId}_${badgeCode}`,
      studentId: params.studentId,
      badgeCode,
      title,
      description,
      xpBonus,
      unlockedAt: params.nowIso,
    });
  };

  if (params.correctCount >= 1) {
    pushBadge('FIRST_SPARK', 'Langkah Pertama', 'Menjawab 1 soal misi dengan benar.', 25);
  }
  if (params.correctCount >= 3) {
    pushBadge('EXPLORER_3', 'Penjelajah Cerdas', 'Menyelesaikan 3 tantangan NPC.', 50);
  }
  if (params.unlockedZonesCount >= 6) {
    pushBadge('WORLD_MASTER', 'Penakluk 6 Zona', 'Membuka seluruh zona dunia Eduverse.', 100);
  }
  if (params.totalPoints > 0 && params.score >= params.totalPoints && params.totalAnswered > 0) {
    pushBadge('PERFECT_RUN', 'Skor Sempurna', 'Meraih nilai maksimal dalam sesi permainan.', 150);
  }

  return newBadges;
}

export interface SessionAccessCheck {
  allowed: boolean;
  reason?: string;
  code?: 'NOT_FOUND' | 'LINK_DISABLED' | 'NOT_STARTED' | 'EXPIRED' | 'ENDED';
}

export function validateSessionAccess(session: GameSession | null | undefined, nowMs: number = Date.now()): SessionAccessCheck {
  if (!session) {
    return {
      allowed: false,
      code: 'NOT_FOUND',
      reason: 'Kode sesi tidak ditemukan. Periksa kembali tautan dari guru Anda.',
    };
  }
  if (session.status === 'ended') {
    return {
      allowed: false,
      code: 'ENDED',
      reason: 'Sesi permainan ini telah diakhiri oleh guru.',
    };
  }
  if (!session.isLinkActive || session.status !== 'active') {
    return {
      allowed: false,
      code: 'LINK_DISABLED',
      reason: 'Tautan undangan sedang dinonaktifkan oleh guru.',
    };
  }
  const startMs = Date.parse(session.startsAt);
  const endMs = Date.parse(session.endsAt);
  if (!Number.isNaN(startMs) && nowMs < startMs) {
    return {
      allowed: false,
      code: 'NOT_STARTED',
      reason: `Sesi belum dimulai. Jadwal mulai: ${new Date(startMs).toLocaleString('id-ID')}.`,
    };
  }
  if (!Number.isNaN(endMs) && nowMs > endMs) {
    return {
      allowed: false,
      code: 'EXPIRED',
      reason: 'Masa berlaku tautan sesi permainan telah berakhir.',
    };
  }
  return { allowed: true };
}

export function sortLeaderboard(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
    return b.xp - a.xp;
  });
}

export function calculateAccuracyPercent(correctCount: number, totalAnswered: number): number {
  if (totalAnswered <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((correctCount / totalAnswered) * 100)));
}

export function computeSessionAnalytics(progressList: StudentProgress[]) {
  if (progressList.length === 0) {
    return {
      totalStudents: 0,
      averageScore: 0,
      highestScore: 0,
      completionRate: 0,
      averageAccuracy: 0,
    };
  }
  const totalStudents = progressList.length;
  const sumScore = progressList.reduce((acc, p) => acc + p.score, 0);
  const highestScore = progressList.reduce((max, p) => Math.max(max, p.score), 0);
  const completedCount = progressList.filter((p) => p.status === 'completed').length;
  const totalAcc = progressList.reduce(
    (acc, p) => acc + calculateAccuracyPercent(p.correctCount, p.totalAnswered),
    0
  );

  return {
    totalStudents,
    averageScore: Math.round(sumScore / totalStudents),
    highestScore,
    completionRate: Math.round((completedCount / totalStudents) * 100),
    averageAccuracy: Math.round(totalAcc / totalStudents),
  };
}

export type MusicIntensity = 'explore' | 'tense' | 'boss';

export function calculateStreakMultiplier(streak: number): number {
  const capped = Math.min(4, Math.max(0, Math.floor(streak)));
  return Number((1 + capped * 0.25).toFixed(2));
}

export function calculateQuestSpeedBonus(
  remainingSeconds: number,
  isCorrect: boolean
): { bonusXp: number; label: string } {
  if (!isCorrect || remainingSeconds <= 0) {
    return { bonusXp: 0, label: '' };
  }
  if (remainingSeconds >= 18) {
    return { bonusXp: 25, label: 'Bonus Kilat' };
  }
  if (remainingSeconds >= 10) {
    return { bonusXp: 15, label: 'Bonus Cepat' };
  }
  return { bonusXp: 8, label: 'Tepat Waktu' };
}

export function computeMusicIntensity(params: {
  activeZone: WorldZoneId;
  nearHazard: boolean;
  secondsLeft: number;
  inBossEncounter: boolean;
  shieldHp: number;
}): MusicIntensity {
  if (
    params.inBossEncounter ||
    params.activeZone === 'arena' ||
    params.secondsLeft <= 60 ||
    params.shieldHp <= 1
  ) {
    return 'boss';
  }
  if (
    params.nearHazard ||
    params.activeZone === 'lab' ||
    params.activeZone === 'perpustakaan' ||
    params.activeZone === 'pulau' ||
    params.secondsLeft <= 180
  ) {
    return 'tense';
  }
  return 'explore';
}

export function resolveHazardHit(params: {
  hp: number;
  invulnSeconds: number;
  isDashing: boolean;
}): { nextHp: number; damaged: boolean; defeated: boolean } {
  if (params.isDashing || params.invulnSeconds > 0 || params.hp <= 0) {
    return {
      nextHp: Math.max(0, params.hp),
      damaged: false,
      defeated: params.hp <= 0,
    };
  }
  const nextHp = Math.max(0, params.hp - 1);
  return {
    nextHp,
    damaged: true,
    defeated: nextHp === 0,
  };
}

