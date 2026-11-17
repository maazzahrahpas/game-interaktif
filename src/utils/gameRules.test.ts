import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLevelFromXp,
  calculateQuestionReward,
  evaluateUnlockedBadges,
  getUnlockedZonesForProgress,
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
