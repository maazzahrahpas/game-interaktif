import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  deleteDoc,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type {
  AnimState,
  AnswerKey,
  CharacterSkinId,
  Classroom,
  EduverseUser,
  GameSession,
  PlayerAvatarState,
  QuestionBank,
  StudentQuestion,
  UserRole,
  WorldZoneId,
} from '../types/eduverse.ts';
import { arenaIdToWorldId, resolveArenaIdFromSession } from '../game/gameCatalog.ts';

const ALLOWED_PLAYER_SKINS: readonly CharacterSkinId[] = [
  'explorer',
  'cyber_knight',
  'bio_scientist',
  'arcane_scholar',
  'astro_pilot',
  'ninja_logic',
];

function sanitizeSkinId(raw: unknown): CharacterSkinId | undefined {
  if (typeof raw !== 'string') return undefined;
  return (ALLOWED_PLAYER_SKINS as readonly string[]).includes(raw)
    ? (raw as CharacterSkinId)
    : undefined;
}

const app = initializeApp(firebaseConfig);
const firestoreDatabaseId =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  'ai-studio-c0597574-e066-451c-b24c-36af24f4c03a';
export const db = getFirestore(app, firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const GOOGLE_DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly'] as const;

const googleDriveProvider = new GoogleAuthProvider();
for (const scope of GOOGLE_DRIVE_SCOPES) {
  googleDriveProvider.addScope(scope);
}

// Keep Workspace OAuth access tokens strictly in memory (never localStorage/sessionStorage)
let cachedDriveAccessToken: string | null = null;
let isConnectingDrive = false;

export const BOOTSTRAPPED_ADMIN_EMAIL = 'ma.azzahrahpas@gmail.com';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<{ online: boolean; message?: string }> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return { online: true };
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return { online: false, message: 'Firestore client offline.' };
    }
    return { online: true };
  }
}

// Run startup connectivity check
void testConnection();

export function getDriveAccessToken(): string | null {
  return cachedDriveAccessToken;
}

export function clearDriveAccessToken(): void {
  cachedDriveAccessToken = null;
}

export async function connectGoogleDrive(): Promise<{
  user: EduverseUser;
  accessToken: string;
  email?: string;
}> {
  isConnectingDrive = true;
  try {
    googleDriveProvider.setCustomParameters({ prompt: 'consent select_account' });
    const result = await signInWithPopup(auth, googleDriveProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Token akses Google Drive tidak tersedia. Pastikan izin Google Drive disetujui.');
    }
    cachedDriveAccessToken = credential.accessToken;
    const profile = await ensureUserProfile(result.user, 'guru');
    return {
      user: profile,
      accessToken: credential.accessToken,
      email: result.user.email || undefined,
    };
  } finally {
    isConnectingDrive = false;
  }
}

export async function signInWithGoogleRole(preferredRole: 'guru' | 'siswa'): Promise<EduverseUser> {
  const cred = await signInWithPopup(auth, googleProvider);
  return ensureUserProfile(cred.user, preferredRole);
}

export async function signOutFirebase(): Promise<void> {
  cachedDriveAccessToken = null;
  await signOut(auth);
}

export function subscribeAuthState(cb: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, (fbUser) => {
    if (!fbUser && !isConnectingDrive) {
      cachedDriveAccessToken = null;
    }
    cb(fbUser);
  });
}

export async function fetchExistingUserProfile(fbUser: FirebaseUser): Promise<EduverseUser | null> {
  const userPath = `users/${fbUser.uid}`;
  const userRef = doc(db, 'users', fbUser.uid);
  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      const isBootAdmin =
        fbUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL && fbUser.emailVerified;
      if (isBootAdmin) {
        return ensureUserProfile(fbUser, 'guru');
      }
      return null;
    }
    const data = snap.data();
    const displayName = (fbUser.displayName || fbUser.email?.split('@')[0] || 'Pengguna Eduverse').slice(0, 80);
    return {
      uid: fbUser.uid,
      displayName: String(data.displayName || displayName),
      email: fbUser.email || undefined,
      role: (data.role as UserRole) || 'siswa',
      avatarColor: String(data.avatarColor || '#2563EB'),
      xp: Number(data.xp || 0),
      level: Number(data.level || 1),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }
}

export async function ensureUserProfile(
  fbUser: FirebaseUser,
  preferredRole: 'guru' | 'siswa' = 'siswa'
): Promise<EduverseUser> {
  const userPath = `users/${fbUser.uid}`;
  const userRef = doc(db, 'users', fbUser.uid);

  const isBootAdmin =
    fbUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL && fbUser.emailVerified;
  const resolvedRole: UserRole = isBootAdmin ? 'super_admin' : preferredRole;
  const displayName = (fbUser.displayName || fbUser.email?.split('@')[0] || 'Pengguna Eduverse').slice(0, 80);

  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      return {
        uid: fbUser.uid,
        displayName: String(data.displayName || displayName),
        email: fbUser.email || undefined,
        role: (data.role as UserRole) || resolvedRole,
        avatarColor: String(data.avatarColor || '#2563EB'),
        xp: Number(data.xp || 0),
        level: Number(data.level || 1),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    await setDoc(userRef, {
      uid: fbUser.uid,
      displayName,
      role: resolvedRole,
      avatarColor: resolvedRole === 'guru' ? '#0EA5E9' : '#10B981',
      xp: 0,
      level: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Store PII in isolated private subcollection (Pillar 6)
    const privateRef = doc(db, 'users', fbUser.uid, 'private', 'info');
    await setDoc(privateRef, {
      uid: fbUser.uid,
      email: (fbUser.email || 'unknown@eduverse.app').slice(0, 160),
      updatedAt: serverTimestamp(),
    });

    return {
      uid: fbUser.uid,
      displayName,
      email: fbUser.email || undefined,
      role: resolvedRole,
      avatarColor: resolvedRole === 'guru' ? '#0EA5E9' : '#10B981',
      xp: 0,
      level: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export async function syncClassToFirestore(classroom: Classroom): Promise<void> {
  if (!auth.currentUser) return;
  const path = `classes/${classroom.id}`;
  try {
    await setDoc(doc(db, 'classes', classroom.id), {
      id: classroom.id,
      teacherId: auth.currentUser.uid,
      name: classroom.name.slice(0, 100),
      grade: classroom.grade,
      subject: classroom.subject.slice(0, 80),
      ...(classroom.description ? { description: classroom.description.slice(0, 400) } : {}),
      inviteCode: classroom.inviteCode,
      isActive: classroom.isActive,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncBankToFirestore(
  bank: QuestionBank,
  questions: StudentQuestion[],
  answerKeys: AnswerKey[]
): Promise<void> {
  if (!auth.currentUser) return;
  const uid = auth.currentUser.uid;
  try {
    const safeTitle = (bank.title.trim() || 'Bank Soal').slice(0, 120);
    const safeSubject = (bank.subject.trim() || 'Umum').slice(0, 80);
    const safeTopic = (bank.topic.trim() || safeTitle).slice(0, 100);
    await setDoc(doc(db, 'questionBanks', bank.id), {
      id: bank.id,
      teacherId: uid,
      title: safeTitle.length >= 2 ? safeTitle : `${safeTitle} 01`,
      subject: safeSubject.length >= 2 ? safeSubject : `${safeSubject} 01`,
      grade: bank.grade,
      topic: safeTopic.length >= 2 ? safeTopic : `${safeTopic} 01`,
      difficulty: bank.difficulty,
      questionCount: bank.questionCount,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    for (const q of questions) {
      const safePrompt = q.prompt.trim().slice(0, 1000);
      await setDoc(doc(db, 'questions', q.id), {
        id: q.id,
        bankId: bank.id,
        teacherId: uid,
        orderIndex: q.orderIndex,
        prompt: safePrompt.length >= 3 ? safePrompt : `${safePrompt}?`.padEnd(3, '.'),
        options: q.options.slice(0, 5).map((o) => (o.trim() || '-').slice(0, 300)),
        points: Math.min(1000, Math.max(1, Math.round(q.points))),
        difficulty: q.difficulty,
        ...(q.hint ? { hint: q.hint.slice(0, 400) } : {}),
        isPublished: q.isPublished,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    for (const k of answerKeys) {
      await setDoc(doc(db, 'answerKeys', k.questionId), {
        questionId: k.questionId,
        bankId: bank.id,
        teacherId: uid,
        correctIndex: k.correctIndex,
        correctLetter: k.correctLetter,
        ...(k.explanation ? { explanation: k.explanation.slice(0, 1000) } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `questionBanks/${bank.id}`);
  }
}

export async function syncSessionToFirestore(session: GameSession): Promise<void> {
  if (!auth.currentUser) return;
  const path = `gameSessions/${session.id}`;
  try {
    await setDoc(doc(db, 'gameSessions', session.id), {
      id: session.id,
      teacherId: auth.currentUser.uid,
      classId: session.classId,
      bankId: session.bankId,
      joinCode: session.joinCode,
      title: session.title.slice(0, 140),
      subject: session.subject.slice(0, 80),
      grade: session.grade,
      topic: session.topic.slice(0, 100),
      difficulty: session.difficulty,
      gameMode: session.gameMode,
      worldId: session.arenaId ? arenaIdToWorldId(session.arenaId) : session.worldId,
      durationMinutes: session.durationMinutes,
      maxAttempts: session.maxAttempts,
      questionCount: session.questionCount,
      totalPoints: session.totalPoints,
      isLinkActive: session.isLinkActive,
      status: session.status,
      requireIdentity: session.requireIdentity,
      startsAt: new Date(session.startsAt),
      endsAt: new Date(session.endsAt),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

function toIsoString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date().toISOString();
}

export async function fetchUserClassesFromFirestore(uid: string): Promise<Classroom[]> {
  const path = 'classes';
  try {
    const q = query(collection(db, 'classes'), where('teacherId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const v = d.data();
      return {
        id: d.id,
        teacherId: String(v.teacherId),
        name: String(v.name),
        grade: v.grade,
        subject: String(v.subject),
        description: v.description ? String(v.description) : undefined,
        inviteCode: String(v.inviteCode),
        isActive: Boolean(v.isActive),
        createdAt: toIsoString(v.createdAt),
        updatedAt: toIsoString(v.updatedAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchTeacherWorkspaceFromFirestore(uid: string): Promise<{
  classes: Classroom[];
  questionBanks: QuestionBank[];
  questions: StudentQuestion[];
  answerKeys: AnswerKey[];
  gameSessions: GameSession[];
}> {
  const classes = await fetchUserClassesFromFirestore(uid);

  let questionBanks: QuestionBank[] = [];
  try {
    const snap = await getDocs(query(collection(db, 'questionBanks'), where('teacherId', '==', uid)));
    questionBanks = snap.docs.map((d) => {
      const v = d.data();
      return {
        id: d.id,
        teacherId: String(v.teacherId),
        title: String(v.title),
        subject: String(v.subject),
        grade: v.grade,
        topic: String(v.topic || v.title),
        difficulty: v.difficulty || 'Sedang',
        questionCount: Number(v.questionCount || 0),
        createdAt: toIsoString(v.createdAt),
        updatedAt: toIsoString(v.updatedAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'questionBanks');
  }

  let questions: StudentQuestion[] = [];
  try {
    const snap = await getDocs(query(collection(db, 'questions'), where('teacherId', '==', uid)));
    questions = snap.docs.map((d) => {
      const v = d.data();
      return {
        id: d.id,
        bankId: String(v.bankId),
        teacherId: String(v.teacherId),
        orderIndex: Number(v.orderIndex || 0),
        prompt: String(v.prompt),
        options: Array.isArray(v.options) ? v.options.map((o: unknown) => String(o)) : [],
        points: Number(v.points || 20),
        difficulty: v.difficulty || 'Sedang',
        hint: v.hint ? String(v.hint) : undefined,
        zoneId: v.zoneId,
        isPublished: Boolean(v.isPublished),
        createdAt: toIsoString(v.createdAt),
        updatedAt: toIsoString(v.updatedAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'questions');
  }

  let answerKeys: AnswerKey[] = [];
  try {
    const snap = await getDocs(query(collection(db, 'answerKeys'), where('teacherId', '==', uid)));
    answerKeys = snap.docs.map((d) => {
      const v = d.data();
      return {
        questionId: String(v.questionId || d.id),
        bankId: String(v.bankId),
        teacherId: String(v.teacherId),
        correctIndex: Number(v.correctIndex || 0),
        correctLetter: (v.correctLetter || 'A') as AnswerKey['correctLetter'],
        explanation: v.explanation ? String(v.explanation) : '',
        createdAt: toIsoString(v.createdAt),
        updatedAt: toIsoString(v.updatedAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'answerKeys');
  }

  let gameSessions: GameSession[] = [];
  try {
    const snap = await getDocs(query(collection(db, 'gameSessions'), where('teacherId', '==', uid)));
    gameSessions = snap.docs.map((d) => {
      const v = d.data();
      return {
        id: d.id,
        teacherId: String(v.teacherId),
        classId: String(v.classId),
        bankId: String(v.bankId),
        joinCode: String(v.joinCode),
        title: String(v.title),
        subject: String(v.subject),
        grade: v.grade,
        topic: String(v.topic || ''),
        difficulty: v.difficulty || 'Sedang',
        gameMode: v.gameMode || 'Quiz Adventure',
        worldId: String(v.worldId || 'world_eduverse_utama'),
        arenaId: resolveArenaIdFromSession({ worldId: String(v.worldId || 'world_eduverse_utama') }),
        durationMinutes: Number(v.durationMinutes || 30),
        maxAttempts: Number(v.maxAttempts || 3),
        questionCount: Number(v.questionCount || 0),
        totalPoints: Number(v.totalPoints || 0),
        isLinkActive: Boolean(v.isLinkActive),
        status: v.status || 'active',
        requireIdentity: Boolean(v.requireIdentity),
        startsAt: toIsoString(v.startsAt),
        endsAt: toIsoString(v.endsAt),
        createdAt: toIsoString(v.createdAt),
        updatedAt: toIsoString(v.updatedAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'gameSessions');
  }

  return { classes, questionBanks, questions, answerKeys, gameSessions };
}

export async function syncPlayerStateToFirestore(state: {
  sessionId: string;
  studentId: string;
  displayName: string;
  avatarColor: string;
  skinId?: CharacterSkinId;
  x: number;
  y: number;
  z: number;
  rotY: number;
  animState: AnimState;
  currentZone: WorldZoneId;
  isOnline: boolean;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified || user.uid !== state.studentId) {
    return;
  }
  const safeId = `ps_${state.sessionId}_${state.studentId}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128);
  const docRef = doc(db, 'playerStates', safeId);

  if (!state.isOnline) {
    try {
      await deleteDoc(docRef);
    } catch {
      // Ignore if document doesn't exist or session is local-only
    }
    return;
  }

  const wrappedRot =
    ((((Number(state.rotY) || 0) + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  const clamp = (val: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Number.isFinite(val) ? Number(val.toFixed(2)) : 0));
  const validSkin = sanitizeSkinId(state.skinId);

  try {
    await setDoc(docRef, {
      id: safeId,
      sessionId: state.sessionId,
      studentId: state.studentId,
      displayName: (state.displayName.trim() || 'Penjelajah').slice(0, 80),
      avatarColor: (state.avatarColor || '#2563EB').slice(0, 20),
      ...(validSkin ? { skinId: validSkin } : {}),
      x: clamp(state.x, -500, 500),
      y: clamp(state.y, -50, 200),
      z: clamp(state.z, -500, 500),
      rotY: Number(wrappedRot.toFixed(3)),
      animState: state.animState,
      currentZone: state.currentZone || 'sekolah',
      isOnline: true,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Ignore silently if Firestore permissions or session doc reject write
  }
}

export function subscribeSessionPlayerStates(
  sessionId: string,
  onUpdate: (players: PlayerAvatarState[]) => void
): () => void {
  if (!auth.currentUser) {
    return () => undefined;
  }
  const q = query(
    collection(db, 'playerStates'),
    where('sessionId', '==', sessionId),
    where('isOnline', '==', true)
  );
  return onSnapshot(
    q,
    (snap) => {
      const nowMs = Date.now();
      const players: PlayerAvatarState[] = [];
      snap.docs.forEach((d) => {
        const v = d.data();
        const updatedIso = toIsoString(v.updatedAt);
        const updatedMs = Date.parse(updatedIso);
        if (Number.isFinite(updatedMs) && nowMs - updatedMs > 60000) {
          return;
        }
        const validSkin = sanitizeSkinId(v.skinId);
        players.push({
          id: String(v.id || d.id),
          sessionId: String(v.sessionId || sessionId),
          studentId: String(v.studentId || ''),
          displayName: String(v.displayName || 'Penjelajah'),
          avatarColor: String(v.avatarColor || '#3B82F6'),
          ...(validSkin ? { skinId: validSkin } : {}),
          x: Number(v.x || 0),
          y: Number(v.y || 0),
          z: Number(v.z || 14),
          rotY: Number(v.rotY || Math.PI),
          animState: (v.animState as AnimState) || 'idle',
          currentZone: (v.currentZone as WorldZoneId) || 'sekolah',
          isOnline: Boolean(v.isOnline),
          updatedAt: updatedIso,
        });
      });
      onUpdate(players);
    },
    () => {
      // Ignore silent listener errors when offline or unauthenticated
    }
  );
}

export async function fetchActiveSessionByCodeFromFirestore(joinCode: string): Promise<{
  session: GameSession;
  questions: StudentQuestion[];
} | null> {
  if (!auth.currentUser) return null;
  const cleanCode = joinCode.trim().toUpperCase();
  if (!cleanCode) return null;
  try {
    const sessSnap = await getDocs(
      query(
        collection(db, 'gameSessions'),
        where('joinCode', '==', cleanCode),
        where('status', '==', 'active'),
        where('isLinkActive', '==', true)
      )
    );
    const first = sessSnap.docs[0];
    if (!first) return null;
    const v = first.data();
    const session: GameSession = {
      id: first.id,
      teacherId: String(v.teacherId),
      classId: String(v.classId),
      bankId: String(v.bankId),
      joinCode: String(v.joinCode),
      title: String(v.title),
      subject: String(v.subject),
      grade: v.grade,
      topic: String(v.topic || ''),
      difficulty: v.difficulty || 'Sedang',
      gameMode: v.gameMode || 'Quiz Adventure',
      worldId: String(v.worldId || 'world_eduverse_utama'),
      arenaId: resolveArenaIdFromSession({ worldId: String(v.worldId || 'world_eduverse_utama') }),
      durationMinutes: Number(v.durationMinutes || 30),
      maxAttempts: Number(v.maxAttempts || 3),
      questionCount: Number(v.questionCount || 0),
      totalPoints: Number(v.totalPoints || 0),
      isLinkActive: Boolean(v.isLinkActive),
      status: v.status || 'active',
      requireIdentity: Boolean(v.requireIdentity),
      startsAt: toIsoString(v.startsAt),
      endsAt: toIsoString(v.endsAt),
      createdAt: toIsoString(v.createdAt),
      updatedAt: toIsoString(v.updatedAt),
    };
    const qSnap = await getDocs(
      query(
        collection(db, 'questions'),
        where('bankId', '==', session.bankId),
        where('isPublished', '==', true)
      )
    );
    const questions: StudentQuestion[] = qSnap.docs
      .map((d) => {
        const qd = d.data();
        return {
          id: d.id,
          bankId: String(qd.bankId),
          teacherId: String(qd.teacherId),
          orderIndex: Number(qd.orderIndex || 0),
          prompt: String(qd.prompt),
          options: Array.isArray(qd.options) ? qd.options.map((o: unknown) => String(o)) : [],
          points: Number(qd.points || 20),
          difficulty: qd.difficulty || 'Sedang',
          hint: qd.hint ? String(qd.hint) : undefined,
          zoneId: qd.zoneId,
          isPublished: Boolean(qd.isPublished),
          createdAt: toIsoString(qd.createdAt),
          updatedAt: toIsoString(qd.updatedAt),
        };
      })
      .sort((a, b) => a.orderIndex - b.orderIndex);
    return { session, questions };
  } catch {
    return null;
  }
}

