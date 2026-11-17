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
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type {
  AnswerKey,
  Classroom,
  EduverseUser,
  GameSession,
  QuestionBank,
  StudentQuestion,
  UserRole,
} from '../types/eduverse.ts';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

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

export async function signInWithGoogleRole(preferredRole: 'guru' | 'siswa'): Promise<EduverseUser> {
  const cred = await signInWithPopup(auth, googleProvider);
  return ensureUserProfile(cred.user, preferredRole);
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

export function subscribeAuthState(cb: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, cb);
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
    await setDoc(doc(db, 'questionBanks', bank.id), {
      id: bank.id,
      teacherId: uid,
      title: bank.title.slice(0, 120),
      subject: bank.subject.slice(0, 80),
      grade: bank.grade,
      topic: bank.topic.slice(0, 100),
      difficulty: bank.difficulty,
      questionCount: bank.questionCount,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    for (const q of questions) {
      await setDoc(doc(db, 'questions', q.id), {
        id: q.id,
        bankId: bank.id,
        teacherId: uid,
        orderIndex: q.orderIndex,
        prompt: q.prompt.slice(0, 1000),
        options: q.options.slice(0, 5),
        points: q.points,
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
      worldId: session.worldId,
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}
