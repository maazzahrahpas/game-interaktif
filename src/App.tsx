import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { AdminAuthModal } from './components/AdminAuthModal.tsx';
import { LandingPage } from './components/LandingPage.tsx';
import { JoinSessionGate, type JoinedSessionPayload } from './components/JoinSessionGate.tsx';
import { WorldPlayView } from './components/WorldPlayView.tsx';
import { TeacherDashboard } from './components/TeacherDashboard.tsx';
import { StudentDashboard } from './components/StudentDashboard.tsx';
import { AudioProvider } from './contexts/AudioContext.tsx';
import { DEFAULT_ARENA_ID, DEFAULT_SKIN_ID } from './game/gameCatalog.ts';
import type {
  ArenaThemeId,
  CharacterSkinId,
  EduverseUser,
  StudentProgress,
} from './types/eduverse.ts';
import {
  fetchExistingUserProfile,
  signInWithGoogleRole,
  signOutFirebase,
  subscribeAuthState,
} from './lib/firebase.ts';

type AppView = 'landing' | 'join' | 'world' | 'teacher' | 'student';

const DEMO_TEACHER_USER: EduverseUser = {
  uid: 'teacher_demo_1',
  displayName: 'Admin & Guru Eduverse',
  email: 'admin.guru@eduverse.app',
  role: 'super_admin',
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

  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [selectedArenaId, setSelectedArenaId] = useState<ArenaThemeId>(DEFAULT_ARENA_ID);
  const [selectedSkinId, setSelectedSkinId] = useState<CharacterSkinId>(DEFAULT_SKIN_ID);
  const [selectedAvatarColor, setSelectedAvatarColor] = useState<string>('#2563EB');

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

  // Subscribe to Firebase Auth session (only hydrate existing profiles; signInWithGoogleRole creates new ones with chosen role)
  useEffect(() => {
    const unsub = subscribeAuthState((fbUser) => {
      if (!fbUser) return;
      void fetchExistingUserProfile(fbUser)
        .then((profile) => {
          if (profile) {
            setCurrentUser(profile);
          }
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
      identity?: {
        studentId: string;
        studentName: string;
        studentIdentity?: string;
        avatarColor?: string;
        skinId?: CharacterSkinId;
        arenaIdOverride?: ArenaThemeId;
        openQuizOnStart?: boolean;
      }
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
        const avatarColor = identity?.avatarColor || selectedAvatarColor || '#2563EB';
        const skinId = identity?.skinId || selectedSkinId;

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
          skinId,
          arenaIdOverride: identity?.arenaIdOverride,
          openQuizOnStart: identity?.openQuizOnStart,
        });
        setView('world');
      } catch {
        setAuthError('Gagal terhubung ke server dunia 3D.');
      } finally {
        setBootingWorld(false);
      }
    },
    [selectedAvatarColor, selectedSkinId]
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
      setShowAdminModal(false);
      if (profile.role === 'guru' || profile.role === 'super_admin') {
        setView('teacher');
      } else {
        setView('student');
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (raw.includes('popup-closed-by-user') || raw.includes('cancelled-popup-request')) {
        setAuthError('Login Google dibatalkan. Anda juga dapat masuk lewat Dashboard Guru atau kode sesi.');
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
    if (adminToken || (currentUser && (currentUser.role === 'guru' || currentUser.role === 'super_admin'))) {
      setView('teacher');
      return;
    }
    setShowAdminModal(true);
  };

  const handleAdminAuthenticated = (token: string) => {
    setAdminToken(token);
    setShowAdminModal(false);
    if (!currentUser || (currentUser.role !== 'guru' && currentUser.role !== 'super_admin')) {
      setCurrentUser({
        ...DEMO_TEACHER_USER,
        updatedAt: new Date().toISOString(),
      });
    }
    setView('teacher');
  };

  const handleLogout = async () => {
    if (adminToken) {
      fetch('/api/admin/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }).catch(() => undefined);
      setAdminToken(null);
    }
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
    if (adminToken || (currentUser && (currentUser.role === 'guru' || currentUser.role === 'super_admin'))) {
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
      avatarColor: activeWorldPayload?.avatarColor || selectedAvatarColor,
      skinId: activeWorldPayload?.skinId || selectedSkinId,
      xp: latestProgress.xpEarned,
      level: Math.max(1, Math.floor(latestProgress.xpEarned / 100) + 1),
      createdAt: latestProgress.createdAt,
      updatedAt: latestProgress.updatedAt,
    });
    setView('student');
  };

  if (bootingWorld) {
    return (
      <AudioProvider>
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
          <Loader2 className="w-10 h-10 animate-spin text-sky-400" />
          <p className="mt-4 text-sm font-semibold">Mempersiapkan Dunia 3D EDUVERSE...</p>
        </div>
      </AudioProvider>
    );
  }

  let content: ReactNode;
  if (view === 'world' && activeWorldPayload) {
    content = (
      <WorldPlayView
        session={activeWorldPayload.session}
        questions={activeWorldPayload.questions}
        initialProgress={activeWorldPayload.progress}
        initialLeaderboard={activeWorldPayload.leaderboard}
        studentId={activeWorldPayload.studentId}
        studentName={activeWorldPayload.studentName}
        avatarColor={activeWorldPayload.avatarColor}
        skinId={activeWorldPayload.skinId ?? selectedSkinId}
        arenaId={activeWorldPayload.arenaIdOverride}
        openQuizOnStart={activeWorldPayload.openQuizOnStart}
        onExitWorld={handleExitWorld}
      />
    );
  } else if (view === 'join') {
    content = (
      <JoinSessionGate
        joinCode={joinCode}
        defaultStudentName={currentUser?.displayName || ''}
        defaultStudentId={currentUser?.uid}
        defaultSkinId={selectedSkinId}
        defaultAvatarColor={selectedAvatarColor}
        defaultArenaId={selectedArenaId}
        onBack={navigateToLanding}
        onJoinedSuccess={(payload) => {
          if (payload.skinId) setSelectedSkinId(payload.skinId);
          if (payload.avatarColor) setSelectedAvatarColor(payload.avatarColor);
          if (payload.arenaIdOverride) setSelectedArenaId(payload.arenaIdOverride);
          setActiveWorldPayload(payload);
          setView('world');
        }}
      />
    );
  } else if (view === 'teacher') {
    const teacherUser =
      currentUser && (currentUser.role === 'guru' || currentUser.role === 'super_admin')
        ? currentUser
        : DEMO_TEACHER_USER;
    content = (
      <TeacherDashboard
        user={teacherUser}
        darkMode={darkMode}
        adminToken={adminToken}
        onToggleTheme={() => setDarkMode((d) => !d)}
        onLaunchSessionWorld={(code) =>
          void launchDirectSessionWorld(code, {
            studentId: `tester_${teacherUser.uid}`,
            studentName: `${teacherUser.displayName} (Uji)`,
            studentIdentity: 'GURU-TEST',
            avatarColor: selectedAvatarColor,
            skinId: selectedSkinId,
          })
        }
        onLogout={() => void handleLogout()}
      />
    );
  } else if (view === 'student' && currentUser) {
    content = (
      <StudentDashboard
        user={currentUser}
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode((d) => !d)}
        onJoinSessionCode={navigateToJoinCode}
        onLogout={() => void handleLogout()}
        selectedArenaId={selectedArenaId}
        onChangeArenaId={setSelectedArenaId}
        selectedSkinId={selectedSkinId}
        onChangeSkinId={setSelectedSkinId}
        avatarColor={selectedAvatarColor}
        onChangeAvatarColor={setSelectedAvatarColor}
      />
    );
  } else {
    content = (
      <LandingPage
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode((d) => !d)}
        onLoginRole={(role) => void handleLoginRole(role)}
        onEnterDemoTeacher={handleEnterTeacherWorkspace}
        onOpenJoinCode={navigateToJoinCode}
        onStartDemoWorld={() =>
          void launchDirectSessionWorld('EDU101', {
            studentId: 'stu_demo_explorer',
            studentName: 'Penjelajah Eduverse',
            avatarColor: selectedAvatarColor,
            skinId: selectedSkinId,
            arenaIdOverride: selectedArenaId,
          })
        }
        onStartQuizBlitz={() =>
          void launchDirectSessionWorld('EDU101', {
            studentId: 'stu_demo_explorer',
            studentName: 'Penjelajah Eduverse',
            avatarColor: selectedAvatarColor,
            skinId: selectedSkinId,
            arenaIdOverride: selectedArenaId,
            openQuizOnStart: true,
          })
        }
        selectedArenaId={selectedArenaId}
        onChangeArenaId={setSelectedArenaId}
        selectedSkinId={selectedSkinId}
        onChangeSkinId={setSelectedSkinId}
        avatarColor={selectedAvatarColor}
        onChangeAvatarColor={setSelectedAvatarColor}
        authLoading={authLoading}
        authError={authError}
      />
    );
  }

  return (
    <AudioProvider>
      {content}
      <AdminAuthModal
        open={showAdminModal}
        onClose={() => setShowAdminModal(false)}
        onAuthenticated={handleAdminAuthenticated}
        onGoogleGuruLogin={() => void handleLoginRole('guru')}
        googleLoading={authLoading}
      />
    </AudioProvider>
  );
}

