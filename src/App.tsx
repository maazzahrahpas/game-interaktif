import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { LandingPage } from './components/LandingPage.tsx';
import { JoinSessionGate, type JoinedSessionPayload } from './components/JoinSessionGate.tsx';
import { WorldPlayView } from './components/WorldPlayView.tsx';
import { TeacherDashboard } from './components/TeacherDashboard.tsx';
import { StudentDashboard } from './components/StudentDashboard.tsx';
import type { EduverseUser, StudentProgress } from './types/eduverse.ts';
import {
  ensureUserProfile,
  signInWithGoogleRole,
  signOutFirebase,
  subscribeAuthState,
} from './lib/firebase.ts';

type AppView = 'landing' | 'join' | 'world' | 'teacher' | 'student';

const DEMO_TEACHER_USER: EduverseUser = {
  uid: 'teacher_demo_1',
  displayName: 'Ibu Ratna Sari, S.Pd',
  email: 'ratna.guru@eduverse.app',
  role: 'guru',
  avatarColor: '#0EA5E9',
  xp: 0,
  level: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function parseInitialRoute(): { view: AppView; joinCode: string; autostart: boolean } {
  if (typeof window === 'undefined') {
    return { view: 'landing', joinCode: 'EDU101', autostart: false };
  }
  const params = new URLSearchParams(window.location.search);
  const autostart = params.get('autostart') === '1';
  const joinMatch = window.location.pathname.match(/^\/join\/([A-Za-z0-9_-]+)/i);
  if (joinMatch && joinMatch[1]) {
    return { view: 'join', joinCode: joinMatch[1].toUpperCase(), autostart };
  }
  return { view: 'landing', joinCode: 'EDU101', autostart };
}

export default function App() {
  const initialRoute = parseInitialRoute();

  const [view, setView] = useState<AppView>(initialRoute.view);
  const [joinCode, setJoinCode] = useState<string>(initialRoute.joinCode);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('eduverse-theme') === 'dark';
  });

  const [currentUser, setCurrentUser] = useState<EduverseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [bootingWorld, setBootingWorld] = useState(initialRoute.autostart);
  const [activeWorldPayload, setActiveWorldPayload] = useState<JoinedSessionPayload | null>(null);

  // Sync Tailwind dark class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      window.localStorage.setItem('eduverse-theme', darkMode ? 'dark' : 'light');
    } catch {
      // Ignore storage failures
    }
  }, [darkMode]);

  // Listen to browser history back/forward
  useEffect(() => {
    const onPopState = () => {
      const next = parseInitialRoute();
      setJoinCode(next.joinCode);
      if (next.view === 'join') {
        setView('join');
      } else {
        setView('landing');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Subscribe to Firebase Auth session (without overriding explicit /join/:code or ?autostart=1)
  useEffect(() => {
    const unsub = subscribeAuthState((fbUser) => {
      if (!fbUser) return;
      void ensureUserProfile(fbUser, 'siswa')
        .then((profile) => {
          setCurrentUser(profile);
        })
        .catch(() => {
          // Ignore silent profile refresh errors if offline or unauthenticated
        });
    });
    return () => unsub();
  }, []);

  const launchDirectSessionWorld = useCallback(
    async (
      targetCode: string,
      identity?: { studentId: string; studentName: string; studentIdentity?: string; avatarColor?: string }
    ) => {
      setBootingWorld(true);
      setAuthError(null);
      try {
        const cleanCode = targetCode.trim().toUpperCase();
        const getRes = await fetch(`/api/sessions/join/${encodeURIComponent(cleanCode)}`);
        const getData = await getRes.json();
        if (!getRes.ok || !getData.ok) {
          setAuthError(getData.error || `Sesi ${cleanCode} tidak tersedia.`);
          return;
        }

        const studentId = identity?.studentId || 'stu_demo_explorer';
        const studentName = identity?.studentName || 'Penjelajah Eduverse';
        const studentIdentity = identity?.studentIdentity || 'XI IPA 1';
        const avatarColor = identity?.avatarColor || '#2563EB';

        const joinRes = await fetch(`/api/sessions/${encodeURIComponent(cleanCode)}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId,
            studentName,
            studentIdentity,
          }),
        });
        const joinData = await joinRes.json();
        if (!joinRes.ok || !joinData.ok) {
          setAuthError(joinData.error || 'Gagal memasuki dunia 3D.');
          return;
        }

        setActiveWorldPayload({
          session: getData.session,
          classroom: getData.classroom || null,
          questions: getData.questions || [],
          leaderboard: getData.leaderboard || [],
          progress: joinData.progress,
          studentId,
          studentName,
          avatarColor,
        });
        setView('world');
      } catch {
        setAuthError('Gagal terhubung ke server dunia 3D.');
      } finally {
        setBootingWorld(false);
      }
    },
    []
  );

  // Support ?autostart=1 to jump directly into playable 3D world
  useEffect(() => {
    if (initialRoute.autostart) {
      void launchDirectSessionWorld(initialRoute.joinCode || 'EDU101');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigateToJoinCode = useCallback((code: string) => {
    const cleaned = code.trim().toUpperCase().replace(/^.*\/JOIN\//i, '');
    if (!cleaned) return;
    setJoinCode(cleaned);
    setAuthError(null);
    if (window.location.pathname !== `/join/${cleaned}`) {
      window.history.pushState({}, '', `/join/${cleaned}`);
    }
    setView('join');
  }, []);

  const navigateToLanding = useCallback(() => {
    if (window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
    }
    document.body.dataset.state = 'title';
    setView('landing');
  }, []);

  const handleLoginRole = async (role: 'guru' | 'siswa') => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const profile = await signInWithGoogleRole(role);
      setCurrentUser(profile);
      if (profile.role === 'guru' || profile.role === 'super_admin') {
        setView('teacher');
      } else {
        setView('student');
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (raw.includes('popup-closed-by-user') || raw.includes('cancelled-popup-request')) {
        setAuthError('Login Google dibatalkan. Anda juga dapat langsung masuk lewat Dashboard Guru atau kode sesi.');
      } else if (raw.includes('popup-blocked')) {
        setAuthError('Popup login Google diblokir browser. Izinkan popup atau gunakan tombol Dashboard Guru / Gabung Sesi.');
      } else {
        setAuthError(`Gagal masuk dengan Google: ${raw}`);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEnterTeacherWorkspace = () => {
    setAuthError(null);
    if (currentUser && (currentUser.role === 'guru' || currentUser.role === 'super_admin')) {
      setView('teacher');
      return;
    }
    setCurrentUser(DEMO_TEACHER_USER);
    setView('teacher');
  };

  const handleLogout = async () => {
    try {
      await signOutFirebase();
    } catch {
      // Ignore if not signed in via Firebase
    }
    setCurrentUser(null);
    navigateToLanding();
  };

  const handleExitWorld = (latestProgress: StudentProgress) => {
    document.body.dataset.state = 'title';
    if (currentUser && (currentUser.role === 'guru' || currentUser.role === 'super_admin')) {
      setView('teacher');
      return;
    }
    if (currentUser && currentUser.role === 'siswa') {
      setView('student');
      return;
    }
    // Guest student who joined via /join/:code gets a Student Portal view with their progress!
    setCurrentUser({
      uid: latestProgress.studentId,
      displayName: latestProgress.studentName,
      identityNumber: latestProgress.studentIdentity,
      role: 'siswa',
      avatarColor: activeWorldPayload?.avatarColor || '#2563EB',
      xp: latestProgress.xpEarned,
      level: Math.max(1, Math.floor(latestProgress.xpEarned / 100) + 1),
      createdAt: latestProgress.createdAt,
      updatedAt: latestProgress.updatedAt,
    });
    setView('student');
  };

  if (bootingWorld) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
        <Loader2 className="w-10 h-10 animate-spin text-sky-400" />
        <p className="mt-4 text-sm font-semibold">Mempersiapkan Dunia 3D EDUVERSE...</p>
      </div>
    );
  }

  if (view === 'world' && activeWorldPayload) {
    return (
      <WorldPlayView
        session={activeWorldPayload.session}
        questions={activeWorldPayload.questions}
        initialProgress={activeWorldPayload.progress}
        initialLeaderboard={activeWorldPayload.leaderboard}
        studentId={activeWorldPayload.studentId}
        studentName={activeWorldPayload.studentName}
        avatarColor={activeWorldPayload.avatarColor}
        onExitWorld={handleExitWorld}
      />
    );
  }

  if (view === 'join') {
    return (
      <JoinSessionGate
        joinCode={joinCode}
        defaultStudentName={currentUser?.displayName || ''}
        defaultStudentId={currentUser?.uid}
        onBack={navigateToLanding}
        onJoinedSuccess={(payload) => {
          setActiveWorldPayload(payload);
          setView('world');
        }}
      />
    );
  }

  if (view === 'teacher') {
    const teacherUser =
      currentUser && (currentUser.role === 'guru' || currentUser.role === 'super_admin')
        ? currentUser
        : DEMO_TEACHER_USER;
    return (
      <TeacherDashboard
        user={teacherUser}
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode((d) => !d)}
        onLaunchSessionWorld={(code) =>
          void launchDirectSessionWorld(code, {
            studentId: `tester_${teacherUser.uid}`,
            studentName: `${teacherUser.displayName} (Uji)`,
            studentIdentity: 'GURU-TEST',
            avatarColor: '#0EA5E9',
          })
        }
        onLogout={() => void handleLogout()}
      />
    );
  }

  if (view === 'student' && currentUser) {
    return (
      <StudentDashboard
        user={currentUser}
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode((d) => !d)}
        onJoinSessionCode={navigateToJoinCode}
        onLogout={() => void handleLogout()}
      />
    );
  }

  return (
    <LandingPage
      darkMode={darkMode}
      onToggleTheme={() => setDarkMode((d) => !d)}
      onLoginRole={(role) => void handleLoginRole(role)}
      onEnterDemoTeacher={handleEnterTeacherWorkspace}
      onOpenJoinCode={navigateToJoinCode}
      onStartDemoWorld={() => void launchDirectSessionWorld('EDU101')}
      authLoading={authLoading}
      authError={authError}
    />
  );
}
