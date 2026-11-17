export type UserRole = 'super_admin' | 'guru' | 'siswa';
export type GradeLevel = '10' | '11' | '12' | 'Umum';
export type DifficultyLevel = 'Mudah' | 'Sedang' | 'Sulit';
export type GameMode =
  | 'Quiz Adventure'
  | 'Mission Challenge'
  | 'Treasure Hunt'
  | 'Puzzle Room'
  | 'Boss Battle'
  | 'Speed Quiz'
  | 'Exploration Learning';

export type SessionStatus = 'draft' | 'active' | 'ended';
export type AnimState = 'idle' | 'walk' | 'run' | 'jump' | 'interact';

export type WorldZoneId =
  | 'sekolah'
  | 'taman'
  | 'lab'
  | 'perpustakaan'
  | 'pulau'
  | 'arena';

export interface EduverseUser {
  uid: string;
  displayName: string;
  email?: string;
  identityNumber?: string;
  schoolName?: string;
  role: UserRole;
  avatarColor: string;
  xp: number;
  level: number;
  createdAt: string;
  updatedAt: string;
}

export interface Classroom {
  id: string;
  teacherId: string;
  name: string;
  grade: GradeLevel;
  subject: string;
  description?: string;
  inviteCode: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionBank {
  id: string;
  teacherId: string;
  title: string;
  subject: string;
  grade: GradeLevel;
  topic: string;
  difficulty: DifficultyLevel;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StudentQuestion {
  id: string;
  bankId: string;
  teacherId: string;
  orderIndex: number;
  prompt: string;
  options: string[];
  points: number;
  difficulty: DifficultyLevel;
  hint?: string;
  zoneId?: WorldZoneId;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AnswerKey {
  questionId: string;
  bankId: string;
  teacherId: string;
  correctIndex: number;
  correctLetter: 'A' | 'B' | 'C' | 'D' | 'E';
  explanation?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ParsedWordQuestion {
  tempId: string;
  orderIndex: number;
  prompt: string;
  options: string[];
  correctLetter: 'A' | 'B' | 'C' | 'D' | 'E' | '';
  correctIndex: number;
  explanation: string;
  points: number;
  difficulty: DifficultyLevel;
  missingAnswerKey: boolean;
  warnings: string[];
}

export interface GameSession {
  id: string;
  teacherId: string;
  classId: string;
  bankId: string;
  joinCode: string;
  title: string;
  subject: string;
  grade: GradeLevel;
  topic: string;
  difficulty: DifficultyLevel;
  gameMode: GameMode;
  worldId: string;
  durationMinutes: number;
  maxAttempts: number;
  questionCount: number;
  totalPoints: number;
  isLinkActive: boolean;
  status: SessionStatus;
  requireIdentity: boolean;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudentProgress {
  id: string;
  sessionId: string;
  studentId: string;
  teacherId: string;
  studentName: string;
  studentIdentity?: string;
  score: number;
  xpEarned: number;
  correctCount: number;
  totalAnswered: number;
  attemptsUsed: number;
  completedQuests: string[];
  unlockedZones: WorldZoneId[];
  currentZone: WorldZoneId;
  status: 'active' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface SubmissionRecord {
  id: string;
  sessionId: string;
  studentId: string;
  studentName?: string;
  teacherId: string;
  questionId: string;
  selectedIndex: number;
  isCorrect: boolean;
  pointsEarned: number;
  xpEarned: number;
  attemptNumber: number;
  submittedAt: string;
}

export interface LeaderboardEntry {
  id: string;
  sessionId: string;
  studentId: string;
  teacherId: string;
  studentName: string;
  score: number;
  xp: number;
  level: number;
  accuracy: number;
  isPublicInSession: boolean;
  updatedAt: string;
}

export interface AchievementBadge {
  id: string;
  studentId: string;
  badgeCode: string;
  title: string;
  description: string;
  xpBonus: number;
  unlockedAt: string;
}

export interface PlayerAvatarState {
  id: string;
  sessionId: string;
  studentId: string;
  displayName: string;
  avatarColor: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  animState: AnimState;
  currentZone: WorldZoneId;
  isOnline: boolean;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorRole: UserRole;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  createdAt: string;
}
