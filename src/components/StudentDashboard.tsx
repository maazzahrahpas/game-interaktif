import React, { useEffect, useState } from 'react';
import { Award, Compass, Gamepad2, Loader2, LogOut, Moon, Settings, Sparkles, Sun, Trophy } from 'lucide-react';
import {
  DEFAULT_ARENA_ID,
  DEFAULT_SKIN_ID,
  resolveArenaIdFromSession,
  getArenaTheme,
  getCharacterSkin,
} from '../game/gameCatalog.ts';
import { ArenaSkinSelector } from './ArenaSkinSelector.tsx';
import { AudioSettingsPanel } from './AudioSettingsPanel.tsx';
import type {
  AchievementBadge,
  ArenaThemeId,
  CharacterSkinId,
  EduverseUser,
  GameSession,
  StudentProgress,
  SubmissionRecord,
} from '../types/eduverse.ts';
import { calculateAccuracyPercent, calculateXpProgressInLevel } from '../utils/gameRules.ts';

interface StudentDashboardProps {
  user: EduverseUser;
  darkMode: boolean;
  onToggleTheme: () => void;
  onJoinSessionCode: (code: string) => void;
  onLogout: () => void;
  selectedArenaId?: ArenaThemeId;
  onChangeArenaId?: (arenaId: ArenaThemeId) => void;
  selectedSkinId?: CharacterSkinId;
  onChangeSkinId?: (skinId: CharacterSkinId) => void;
  avatarColor?: string;
  onChangeAvatarColor?: (hex: string) => void;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  user,
  darkMode,
  onToggleTheme,
  onJoinSessionCode,
  onLogout,
  selectedArenaId = DEFAULT_ARENA_ID,
  onChangeArenaId,
  selectedSkinId = DEFAULT_SKIN_ID,
  onChangeSkinId,
  avatarColor = '#2563EB',
  onChangeAvatarColor,
}) => {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [progressList, setProgressList] = useState<StudentProgress[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [badges, setBadges] = useState<AchievementBadge[]>([]);
  const [codeInput, setCodeInput] = useState('');
  const [showAudioSettings, setShowAudioSettings] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/student/${encodeURIComponent(user.uid)}/summary`);
        const data = await res.json();
        if (!active) return;
        if (res.ok && data.ok) {
          setSessions(data.sessions || []);
          setProgressList(data.progressList || []);
          setSubmissions(data.submissions || []);
          setBadges(data.badges || []);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [user.uid]);

  const totalXp = progressList.reduce((acc, p) => acc + p.xpEarned, user.xp);
  const xpInfo = calculateXpProgressInLevel(totalXp);
  const totalCorrect = submissions.filter((s) => s.isCorrect).length;
  const accuracy = calculateAccuracyPercent(totalCorrect, submissions.length);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between gap-6">
          <span className="text-xl font-extrabold text-blue-600 dark:text-sky-400 font-display">
            EDUVERSE · Portal Siswa
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowAudioSettings(true)}
              aria-label="Pengaturan Audio"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Settings className="w-4 h-4 text-blue-600 dark:text-sky-400" />
              Pengaturan Audio
            </button>
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label="Ubah tema"
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50"
            >
              <LogOut className="w-4 h-4" />
              Keluar
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-8">
        {/* Profile & XP Banner */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <p className="text-xs font-semibold text-blue-600 dark:text-sky-400">
              Penjelajah Level {xpInfo.level}
            </p>
            <h1 className="mt-1 text-2xl font-extrabold">{user.displayName}</h1>
            <div className="mt-3 w-72 max-w-full">
              <div className="flex justify-between text-xs font-mono mb-1">
                <span>Total {totalXp} XP</span>
                <span>{xpInfo.currentLevelXp}/100 ke Level {xpInfo.level + 1}</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-amber-500" style={{ width: `${xpInfo.percent}%` }} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-4 py-3">
              <p className="text-xs text-slate-500">Sesi Diikuti</p>
              <p className="text-xl font-extrabold font-mono">{progressList.length}</p>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-4 py-3">
              <p className="text-xs text-slate-500">Akurasi</p>
              <p className="text-xl font-extrabold font-mono">{accuracy}%</p>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-4 py-3">
              <p className="text-xs text-slate-500">Lencana</p>
              <p className="text-xl font-extrabold font-mono">{badges.length}</p>
            </div>
          </div>
        </section>

        {/* Join via Code */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="text-lg font-bold">Gabung Sesi dengan Kode Tautan Guru</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (codeInput.trim().length >= 4) {
                onJoinSessionCode(codeInput.trim().toUpperCase());
              }
            }}
            className="mt-3 flex flex-col sm:flex-row gap-3 max-w-lg"
          >
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="Masukkan kode sesi (misal: EDU101)"
              className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-2.5 text-sm font-mono uppercase"
            />
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold"
            >
              Buka Sesi
            </button>
          </form>
        </section>

        {/* Avatar Skin & Arena Customizer */}
        {onChangeArenaId && onChangeSkinId && onChangeAvatarColor && (
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  Kustomisasi Skin Karakter & Arena Favorit
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Karakter aktif: {getCharacterSkin(selectedSkinId).name} · Arena pilihan: {getArenaTheme(selectedArenaId).name}
                </p>
              </div>
            </div>
            <ArenaSkinSelector
              compact
              selectedArenaId={selectedArenaId}
              onSelectArena={onChangeArenaId}
              selectedSkinId={selectedSkinId}
              onSelectSkin={onChangeSkinId}
              avatarColor={avatarColor}
              onSelectColor={onChangeAvatarColor}
            />
          </section>
        )}

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Active Sessions List */}
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Compass className="w-5 h-5 text-blue-600" />
                Misi 3D Aktif Tersedia
              </h2>
              <div className="mt-4 space-y-3">
                {sessions
                  .filter((s) => s.status === 'active' && s.isLinkActive)
                  .map((s) => {
                    const sessionArena = getArenaTheme(resolveArenaIdFromSession(s));
                    return (
                      <div
                        key={s.id}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between gap-4"
                      >
                        <div>
                          <p className="text-xs text-slate-500">
                            {s.subject} · Kelas {s.grade} · {sessionArena.name} · Kode{' '}
                            <span className="font-mono font-bold">{s.joinCode}</span>
                          </p>
                          <p className="font-bold text-sm mt-0.5">{s.title}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onJoinSessionCode(s.joinCode)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0"
                        >
                          <Gamepad2 className="w-4 h-4" />
                          Mainkan
                        </button>
                      </div>
                    );
                  })}
              </div>
            </section>

            {/* Badges & History */}
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-500" />
                  Lencana & Pencapaian
                </h2>
                {badges.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">
                    Selesaikan misi di dunia 3D untuk membuka lencana pertamamu!
                  </p>
                ) : (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {badges.map((b) => (
                      <div
                        key={b.id}
                        className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3"
                      >
                        <p className="font-bold text-sm">{b.title}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{b.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-base font-bold flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-blue-600" />
                  Riwayat Skor Sesi
                </h3>
                {progressList.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">Belum ada riwayat permainan.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {progressList.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between text-sm rounded-xl border border-slate-200 dark:border-slate-800 px-3.5 py-2.5"
                      >
                        <span>
                          {p.correctCount}/{p.totalAnswered} benar · {p.unlockedZones.length}/6 zona
                        </span>
                        <span className="font-mono font-bold">{p.score} pts</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </main>

      {showAudioSettings && (
        <div className="fixed inset-0 z-30 bg-slate-950/75 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Pengaturan Audio Dunia 3D"
            className="max-w-lg w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl"
          >
            <AudioSettingsPanel onClose={() => setShowAudioSettings(false)} />
          </div>
        </div>
      )}
    </div>
  );
};
