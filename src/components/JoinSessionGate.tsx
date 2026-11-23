import React, { useEffect, useState } from 'react';
import { ArrowLeft, AlertTriangle, CheckCircle2, Clock, Gamepad2, Loader2, ShieldCheck } from 'lucide-react';
import type {
  ArenaThemeId,
  CharacterSkinId,
  Classroom,
  GameSession,
  LeaderboardEntry,
  StudentProgress,
  StudentQuestion,
} from '../types/eduverse.ts';
import {
  DEFAULT_ARENA_ID,
  DEFAULT_SKIN_ID,
  getArenaTheme,
  resolveArenaIdFromSession,
} from '../game/gameCatalog.ts';
import { ArenaSkinSelector } from './ArenaSkinSelector.tsx';
import { EduverseCrest } from './LandingPage.tsx';

export interface JoinedSessionPayload {
  session: GameSession;
  classroom: Classroom | null;
  questions: StudentQuestion[];
  leaderboard: LeaderboardEntry[];
  progress: StudentProgress;
  studentId: string;
  studentName: string;
  avatarColor: string;
  skinId?: CharacterSkinId;
  arenaIdOverride?: ArenaThemeId;
  openQuizOnStart?: boolean;
}

interface JoinSessionGateProps {
  joinCode: string;
  defaultStudentName?: string;
  defaultStudentId?: string;
  defaultSkinId?: CharacterSkinId;
  defaultAvatarColor?: string;
  defaultArenaId?: ArenaThemeId;
  onBack: () => void;
  onJoinedSuccess: (payload: JoinedSessionPayload) => void;
}

export const JoinSessionGate: React.FC<JoinSessionGateProps> = ({
  joinCode,
  defaultStudentName = '',
  defaultStudentId,
  defaultSkinId = DEFAULT_SKIN_ID,
  defaultAvatarColor = '#2563EB',
  defaultArenaId = DEFAULT_ARENA_ID,
  onBack,
  onJoinedSuccess,
}) => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<{
    session: GameSession;
    classroom: Classroom | null;
    questions: StudentQuestion[];
    leaderboard: LeaderboardEntry[];
  } | null>(null);

  const [studentName, setStudentName] = useState(defaultStudentName);
  const [studentIdentity, setStudentIdentity] = useState('');
  const [avatarColor, setAvatarColor] = useState(defaultAvatarColor);
  const [skinId, setSkinId] = useState<CharacterSkinId>(defaultSkinId);
  const [arenaId, setArenaId] = useState<ArenaThemeId>(defaultArenaId);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    let active = true;
    const loadSession = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch(`/api/sessions/join/${encodeURIComponent(joinCode)}`);
        const data = await res.json();
        if (!active) return;
        if (!res.ok || !data.ok) {
          setErrorMsg(data.error || 'Tautan sesi tidak dapat diakses.');
          setSessionData(null);
        } else {
          setSessionData({
            session: data.session,
            classroom: data.classroom,
            questions: data.questions,
            leaderboard: data.leaderboard || [],
          });
          setArenaId(resolveArenaIdFromSession(data.session));
        }
      } catch {
        if (active) setErrorMsg('Gagal terhubung ke server validasi sesi.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadSession();
    return () => {
      active = false;
    };
  }, [joinCode]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionData) return;
    if (studentName.trim().length < 2) {
      setFormError('Nama lengkap wajib diisi minimal 2 karakter.');
      return;
    }
    if (sessionData.session.requireIdentity && studentIdentity.trim().length < 2) {
      setFormError('NIS / Nomor Absen / Kelas wajib diisi sesuai pengaturan guru.');
      return;
    }

    setFormError('');
    setSubmitting(true);
    const sid =
      defaultStudentId ||
      `stu_${studentName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 12)}_${Math.random().toString(36).slice(2, 6)}`;

    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionData.session.joinCode)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: sid,
          studentName: studentName.trim(),
          studentIdentity: studentIdentity.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setFormError(data.error || 'Gagal bergabung ke sesi.');
        return;
      }
      onJoinedSuccess({
        session: sessionData.session,
        classroom: sessionData.classroom,
        questions: sessionData.questions,
        leaderboard: sessionData.leaderboard,
        progress: data.progress,
        studentId: sid,
        studentName: studentName.trim(),
        avatarColor,
        skinId,
        arenaIdOverride: arenaId,
      });
    } catch {
      setFormError('Kesalahan jaringan saat mendaftar sesi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 bg-[radial-gradient(ellipse_at_top,_rgba(56,189,248,0.14),_transparent_60%)] text-slate-900 dark:text-slate-100 flex items-center justify-center p-4 sm:p-6">
      <div className="max-w-2xl w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-lg">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Beranda
          </button>
          <span className="inline-flex items-center gap-2 text-sm font-extrabold font-display text-blue-600 dark:text-sky-400">
            <EduverseCrest className="w-5 h-5" />
            EDUVERSE
          </span>
        </div>

        {loading && (
          <div className="py-12 flex flex-col items-center justify-center text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">
              Memvalidasi kode sesi <span className="font-mono font-bold">{joinCode.toUpperCase()}</span> di server...
            </p>
          </div>
        )}

        {!loading && errorMsg && (
          <div className="mt-6 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h1 className="text-lg font-bold text-rose-900 dark:text-rose-200">
                  Akses Tautan Ditolak
                </h1>
                <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">{errorMsg}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="mt-5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold"
            >
              Kembali
            </button>
          </div>
        )}

        {!loading && sessionData && (
          <div className="mt-6">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>
                Tautan Sesi Aktif · Kode {sessionData.session.joinCode} · Arena{' '}
                {getArenaTheme(arenaId).name}
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">
              {sessionData.session.title}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {sessionData.session.subject} · Kelas {sessionData.session.grade} · Mode {sessionData.session.gameMode}
            </p>

            <div className="mt-5 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">Jumlah Soal</p>
                <p className="mt-0.5 text-lg font-bold font-mono">{sessionData.questions.length}</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">Durasi</p>
                <p className="mt-0.5 text-lg font-bold font-mono">{sessionData.session.durationMinutes}m</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">Percobaan</p>
                <p className="mt-0.5 text-lg font-bold font-mono">{sessionData.session.maxAttempts}x</p>
              </div>
            </div>

            <form onSubmit={handleJoin} className="mt-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="join-student-name"
                    className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
                  >
                    Nama Lengkap Siswa
                  </label>
                  <input
                    id="join-student-name"
                    type="text"
                    required
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="Contoh: Nadia Putri"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="join-student-identity"
                    className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
                  >
                    NIS / Kelas {sessionData.session.requireIdentity ? '(Wajib)' : '(Opsional)'}
                  </label>
                  <input
                    id="join-student-identity"
                    type="text"
                    required={sessionData.session.requireIdentity}
                    value={studentIdentity}
                    onChange={(e) => setStudentIdentity(e.target.value)}
                    placeholder="Contoh: 20261104 / XI IPA 1"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <ArenaSkinSelector
                compact
                selectedArenaId={arenaId}
                onSelectArena={setArenaId}
                selectedSkinId={skinId}
                onSelectSkin={setSkinId}
                avatarColor={avatarColor}
                onSelectColor={setAvatarColor}
              />

              {formError && (
                <p role="alert" className="text-sm font-medium text-rose-600 dark:text-rose-400">
                  {formError}
                </p>
              )}

              <div className="pt-2 flex items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Kunci jawaban diamankan di server
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  Tutup: {new Date(sessionData.session.endsAt).toLocaleDateString('id-ID')}
                </span>
              </div>

              <button
                type="submit"
                data-start="true"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors disabled:opacity-60"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gamepad2 className="w-4 h-4" />}
                Masuk ke Dunia 3D EDUVERSE
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
