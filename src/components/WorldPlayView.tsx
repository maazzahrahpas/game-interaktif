import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Compass,
  HelpCircle,
  Loader2,
  LogOut,
  Map as MapIcon,
  Pause,
  Sparkles,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { EduverseWorldEngine } from '../game/EduverseWorldEngine.ts';
import { audioSynth } from '../game/audioSynth.ts';
import type {
  AchievementBadge,
  GameSession,
  LeaderboardEntry,
  PlayerAvatarState,
  StudentProgress,
  StudentQuestion,
  WorldZoneId,
} from '../types/eduverse.ts';
import {
  calculateAccuracyPercent,
  calculateXpProgressInLevel,
  WORLD_ZONES,
} from '../utils/gameRules.ts';

interface WorldPlayViewProps {
  session: GameSession;
  questions: StudentQuestion[];
  initialProgress: StudentProgress;
  initialLeaderboard: LeaderboardEntry[];
  studentId: string;
  studentName: string;
  avatarColor: string;
  onExitWorld: (latestProgress: StudentProgress) => void;
}

export const WorldPlayView: React.FC<WorldPlayViewProps> = ({
  session,
  questions,
  initialProgress,
  initialLeaderboard,
  studentId,
  studentName,
  avatarColor,
  onExitWorld,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<EduverseWorldEngine | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [progress, setProgress] = useState<StudentProgress>(initialProgress);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(initialLeaderboard);
  const [activeZone, setActiveZone] = useState<WorldZoneId>(initialProgress.currentZone || 'sekolah');
  const [nearNpcZone, setNearNpcZone] = useState<(typeof WORLD_ZONES)[number] | null>(null);
  const [crystalsCollected, setCrystalsCollected] = useState(0);
  const [crystalXp, setCrystalXp] = useState(0);
  const [streak, setStreak] = useState(0);

  const [muted, setMuted] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [soloMode, setSoloMode] = useState(false);
  const [onlinePlayers, setOnlinePlayers] = useState<PlayerAvatarState[]>([]);
  const [showTouchPad, setShowTouchPad] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(session.durationMinutes * 60);

  // Overlays
  const [activeModal, setActiveModal] = useState<'none' | 'quest' | 'map' | 'leaderboard' | 'pause' | 'victory'>('none');
  const [activeQuestion, setActiveQuestion] = useState<StudentQuestion | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [gradeFeedback, setGradeFeedback] = useState<{
    isCorrect: boolean;
    pointsEarned: number;
    xpEarned: number;
    explanation: string;
    correctIndex?: number;
    newlyUnlockedBadges: AchievementBadge[];
  } | null>(null);
  const [aiHint, setAiHint] = useState<string | null>(null);
  const [aiExplain, setAiExplain] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [sessionClosedNotice, setSessionClosedNotice] = useState<string | null>(null);

  // Keep latest callbacks in refs so Three.js canvas never remounts
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const questionsRef = useRef(questions);
  questionsRef.current = questions;
  const soloModeRef = useRef(soloMode);
  soloModeRef.current = soloMode;

  const openQuestForZone = (zone: (typeof WORLD_ZONES)[number]) => {
    const p = progressRef.current;
    if (!p.unlockedZones.includes(zone.id)) {
      setToastMsg(
        `Zona ${zone.name} masih terkunci! Jawab ${zone.requiredCorrect} soal dengan benar untuk membuka gerbang.`
      );
      return;
    }
    const qs = questionsRef.current;
    const zoneQuestions = qs.filter((q) => (q.zoneId || 'sekolah') === zone.id);
    const pendingInZone =
      zoneQuestions.find((q) => !p.completedQuests.includes(q.id)) ||
      qs.find((q) => !p.completedQuests.includes(q.id)) ||
      zoneQuestions[0] ||
      qs[0] ||
      null;

    if (!pendingInZone) {
      setToastMsg('Belum ada soal di sesi ini.');
      return;
    }

    setActiveQuestion(pendingInZone);
    setSelectedOption(null);
    setGradeFeedback(null);
    setAiHint(null);
    setAiExplain(null);
    setAiError(null);
    setActiveModal('quest');
  };

  const openQuestRef = useRef(openQuestForZone);
  openQuestRef.current = openQuestForZone;

  // Mount Three.js World Engine ONCE
  useEffect(() => {
    document.body.dataset.state = 'playing';
    const el = canvasMountRef.current;
    if (!el) return;

    const engine = new EduverseWorldEngine(el, {
      mode: 'playing',
      playerName: studentName,
      avatarColor,
      callbacks: {
        onZoneChange: (z) => setActiveZone(z),
        onNearNpcChange: (npc) => setNearNpcZone(npc),
        onInteractNpc: (zone) => openQuestRef.current(zone),
        onCollectCrystal: (_id, xpBonus) => {
          setCrystalsCollected((c) => c + 1);
          setCrystalXp((x) => x + xpBonus);
          setToastMsg(`Kristal Wawasan ditemukan! +${xpBonus} XP`);
        },
        onLocalMoveBroadcast: (state) => {
          if (soloModeRef.current) return;
          const ws = wsRef.current;
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'player_move', ...state }));
          }
        },
      },
    });
    engineRef.current = engine;
    engine.setUnlockedZones(progressRef.current.unlockedZones);

    return () => {
      engine.dispose();
      engineRef.current = null;
      document.body.dataset.state = 'title';
    };
  }, [studentName, avatarColor]);

  // Sync unlocked zones & completed zone markers into Three.js engine
  useEffect(() => {
    const completedZoneIds = questions
      .filter((q) => progress.completedQuests.includes(q.id))
      .map((q) => q.zoneId || 'sekolah');
    engineRef.current?.setUnlockedZones(progress.unlockedZones, completedZoneIds);
  }, [progress.unlockedZones, progress.completedQuests, questions]);

  // Update body state attribute for modal states
  useEffect(() => {
    if (activeModal === 'victory') document.body.dataset.state = 'gameover';
    else if (activeModal === 'pause') document.body.dataset.state = 'paused';
    else document.body.dataset.state = 'playing';
  }, [activeModal]);

  // Auto-hide toast
  useEffect(() => {
    if (!toastMsg) return;
    const t = window.setTimeout(() => setToastMsg(null), 3500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // Session Countdown Timer
  useEffect(() => {
    if (activeModal === 'victory' || activeModal === 'pause') return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [activeModal]);

  // Keyboard shortcuts [M] Mute, [Esc]/[P] Pause
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'KeyM') {
        audioSynth.muted = !audioSynth.muted;
        setMuted(audioSynth.muted);
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        setActiveModal((prev) => (prev === 'none' ? 'pause' : prev === 'pause' ? 'none' : prev));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Real-time WebSocket Multiplayer Connection (with graceful fallback to Individual Mode)
  useEffect(() => {
    if (soloMode) {
      wsRef.current?.close();
      wsRef.current = null;
      setWsConnected(false);
      setOnlinePlayers([]);
      engineRef.current?.syncRemotePlayers([], studentId);
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      ws.send(
        JSON.stringify({
          type: 'join_room',
          sessionId: session.id,
          studentId,
          displayName: studentName,
          role: 'siswa',
          avatarColor,
          x: 0,
          y: 0,
          z: 14,
          rotY: Math.PI,
        })
      );
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(String(evt.data));
        if (msg.type === 'room_init') {
          const list = (msg.players || []) as PlayerAvatarState[];
          setOnlinePlayers(list);
          engineRef.current?.syncRemotePlayers(list, studentId);
        } else if (msg.type === 'player_joined' || msg.type === 'player_moved') {
          const player = msg.player as PlayerAvatarState;
          setOnlinePlayers((prev) => {
            const next = prev.filter((p) => p.studentId !== player.studentId);
            next.push(player);
            engineRef.current?.syncRemotePlayers(next, studentId);
            return next;
          });
        } else if (msg.type === 'player_left') {
          setOnlinePlayers((prev) => {
            const next = prev.filter((p) => p.studentId !== msg.studentId);
            engineRef.current?.syncRemotePlayers(next, studentId);
            return next;
          });
        } else if (msg.type === 'progress_updated' && Array.isArray(msg.leaderboard)) {
          setLeaderboard(msg.leaderboard);
        } else if (msg.type === 'session_state_changed' && msg.session) {
          const updated = msg.session as GameSession;
          if (updated.status === 'ended' || !updated.isLinkActive) {
            setSessionClosedNotice('Guru telah menonaktifkan atau mengakhiri sesi ini.');
          }
        }
      } catch {
        // Ignore non-JSON frames
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
    };
    ws.onerror = () => {
      setWsConnected(false);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [session.id, studentId, studentName, avatarColor, soloMode]);

  const xpStats = useMemo(
    () => calculateXpProgressInLevel(progress.xpEarned + crystalXp),
    [progress.xpEarned, crystalXp]
  );

  const currentZoneInfo = useMemo(
    () => WORLD_ZONES.find((z) => z.id === activeZone) || WORLD_ZONES[0],
    [activeZone]
  );

  const formatClock = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleSubmitAnswer = async () => {
    if (!activeQuestion || selectedOption === null) return;
    setSubmitting(true);
    setAiError(null);
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(session.joinCode)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          studentName,
          questionId: activeQuestion.id,
          selectedIndex: selectedOption,
          streak,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setAiError(data.error || 'Gagal memeriksa jawaban di server.');
        return;
      }

      if (data.isCorrect) {
        audioSynth.playCorrect();
        setStreak((s) => s + 1);
      } else {
        audioSynth.playWrong();
        setStreak(0);
      }

      setProgress(data.progress);
      if (Array.isArray(data.leaderboard)) {
        setLeaderboard(data.leaderboard);
      }
      setGradeFeedback({
        isCorrect: data.isCorrect,
        pointsEarned: data.pointsEarned,
        xpEarned: data.xpEarned,
        explanation: data.explanation || '',
        correctIndex: data.correctIndex,
        newlyUnlockedBadges: data.newlyUnlockedBadges || [],
      });

      if (data.progress.status === 'completed') {
        setToastMsg('Selamat! Seluruh misi sesi telah diselesaikan!');
      }
    } catch {
      setAiError('Koneksi ke server penilaian gagal.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestAiHint = async () => {
    if (!activeQuestion) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/student-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'hint',
          payload: {
            questionPrompt: activeQuestion.prompt,
            options: activeQuestion.options,
            subject: session.subject,
            topic: session.topic,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setAiError(data.error || 'Tutor AI sedang tidak tersedia.');
      } else {
        setAiHint(data.text);
      }
    } catch {
      setAiError('Gagal menghubungi Tutor AI Gemini.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleRequestAiExplain = async () => {
    if (!activeQuestion || selectedOption === null || !gradeFeedback) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const correctIdx = gradeFeedback.correctIndex ?? selectedOption;
      const res = await fetch('/api/ai/student-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'explain',
          payload: {
            questionPrompt: activeQuestion.prompt,
            selectedOption: activeQuestion.options[selectedOption] || '',
            correctOption: activeQuestion.options[correctIdx] || '',
            isCorrect: gradeFeedback.isCorrect,
            subject: session.subject,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setAiError(data.error || 'Penjelasan AI tidak tersedia.');
      } else {
        setAiExplain(data.text);
      }
    } catch {
      setAiError('Gagal memuat penjelasan AI Gemini.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-sky-200 select-none">
      {/* Isolated 3D Canvas Container (no React HUD children inside) */}
      <div ref={canvasMountRef} data-testid="world-3d-canvas" className="absolute inset-0 w-full h-full" />

      {/* Pointer Pass-Through Perimeter HUD (Zero backdrop-blur over WebGL) */}
      <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4">
        {/* Top Perimeter Clusters */}
        <div className="flex items-start justify-between gap-4">
          {/* Top-Left Player & Zone Readout */}
          <div className="pointer-events-auto rounded-2xl bg-slate-900/90 text-white px-4 py-3 border border-slate-700/80 shadow-lg max-w-xs">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm text-white shrink-0"
                style={{ backgroundColor: avatarColor }}
              >
                Lv.{xpStats.level}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{studentName}</p>
                <p className="text-xs text-sky-300 truncate">{currentZoneInfo.name}</p>
              </div>
            </div>
            <div className="mt-2.5 h-2 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-all"
                style={{ width: `${xpStats.percent}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs font-mono tabular-nums text-slate-200">
              <span>Skor: {progress.score}</span>
              <span>Misi: {progress.completedQuests.length}/{questions.length}</span>
              <span>Kristal: {crystalsCollected}</span>
            </div>
          </div>

          {/* Top-Right Compact Utility Controls */}
          <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
            <div className="rounded-xl bg-slate-900/90 text-white px-3.5 py-2 border border-slate-700/80 text-xs font-mono tabular-nums flex items-center gap-3">
              <span>{session.joinCode}</span>
              <span aria-hidden="true">·</span>
              <span>{formatClock(secondsLeft)}</span>
            </div>

            <button
              type="button"
              onClick={() => setSoloMode((s) => !s)}
              title="Ubah mode Multiplayer / Individual"
              className="rounded-xl bg-slate-900/90 hover:bg-slate-800 text-white px-3 py-2 border border-slate-700/80 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              {wsConnected && !soloMode ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{Math.max(1, onlinePlayers.length)} Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                  <span>Mode Individual</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveModal('map')}
              aria-label="Buka Peta Zona"
              className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <MapIcon className="w-3.5 h-3.5" />
              Peta Misi
            </button>

            <button
              type="button"
              onClick={() => setActiveModal('leaderboard')}
              aria-label="Buka Leaderboard"
              className="rounded-xl bg-slate-900/90 hover:bg-slate-800 text-white px-3 py-2 border border-slate-700/80 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              Peringkat
            </button>

            <button
              type="button"
              onClick={() => {
                audioSynth.muted = !audioSynth.muted;
                setMuted(audioSynth.muted);
              }}
              aria-label={muted ? 'Nyalakan Suara' : 'Matikan Suara'}
              className="rounded-xl bg-slate-900/90 hover:bg-slate-800 text-white p-2 border border-slate-700/80"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setActiveModal('pause')}
              aria-label="Jeda Permainan"
              className="rounded-xl bg-slate-900/90 hover:bg-slate-800 text-white p-2 border border-slate-700/80"
            >
              <Pause className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center Notification Toast */}
        <div className="flex flex-col items-center gap-2">
          {sessionClosedNotice && (
            <div className="pointer-events-auto rounded-xl bg-rose-900/95 text-white px-5 py-3 border border-rose-500 text-sm font-semibold flex items-center gap-3">
              <span>{sessionClosedNotice}</span>
              <button
                type="button"
                onClick={() => onExitWorld(progress)}
                className="px-3 py-1 rounded-lg bg-white text-rose-900 text-xs font-bold"
              >
                Keluar
              </button>
            </div>
          )}
          {toastMsg && (
            <div className="rounded-xl bg-slate-900/90 text-amber-300 px-4 py-2 border border-amber-500/40 text-xs sm:text-sm font-semibold">
              {toastMsg}
            </div>
          )}
        </div>

        {/* Bottom Perimeter Prompt & Optional Mobile Touch Controls */}
        <div className="flex items-end justify-between gap-4">
          {showTouchPad ? (
            <div className="pointer-events-auto grid grid-cols-3 gap-1.5 bg-slate-900/85 p-2.5 rounded-2xl border border-slate-700">
              <div />
              <button
                type="button"
                onPointerDown={() => engineRef.current?.setVirtualInput(0, 1)}
                onPointerUp={() => engineRef.current?.setVirtualInput(0, 0)}
                onPointerLeave={() => engineRef.current?.setVirtualInput(0, 0)}
                className="w-11 h-11 rounded-lg bg-slate-800 text-white font-bold text-sm"
              >
                ▲
              </button>
              <div />
              <button
                type="button"
                onPointerDown={() => engineRef.current?.setVirtualInput(-1, 0)}
                onPointerUp={() => engineRef.current?.setVirtualInput(0, 0)}
                onPointerLeave={() => engineRef.current?.setVirtualInput(0, 0)}
                className="w-11 h-11 rounded-lg bg-slate-800 text-white font-bold text-sm"
              >
                ◀
              </button>
              <button
                type="button"
                onPointerDown={() => engineRef.current?.setVirtualInput(0, -1)}
                onPointerUp={() => engineRef.current?.setVirtualInput(0, 0)}
                onPointerLeave={() => engineRef.current?.setVirtualInput(0, 0)}
                className="w-11 h-11 rounded-lg bg-slate-800 text-white font-bold text-sm"
              >
                ▼
              </button>
              <button
                type="button"
                onPointerDown={() => engineRef.current?.setVirtualInput(1, 0)}
                onPointerUp={() => engineRef.current?.setVirtualInput(0, 0)}
                onPointerLeave={() => engineRef.current?.setVirtualInput(0, 0)}
                className="w-11 h-11 rounded-lg bg-slate-800 text-white font-bold text-sm"
              >
                ▶
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowTouchPad(true)}
              className="pointer-events-auto rounded-xl bg-slate-900/85 text-slate-200 px-3 py-2 text-xs font-semibold border border-slate-700"
            >
              Kontrol Sentuh
            </button>
          )}

          <div className="pointer-events-auto flex flex-col items-center gap-2">
            {nearNpcZone && (
              <button
                type="button"
                onClick={() => openQuestForZone(nearNpcZone)}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow-lg"
              >
                [E] Bicara dengan {nearNpcZone.npcName}
              </button>
            )}
            <div className="rounded-xl bg-slate-900/85 text-slate-200 px-4 py-1.5 text-xs border border-slate-700/80 hidden sm:block">
              WASD / Panah Gerak · Shift Lari · Spasi Lompat · Seret Mouse Kamera · E Interaksi
            </div>
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            {showTouchPad && (
              <>
                <button
                  type="button"
                  onClick={() => engineRef.current?.triggerJump()}
                  className="px-4 py-3 rounded-xl bg-emerald-600 text-white font-bold text-xs"
                >
                  Lompat
                </button>
                <button
                  type="button"
                  onClick={() => setShowTouchPad(false)}
                  className="px-3 py-3 rounded-xl bg-slate-900/85 text-slate-200 text-xs"
                >
                  Tutup
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => openQuestForZone(currentZoneInfo)}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
            >
              Buka Misi Zona
            </button>
          </div>
        </div>
      </div>

      {/* ==================== MODAL: NPC QUEST & QUIZ ==================== */}
      {activeModal === 'quest' && activeQuestion && (
        <div className="fixed inset-0 z-30 bg-slate-950/70 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="quest-modal-title"
            className="max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-blue-600 dark:text-sky-400">
                  {session.gameMode} · {currentZoneInfo.npcName} · Bobot {activeQuestion.points} Poin
                </p>
                <h2 id="quest-modal-title" className="mt-1 text-lg sm:text-xl font-bold">
                  Misi {activeQuestion.orderIndex + 1} dari {questions.length}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Tutup dialog misi"
                onClick={() => setActiveModal('none')}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4">
              <p className="text-base font-medium leading-relaxed">{activeQuestion.prompt}</p>
            </div>

            <div className="mt-4 space-y-2.5">
              {activeQuestion.options.map((opt, idx) => {
                const letter = String.fromCharCode(65 + idx);
                const isSelected = selectedOption === idx;
                const isRevealedCorrect = gradeFeedback?.correctIndex === idx;
                const isWrongChoice = gradeFeedback && !gradeFeedback.isCorrect && isSelected;

                let btnStyle =
                  'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800';
                if (isRevealedCorrect) {
                  btnStyle =
                    'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200';
                } else if (isWrongChoice) {
                  btnStyle =
                    'border-rose-500 bg-rose-50 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200';
                } else if (isSelected) {
                  btnStyle =
                    'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-sky-200';
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={Boolean(gradeFeedback) || submitting}
                    onClick={() => setSelectedOption(idx)}
                    className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium flex items-center gap-3 transition-colors ${btnStyle}`}
                  >
                    <span className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-mono font-bold text-xs shrink-0">
                      {letter}
                    </span>
                    <span className="flex-1">{opt}</span>
                  </button>
                );
              })}
            </div>

            {/* AI Hint & Feedback */}
            {aiHint && (
              <div className="mt-4 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 p-3.5 text-sm text-amber-900 dark:text-amber-200">
                <p className="font-semibold text-xs mb-1">Petunjuk Tutor AI Gemini:</p>
                <p>{aiHint}</p>
              </div>
            )}

            {aiError && (
              <div className="mt-4 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 p-3 text-sm text-rose-700 dark:text-rose-300">
                {aiError}
              </div>
            )}

            {gradeFeedback && (
              <div
                className={`mt-4 rounded-xl border p-4 ${
                  gradeFeedback.isCorrect
                    ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/50'
                    : 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50'
                }`}
              >
                <p className="font-bold text-sm">
                  {gradeFeedback.isCorrect
                    ? `Benar! +${gradeFeedback.pointsEarned} Poin · +${gradeFeedback.xpEarned} XP`
                    : `Belum tepat. +${gradeFeedback.xpEarned} XP usaha`}
                </p>
                {gradeFeedback.explanation && (
                  <p className="mt-1.5 text-sm opacity-90">{gradeFeedback.explanation}</p>
                )}
                {gradeFeedback.newlyUnlockedBadges.map((b) => (
                  <p key={b.id} className="mt-2 text-xs font-bold text-amber-600 dark:text-amber-400">
                    Lencana Baru Terbuka: {b.title} (+{b.xpBonus} XP)
                  </p>
                ))}
                {aiExplain && (
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 text-sm">
                    <p className="font-semibold text-xs text-blue-600 dark:text-sky-400 mb-1">
                      Penjelasan Konsep AI Gemini:
                    </p>
                    <p>{aiExplain}</p>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              {!gradeFeedback ? (
                <>
                  <button
                    type="button"
                    disabled={aiLoading}
                    onClick={handleRequestAiHint}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <HelpCircle className="w-4 h-4 text-amber-500" />}
                    Minta Petunjuk AI
                  </button>
                  <button
                    type="button"
                    disabled={selectedOption === null || submitting}
                    onClick={handleSubmitAnswer}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50"
                  >
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    Kirim Jawaban
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={aiLoading}
                    onClick={handleRequestAiExplain}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-blue-600" />}
                    Penjelasan AI Gemini
                  </button>
                  <div className="flex items-center gap-2">
                    {progress.status === 'completed' ? (
                      <button
                        type="button"
                        onClick={() => setActiveModal('victory')}
                        className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold"
                      >
                        Lihat Hasil Akhir
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActiveModal('none')}
                        className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold"
                      >
                        Lanjut Jelajahi Dunia
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: MAP & ZONE TELEPORT ==================== */}
      {activeModal === 'map' && (
        <div className="fixed inset-0 z-30 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Compass className="w-5 h-5 text-blue-600" />
                Peta Zona & Progres Misi
              </h2>
              <button
                type="button"
                aria-label="Tutup peta"
                onClick={() => setActiveModal('none')}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {WORLD_ZONES.map((z) => {
                const unlocked = progress.unlockedZones.includes(z.id);
                const zoneQs = questions.filter((q) => (q.zoneId || 'sekolah') === z.id);
                const solvedInZone = zoneQs.filter((q) => progress.completedQuests.includes(q.id)).length;
                return (
                  <div
                    key={z.id}
                    className={`rounded-xl border p-4 ${
                      unlocked
                        ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950'
                        : 'border-slate-200 dark:border-slate-800 opacity-65'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold" style={{ color: z.color }}>
                        {z.npcName}
                      </span>
                      <span className="text-xs font-mono">
                        {unlocked ? `${solvedInZone}/${zoneQs.length} selesai` : `Butuh ${z.requiredCorrect} benar`}
                      </span>
                    </div>
                    <h3 className="mt-1 font-bold text-sm">{z.name}</h3>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{z.subtitle}</p>
                    {unlocked && (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            engineRef.current?.teleportToZone(z.id);
                            setActiveModal('none');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-xs font-semibold"
                        >
                          Teleport
                        </button>
                        <button
                          type="button"
                          onClick={() => openQuestForZone(z)}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold"
                        >
                          Kerjakan Soal
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: LEADERBOARD ==================== */}
      {activeModal === 'leaderboard' && (
        <div className="fixed inset-0 z-30 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="max-w-lg w-full rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                Papan Peringkat Sesi {session.joinCode}
              </h2>
              <button
                type="button"
                aria-label="Tutup peringkat"
                onClick={() => setActiveModal('none')}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-4 space-y-2 max-h-80 overflow-y-auto">
              {leaderboard.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">Belum ada skor tercatat.</p>
              ) : (
                leaderboard.map((entry, idx) => (
                  <div
                    key={entry.id}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
                      entry.studentId === studentId
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-sm font-mono font-bold">#{idx + 1}</span>
                      <div>
                        <p className="text-sm font-bold">{entry.studentName}</p>
                        <p className="text-xs text-slate-500">Lv.{entry.level} · Akurasi {entry.accuracy}%</p>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-sm">{entry.score} pts</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: PAUSE / VICTORY ==================== */}
      {(activeModal === 'pause' || activeModal === 'victory') && (
        <div className="fixed inset-0 z-30 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 p-7 text-center">
            {activeModal === 'victory' ? (
              <Award className="w-12 h-12 text-amber-500 mx-auto" />
            ) : (
              <Users className="w-10 h-10 text-blue-600 mx-auto" />
            )}
            <h2 className="mt-3 text-2xl font-extrabold">
              {activeModal === 'victory' ? 'Misi Dunia Selesai!' : 'Permainan Dijeda'}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {session.title}
            </p>

            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-100 dark:bg-slate-800 p-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">Skor</p>
                <p className="text-lg font-bold font-mono">{progress.score}</p>
              </div>
              <div className="rounded-xl bg-slate-100 dark:bg-slate-800 p-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">Akurasi</p>
                <p className="text-lg font-bold font-mono">
                  {calculateAccuracyPercent(progress.correctCount, progress.totalAnswered)}%
                </p>
              </div>
              <div className="rounded-xl bg-slate-100 dark:bg-slate-800 p-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">Level</p>
                <p className="text-lg font-bold font-mono">{xpStats.level}</p>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => setActiveModal('none')}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm"
              >
                {activeModal === 'victory' ? 'Kembali Jelajahi Dunia' : 'Lanjutkan Bermain'}
              </button>
              <button
                type="button"
                onClick={() => onExitWorld(progress)}
                className="w-full py-3 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold text-sm inline-flex items-center justify-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <LogOut className="w-4 h-4" />
                Keluar ke Dashboard Siswa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
