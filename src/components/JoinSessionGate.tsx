import React, { useEffect, useState } from 'react';
import { ArrowLeft, AlertTriangle, CheckCircle2, Clock, Gamepad2, Loader2, ShieldCheck } from 'lucide-react';
import type { Classroom, GameSession, LeaderboardEntry, StudentProgress, StudentQuestion } from '../types/eduverse.ts';

export interface JoinedSessionPayload {
  session: GameSession;
  classroom: Classroom | null;
  questions: StudentQuestion[];
  leaderboard: LeaderboardEntry[];
  progress: StudentProgress;
  studentId: string;
  studentName: string;
  avatarColor: string;
}

interface JoinSessionGateProps {
  joinCode: string;
  defaultStudentName?: string;
  defaultStudentId?: string;
  onBack: () => void;
  onJoinedSuccess: (payload: JoinedSessionPayload) => void;
}

const AVATAR_COLORS = [
  { label: 'Biru Akademi', hex: '#2563EB' },
  { label: 'Zamrud', hex: '#10B981' },
  { label: 'Sian Sains', hex: '#0891B2' },
  { label: 'Oranye Energi', hex: '#EA580C' },
  { label: 'Ungu Kosmik', hex: '#7C3AED' },
];

export const JoinSessionGate: React.FC<JoinSessionGateProps> = ({
  joinCode,
  defaultStudentName = '',
  defaultStudentId,
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
  const [avatarColor, setAvatarColor] = useState('#2563EB');
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
      });
    } catch {
      setFormError('Kesalahan jaringan saat mendaftar sesi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
      <div className="max-w-xl w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-7 sm:p-8 shadow-sm">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Beranda
        </button>

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
              <span>Tautan Sesi Aktif · Kode {sessionData.session.joinCode}</span>
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

            <form onSubmit={handleJoin} className="mt-6 space-y-4">
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

              <div>
                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
                  Pilih Warna Avatar 3D
                </span>
                <div className="flex flex-wrap gap-2">
                  {AVATAR_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setAvatarColor(c.hex)}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
                        avatarColor === c.hex
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full"
                        style={{ backgroundColor: c.hex }}
                        aria-hidden="true"
                      />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

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
