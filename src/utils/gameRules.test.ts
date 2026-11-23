import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLevelFromXp,
  calculateQuestSpeedBonus,
  calculateQuestionReward,
  calculateStreakMultiplier,
  computeMusicIntensity,
  evaluateUnlockedBadges,
  getQuizFeverStatus,
  getUnlockedZonesForProgress,
  pickFiftyFiftyEliminations,
  resolveHazardHit,
  sortLeaderboard,
  validateSessionAccess,
} from './gameRules.ts';
import type { GameSession, LeaderboardEntry } from '../types/eduverse.ts';

test('calculateLevelFromXp scales 100 XP per level', () => {
  assert.equal(calculateLevelFromXp(0), 1);
  assert.equal(calculateLevelFromXp(99), 1);
  assert.equal(calculateLevelFromXp(100), 2);
  assert.equal(calculateLevelFromXp(350), 4);
});

test('calculateQuestionReward rewards accuracy, difficulty, and streak', () => {
  const firstTry = calculateQuestionReward({
    basePoints: 25,
    isCorrect: true,
    attemptNumber: 1,
    streak: 2,
    difficulty: 'Sulit',
  });
  assert.equal(firstTry.pointsEarned, 25);
  assert.equal(firstTry.xpEarned, 50);

  const wrong = calculateQuestionReward({
    basePoints: 25,
    isCorrect: false,
    attemptNumber: 1,
    streak: 0,
    difficulty: 'Mudah',
  });
  assert.equal(wrong.pointsEarned, 0);
  assert.equal(wrong.xpEarned, 5);
});

test('validateSessionAccess enforces active status, link toggle, and time window', () => {
  const now = Date.parse('2026-11-16T12:00:00Z');
  const baseSession: GameSession = {
    id: 'sess_1',
    teacherId: 't_1',
    classId: 'cls_1',
    bankId: 'bank_1',
    joinCode: 'ABC123',
    title: 'Biologi Sel',
    subject: 'Biologi',
    grade: '11',
    topic: 'Organel',
    difficulty: 'Sedang',
    gameMode: 'Quiz Adventure',
    worldId: 'world_utama',
    durationMinutes: 30,
    maxAttempts: 2,
    questionCount: 4,
    totalPoints: 100,
    isLinkActive: true,
    status: 'active',
    requireIdentity: true,
    startsAt: '2026-11-16T11:00:00Z',
    endsAt: '2026-11-16T14:00:00Z',
    createdAt: '2026-11-16T10:00:00Z',
    updatedAt: '2026-11-16T10:00:00Z',
  };

  assert.equal(validateSessionAccess(baseSession, now).allowed, true);
  assert.equal(validateSessionAccess({ ...baseSession, isLinkActive: false }, now).code, 'LINK_DISABLED');
  assert.equal(validateSessionAccess({ ...baseSession, status: 'ended' }, now).code, 'ENDED');
  assert.equal(validateSessionAccess({ ...baseSession, endsAt: '2026-11-16T11:30:00Z' }, now).code, 'EXPIRED');
  assert.equal(validateSessionAccess({ ...baseSession, startsAt: '2026-11-16T13:00:00Z' }, now).code, 'NOT_STARTED');
});

test('getUnlockedZonesForProgress and evaluateUnlockedBadges unlock progression cleanly', () => {
  assert.deepEqual(getUnlockedZonesForProgress(0), ['sekolah', 'taman']);
  assert.equal(getUnlockedZonesForProgress(4).length, 6);

  const badges = evaluateUnlockedBadges({
    studentId: 'stu_1',
    correctCount: 4,
    totalAnswered: 4,
    score: 100,
    totalPoints: 100,
    unlockedZonesCount: 6,
    existingCodes: ['FIRST_SPARK'],
    nowIso: '2026-11-16T12:00:00Z',
  });
  const codes = badges.map((b) => b.badgeCode);
  assert.equal(codes.includes('FIRST_SPARK'), false);
  assert.equal(codes.includes('EXPLORER_3'), true);
  assert.equal(codes.includes('WORLD_MASTER'), true);
  assert.equal(codes.includes('PERFECT_RUN'), true);
});

test('sortLeaderboard orders by score, then accuracy, then xp', () => {
  const entries: LeaderboardEntry[] = [
    { id: '1', sessionId: 's', studentId: 'a', teacherId: 't', studentName: 'Andi', score: 80, xp: 100, level: 2, accuracy: 80, isPublicInSession: true, updatedAt: '' },
    { id: '2', sessionId: 's', studentId: 'b', teacherId: 't', studentName: 'Budi', score: 100, xp: 120, level: 2, accuracy: 100, isPublicInSession: true, updatedAt: '' },
    { id: '3', sessionId: 's', studentId: 'c', teacherId: 't', studentName: 'Citra', score: 80, xp: 150, level: 2, accuracy: 90, isPublicInSession: true, updatedAt: '' },
  ];
  const sorted = sortLeaderboard(entries);
  assert.deepEqual(sorted.map((e) => e.studentName), ['Budi', 'Citra', 'Andi']);
});

test('calculateStreakMultiplier, speed bonus, music intensity, and hazard hit work accurately', () => {
  assert.equal(calculateStreakMultiplier(0), 1);
  assert.equal(calculateStreakMultiplier(2), 1.5);
  assert.equal(calculateStreakMultiplier(8), 2);

  assert.equal(calculateQuestSpeedBonus(20, true).bonusXp, 25);
  assert.equal(calculateQuestSpeedBonus(12, true).bonusXp, 15);
  assert.equal(calculateQuestSpeedBonus(4, true).bonusXp, 8);
  assert.equal(calculateQuestSpeedBonus(20, false).bonusXp, 0);

  assert.equal(
    computeMusicIntensity({ activeZone: 'sekolah', nearHazard: false, secondsLeft: 900, inBossEncounter: false, shieldHp: 3 }),
    'explore'
  );
  assert.equal(
    computeMusicIntensity({ activeZone: 'lab', nearHazard: false, secondsLeft: 900, inBossEncounter: false, shieldHp: 3 }),
    'tense'
  );
  assert.equal(
    computeMusicIntensity({ activeZone: 'taman', nearHazard: true, secondsLeft: 900, inBossEncounter: false, shieldHp: 3 }),
    'tense'
  );
  assert.equal(
    computeMusicIntensity({ activeZone: 'arena', nearHazard: false, secondsLeft: 900, inBossEncounter: false, shieldHp: 3 }),
    'boss'
  );
  assert.equal(
    computeMusicIntensity({ activeZone: 'sekolah', nearHazard: false, secondsLeft: 45, inBossEncounter: false, shieldHp: 3 }),
    'boss'
  );

  assert.deepEqual(resolveHazardHit({ hp: 3, invulnSeconds: 0.5, isDashing: false }), {
    nextHp: 3,
    damaged: false,
    defeated: false,
  });
  assert.deepEqual(resolveHazardHit({ hp: 3, invulnSeconds: 0, isDashing: true }), {
    nextHp: 3,
    damaged: false,
    defeated: false,
  });
  assert.deepEqual(resolveHazardHit({ hp: 2, invulnSeconds: 0, isDashing: false }), {
    nextHp: 1,
    damaged: true,
    defeated: false,
  });
  assert.deepEqual(resolveHazardHit({ hp: 1, invulnSeconds: 0, isDashing: false }), {
    nextHp: 0,
    damaged: true,
    defeated: true,
  });
});

test('pickFiftyFiftyEliminations only removes wrong options and keeps correctIndex', () => {
  const eliminated4 = pickFiftyFiftyEliminations(4, 1);
  assert.equal(eliminated4.length, 2);
  assert.equal(eliminated4.includes(1), false);
  assert.equal(new Set(eliminated4).size, 2);

  const eliminated5 = pickFiftyFiftyEliminations(5, 3);
  assert.equal(eliminated5.length, 2);
  assert.equal(eliminated5.includes(3), false);

  const eliminated2 = pickFiftyFiftyEliminations(2, 0);
  assert.deepEqual(eliminated2, []);
});

test('getQuizFeverStatus tiers scale cleanly by streak', () => {
  assert.equal(getQuizFeverStatus(0).isFever, false);
  assert.equal(getQuizFeverStatus(1).xpMultiplier, 1.25);
  assert.equal(getQuizFeverStatus(2).isFever, true);
  assert.equal(getQuizFeverStatus(2).xpMultiplier, 1.5);
  assert.equal(getQuizFeverStatus(4).isFever, true);
  assert.equal(getQuizFeverStatus(4).xpMultiplier, 2);
});


