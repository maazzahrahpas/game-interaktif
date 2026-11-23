import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Clock,
  Compass,
  Flame,
  Gamepad2,
  HelpCircle,
  Loader2,
  LogOut,
  Map as MapIcon,
  Monitor,
  Navigation,
  Pause,
  RotateCcw,
  Settings,
  Shield,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Tablet,
  Timer,
  Trophy,
  User,
  Users,
  Volume2,
  VolumeX,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  auth,
  subscribeSessionPlayerStates,
  syncPlayerStateToFirestore,
} from '../lib/firebase.ts';
import { EduverseWorldEngine } from '../game/EduverseWorldEngine.ts';
import {
  DEFAULT_SKIN_ID,
  getArenaTheme,
  getCharacterSkin,
  resolveArenaIdFromSession,
  type RadarBlipTarget,
} from '../game/gameCatalog.ts';
import {
  getDeviceProfile,
  getTouchControlScaleValue,
  shouldAutoEnableTouchControls,
} from '../game/touchControls.ts';
import { useAudio } from '../contexts/AudioContext.tsx';
import { ArenaSkinSelector } from './ArenaSkinSelector.tsx';
import { AudioSettingsPanel } from './AudioSettingsPanel.tsx';
import { MobileActionPad } from './MobileActionPad.tsx';
import { VirtualJoystick } from './VirtualJoystick.tsx';
import type {
  AchievementBadge,
  ArenaThemeId,
  CharacterSkinId,
  DeviceProfile,
  GameSession,
  LeaderboardEntry,
  PlayerAvatarState,
  StudentProgress,
  StudentQuestion,
  TouchControlSize,
  WorldZoneId,
} from '../types/eduverse.ts';
import {
  calculateAccuracyPercent,
  calculateQuestSpeedBonus,
  calculateStreakMultiplier,
  calculateXpProgressInLevel,
  computeMusicIntensity,
  getQuizFeverStatus,
  resolveHazardHit,
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
  skinId?: CharacterSkinId;
  arenaId?: ArenaThemeId;
  openQuizOnStart?: boolean;
  initialSoloMode?: boolean;
  onExitWorld: (latestProgress: StudentProgress) => void;
}

const ShieldSocketSvg: React.FC<{ active: boolean }> = ({ active }) => (
  <svg
    width="20"
    height="22"
    viewBox="0 0 20 22"
    fill="none"
    aria-hidden="true"
    className="shrink-0"
  >
    <path
      d="M10 1.5L18 4.8V10.5C18 15.4 14.6 19.2 10 20.8C5.4 19.2 2 15.4 2 10.5V4.8L10 1.5Z"
      fill={active ? '#0EA5E9' : '#1E293B'}
      stroke={active ? '#7DD3FC' : '#475569'}
      strokeWidth="1.6"
    />
    {active && (
      <path
        d="M10 4.5V17.4"
        stroke="#E0F2FE"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.7"
      />
    )}
  </svg>
);

export const WorldPlayView: React.FC<WorldPlayViewProps> = ({
  session,
  questions,
  initialProgress,
  initialLeaderboard,
  studentId,
  studentName,
  avatarColor,
  skinId,
  arenaId,
  openQuizOnStart = false,
  initialSoloMode = false,
  onExitWorld,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<EduverseWorldEngine | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [currentArenaId, setCurrentArenaId] = useState<ArenaThemeId>(
    () => arenaId || resolveArenaIdFromSession(session)
  );
  const [currentSkinId, setCurrentSkinId] = useState<CharacterSkinId>(
    () => skinId || DEFAULT_SKIN_ID
  );
  const [currentAvatarColor, setCurrentAvatarColor] = useState<string>(avatarColor);

  const [progress, setProgress] = useState<StudentProgress>(initialProgress);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(initialLeaderboard);
  const [activeZone, setActiveZone] = useState<WorldZoneId>(initialProgress.currentZone || 'sekolah');
  const [nearNpcZone, setNearNpcZone] = useState<(typeof WORLD_ZONES)[number] | null>(null);
  const [radarBlips, setRadarBlips] = useState<RadarBlipTarget[]>([]);
  const [crystalsCollected, setCrystalsCollected] = useState(0);
  const [bonusXp, setBonusXp] = useState(0);
  const [streak, setStreak] = useState(0);

  // Challenge Mechanics: Energy Shields (HP), Dash Stamina, Hazard Proximity
  const [shieldHp, setShieldHp] = useState(3);
  const [dashStamina, setDashStamina] = useState(100);
  const [nearHazard, setNearHazard] = useState(false);

  const {
    muted,
    isMusicPlaying,
    startMusic,
    stopMusic,
    setIntensity,
    setPaused,
    toggleMute,
    playSfx,
  } = useAudio();

  const [wsConnected, setWsConnected] = useState(false);
  const [httpSyncReady, setHttpSyncReady] = useState(false);
  const [soloMode, setSoloMode] = useState(initialSoloMode);
  const [onlinePlayers, setOnlinePlayers] = useState<PlayerAvatarState[]>([]);

  // Cross-transport player state caches (WebSocket + HTTP Room Sync + optional Firestore)
  const latestLocalStateRef = useRef<{
    x: number;
    y: number;
    z: number;
    rotY: number;
    animState: PlayerAvatarState['animState'];
    currentZone: WorldZoneId;
  }>({
    x: 0,
    y: 0,
    z: 14,
    rotY: Math.PI,
    animState: 'idle',
    currentZone: initialProgress.currentZone || 'sekolah',
  });
  const wsPlayersRef = useRef<Map<string, PlayerAvatarState>>(new Map());
  const httpPlayersRef = useRef<Map<string, PlayerAvatarState>>(new Map());
  const fsPlayersRef = useRef<Map<string, PlayerAvatarState>>(new Map());
  const lastHttpPostMsRef = useRef(0);
  const lastFsPostMsRef = useRef(0);
  const dirtyMoveRef = useRef(false);
  const currentSkinIdRef = useRef(currentSkinId);
  currentSkinIdRef.current = currentSkinId;
  const currentAvatarColorRef = useRef(currentAvatarColor);
  currentAvatarColorRef.current = currentAvatarColor;

  // Cross-Device Ergonomics (Phone / Tablet / Desktop)
  const touchOverriddenRef = useRef(false);
  const [deviceProfile, setDeviceProfile] = useState<DeviceProfile>(() => {
    if (typeof window === 'undefined') return 'desktop';
    return getDeviceProfile({
      hasCoarsePointer: window.matchMedia?.('(pointer: coarse)')?.matches ?? false,
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
      viewportWidth: window.innerWidth,
    });
  });
  const [isPortraitPhone, setIsPortraitPhone] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 640 && window.innerHeight > window.innerWidth;
  });
  const [portraitDismissed, setPortraitDismissed] = useState(false);
  const [touchSize, setTouchSize] = useState<TouchControlSize>('normal');
  const [cameraSensitivity, setCameraSensitivity] = useState<number>(1.0);
  const [autoFollowCamera, setAutoFollowCamera] = useState<boolean>(() => deviceProfile !== 'desktop');
  const [showTouchPad, setShowTouchPad] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return shouldAutoEnableTouchControls({
      hasCoarsePointer: window.matchMedia?.('(pointer: coarse)')?.matches ?? false,
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
      viewportWidth: window.innerWidth,
    });
  });

  const toggleTouchPad = () => {
    touchOverriddenRef.current = true;
    setShowTouchPad((v) => !v);
  };

  useEffect(() => {
    const syncDeviceAndTouch = () => {
      const hasCoarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
      const touchPts = navigator.maxTouchPoints ?? 0;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setDeviceProfile(
        getDeviceProfile({
          hasCoarsePointer: hasCoarse,
          maxTouchPoints: touchPts,
          viewportWidth: vw,
        })
      );
      setIsPortraitPhone(vw < 640 && vh > vw);
      if (!touchOverriddenRef.current) {
        setShowTouchPad(
          shouldAutoEnableTouchControls({
            hasCoarsePointer: hasCoarse,
            maxTouchPoints: touchPts,
            viewportWidth: vw,
          })
        );
      }
    };
    window.addEventListener('resize', syncDeviceAndTouch);
    return () => window.removeEventListener('resize', syncDeviceAndTouch);
  }, []);

  const [secondsLeft, setSecondsLeft] = useState(session.durationMinutes * 60);
  const [questTimer, setQuestTimer] = useState(25);
  const [defeatReason, setDefeatReason] = useState<'shields' | 'timeout'>('shields');

  // Quiz Power-Up Lifelines & History
  const [lifelines, setLifelines] = useState({
    fifty_fifty: 1,
    freeze_time: 1,
    shield_boost: 1,
  });
  const [eliminatedOptions, setEliminatedOptions] = useState<number[]>([]);
  const [lifelineBusy, setLifelineBusy] = useState(false);
  const [timeFrozen, setTimeFrozen] = useState(false);
  const [answerHistory, setAnswerHistory] = useState<
    Array<{ questionId: string; prompt: string; isCorrect: boolean; pointsEarned: number }>
  >([]);

  // Overlays
  const [activeModal, setActiveModal] = useState<
    'none' | 'quest' | 'map' | 'leaderboard' | 'settings' | 'pause' | 'victory' | 'defeat'
  >('none');
  const [settingsTab, setSettingsTab] = useState<'audio' | 'controls' | 'appearance'>('audio');
  const [activeQuestion, setActiveQuestion] = useState<StudentQuestion | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [gradeFeedback, setGradeFeedback] = useState<{
    isCorrect: boolean;
    pointsEarned: number;
    xpEarned: number;
    speedLabel?: string;
    speedBonusXp?: number;
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
  const shieldHpRef = useRef(shieldHp);
  shieldHpRef.current = shieldHp;

  const ensureAudioPlaying = useCallback(() => {
    if (!isMusicPlaying) {
      startMusic('explore');
    }
  }, [isMusicPlaying, startMusic]);

  const audioActionsRef = useRef({ startMusic, stopMusic, playSfx });
  audioActionsRef.current = { startMusic, stopMusic, playSfx };

  const rebuildAndSyncPlayers = useCallback(() => {
    if (soloModeRef.current) {
      setOnlinePlayers([]);
      engineRef.current?.syncRemotePlayers([], studentId);
      return;
    }
    const merged = new Map<string, PlayerAvatarState>();
    for (const p of fsPlayersRef.current.values()) {
      merged.set(p.studentId, p);
    }
    for (const p of httpPlayersRef.current.values()) {
      const prev = merged.get(p.studentId);
      merged.set(p.studentId, { ...prev, ...p, skinId: p.skinId || prev?.skinId });
    }
    for (const p of wsPlayersRef.current.values()) {
      const prev = merged.get(p.studentId);
      merged.set(p.studentId, { ...prev, ...p, skinId: p.skinId || prev?.skinId });
    }
    const list = Array.from(merged.values());
    setOnlinePlayers(list);
    engineRef.current?.syncRemotePlayers(list, studentId);
  }, [studentId]);

  const pushHttpPresence = useCallback(async () => {
    if (soloModeRef.current) return;
    lastHttpPostMsRef.current = Date.now();
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(session.joinCode)}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          displayName: studentName,
          avatarColor: currentAvatarColorRef.current,
          skinId: currentSkinIdRef.current,
          ...latestLocalStateRef.current,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok && Array.isArray(data.players)) {
        setHttpSyncReady(true);
        const nextMap = new Map<string, PlayerAvatarState>();
        for (const p of data.players as PlayerAvatarState[]) {
          nextMap.set(p.studentId, p);
        }
        httpPlayersRef.current = nextMap;
        rebuildAndSyncPlayers();
      }
    } catch {
      // Ignore transient network errors during polling
    }
  }, [session.joinCode, studentId, studentName, rebuildAndSyncPlayers]);

  const handleSetSoloMode = useCallback(
    (nextSolo: boolean) => {
      playSfx('uiClick');
      setSoloMode(nextSolo);
      setToastMsg(
        nextSolo
          ? 'Mode Individual (Solo) aktif. Anda bermain sendiri tanpa avatar pemain lain.'
          : 'Mode Multiplayer aktif! Menyinkronkan siswa lain di arena yang sama...'
      );
    },
    [playSfx]
  );

  const loadQuestionIntoQuizModal = useCallback((q: StudentQuestion) => {
    setActiveQuestion(q);
    setSelectedOption(null);
    setEliminatedOptions([]);
    setTimeFrozen(false);
    setGradeFeedback(null);
    setAiHint(null);
    setAiExplain(null);
    setAiError(null);
    setQuestTimer(25);
    setActiveModal('quest');
  }, []);

  const openQuestForZone = useCallback(
    (zone: (typeof WORLD_ZONES)[number]) => {
      ensureAudioPlaying();
      playSfx('uiClick');
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
      loadQuestionIntoQuizModal(pendingInZone);
    },
    [ensureAudioPlaying, playSfx, loadQuestionIntoQuizModal]
  );

  const openNextPendingQuiz = useCallback(() => {
    ensureAudioPlaying();
    playSfx('uiClick');
    const p = progressRef.current;
    const qs = questionsRef.current;
    const nextQ =
      qs.find((q) => !p.completedQuests.includes(q.id)) ||
      qs[0] ||
      null;
    if (!nextQ) {
      setToastMsg('Semua soal sesi telah tersedia atau kosong.');
      return;
    }
    loadQuestionIntoQuizModal(nextQ);
  }, [ensureAudioPlaying, playSfx, loadQuestionIntoQuizModal]);

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
      avatarColor: currentAvatarColor,
      skinId: currentSkinId,
      arenaId: currentArenaId,
      cameraSensitivity,
      autoFollowCamera,
      callbacks: {
        onZoneChange: (z) => setActiveZone(z),
        onNearNpcChange: (npc) => setNearNpcZone(npc),
        onInteractNpc: (zone) => openQuestRef.current(zone),
        onDashStaminaChange: (pct) => setDashStamina(pct),
        onNearHazardChange: (near) => setNearHazard(near),
        onRadarUpdate: (blips) => setRadarBlips(blips),
        onHazardHit: (reason) => {
          const outcome = resolveHazardHit({
            hp: shieldHpRef.current,
            invulnSeconds: 0,
            isDashing: false,
          });
          setShieldHp(outcome.nextHp);
          if (outcome.defeated) {
            setDefeatReason('shields');
            setActiveModal('defeat');
            audioActionsRef.current.playSfx('defeat');
          } else {
            setToastMsg(`${reason} Perisai tersisa: ${outcome.nextHp}/3`);
          }
        },
        onCollectCrystal: (_id, xpEarned, timeBonus, isGolden) => {
          const mult = getArenaTheme(currentArenaId).bonusCrystalMultiplier;
          const boostedXp = Math.round(xpEarned * mult);
          setCrystalsCollected((c) => {
            const nextCount = c + 1;
            if (nextCount % 2 === 0) {
              setLifelines((prev) => ({
                ...prev,
                fifty_fifty: Math.min(3, prev.fifty_fifty + 1),
              }));
            }
            return nextCount;
          });
          setBonusXp((x) => x + boostedXp);
          if (timeBonus > 0) {
            setSecondsLeft((s) => s + timeBonus);
          }
          if (isGolden) {
            setShieldHp((hp) => Math.min(3, hp + 1));
            setToastMsg(`Kristal Chrono Emas! +${boostedXp} XP · +${timeBonus}d Waktu · +1 Perisai`);
          } else {
            setToastMsg(`Kristal Wawasan ditemukan! +${boostedXp} XP`);
          }
        },
        onLocalMoveBroadcast: (state) => {
          latestLocalStateRef.current = {
            x: state.x,
            y: state.y,
            z: state.z,
            rotY: state.rotY,
            animState: state.animState,
            currentZone: state.currentZone,
          };
          dirtyMoveRef.current = true;
          if (soloModeRef.current) return;
          const ws = wsRef.current;
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'player_move', ...state }));
          } else if (Date.now() - lastHttpPostMsRef.current >= 450) {
            void pushHttpPresence();
          }
          if (auth.currentUser?.uid === studentId && Date.now() - lastFsPostMsRef.current >= 1500) {
            lastFsPostMsRef.current = Date.now();
            void syncPlayerStateToFirestore({
              sessionId: session.id,
              studentId,
              displayName: studentName,
              avatarColor: currentAvatarColorRef.current,
              ...state,
              isOnline: true,
            });
          }
        },
      },
    });
    engineRef.current = engine;
    engine.setUnlockedZones(progressRef.current.unlockedZones);

    const startAudioOnGesture = () => {
      audioActionsRef.current.startMusic('explore');
    };
    window.addEventListener('pointerdown', startAudioOnGesture, { once: true });
    window.addEventListener('keydown', startAudioOnGesture, { once: true });

    return () => {
      window.removeEventListener('pointerdown', startAudioOnGesture);
      window.removeEventListener('keydown', startAudioOnGesture);
      audioActionsRef.current.stopMusic();
      engine.dispose();
      engineRef.current = null;
      document.body.dataset.state = 'title';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentName]);

  // Live sync skin, color, arena, and camera preferences into Three.js engine + multiplayer room
  useEffect(() => {
    engineRef.current?.setPlayerAppearance(currentSkinId, currentAvatarColor, studentName);
    if (!soloModeRef.current) {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'player_update',
            displayName: studentName,
            avatarColor: currentAvatarColor,
            skinId: currentSkinId,
            ...latestLocalStateRef.current,
          })
        );
      } else {
        void pushHttpPresence();
      }
    }
  }, [currentSkinId, currentAvatarColor, studentName, pushHttpPresence]);

  useEffect(() => {
    engineRef.current?.setArenaTheme(currentArenaId);
  }, [currentArenaId]);

  useEffect(() => {
    engineRef.current?.setCameraOptions({
      sensitivity: cameraSensitivity,
      autoFollow: autoFollowCamera,
    });
  }, [cameraSensitivity, autoFollowCamera]);

  // Optionally jump straight into Quiz Blitz when launched via "Kuis Arena Lengkap"
  useEffect(() => {
    if (!openQuizOnStart) return;
    const t = window.setTimeout(() => {
      openNextPendingQuiz();
    }, 350);
    return () => clearTimeout(t);
  }, [openQuizOnStart, openNextPendingQuiz]);

  // Sync unlocked zones & completed zone markers into Three.js engine
  useEffect(() => {
    const completedZoneIds = questions
      .filter((q) => progress.completedQuests.includes(q.id))
      .map((q) => q.zoneId || 'sekolah');
    engineRef.current?.setUnlockedZones(progress.unlockedZones, completedZoneIds);
  }, [progress.unlockedZones, progress.completedQuests, questions]);

  // Pause & State Sync (Three.js physics + Adaptive Music via React Context)
  useEffect(() => {
    const isFrozen = activeModal !== 'none';
    engineRef.current?.setPaused(
      activeModal === 'pause' ||
        activeModal === 'defeat' ||
        activeModal === 'victory' ||
        activeModal === 'quest' ||
        activeModal === 'settings'
    );
    setPaused(activeModal === 'pause' || activeModal === 'defeat');

    if (activeModal === 'victory' || activeModal === 'defeat') {
      document.body.dataset.state = 'gameover';
    } else if (activeModal === 'pause') {
      document.body.dataset.state = 'paused';
    } else {
      document.body.dataset.state = isFrozen ? 'playing' : 'playing';
    }
  }, [activeModal, setPaused]);

  // Adaptive Suspense Music Intensity Controller
  const musicIntensity = useMemo(
    () =>
      computeMusicIntensity({
        activeZone,
        nearHazard,
        secondsLeft,
        inBossEncounter: activeModal === 'quest' && activeZone === 'arena',
        shieldHp,
      }),
    [activeZone, nearHazard, secondsLeft, activeModal, shieldHp]
  );

  useEffect(() => {
    setIntensity(musicIntensity);
  }, [musicIntensity, setIntensity]);

  // Auto-hide toast
  useEffect(() => {
    if (!toastMsg) return;
    const t = window.setTimeout(() => setToastMsg(null), 3500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // Session Countdown Timer
  useEffect(() => {
    if (activeModal === 'victory' || activeModal === 'pause' || activeModal === 'defeat' || activeModal === 'settings') return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setDefeatReason('timeout');
          setActiveModal('defeat');
          playSfx('defeat');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [activeModal, playSfx]);

  // Per-Question Speed Challenge Countdown (25s)
  useEffect(() => {
    if (activeModal !== 'quest' || gradeFeedback) return;
    const id = window.setInterval(() => {
      setQuestTimer((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [activeModal, gradeFeedback]);

  // Keyboard shortcuts [M] Mute, [Esc]/[P] Pause
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'KeyM') {
        toggleMute();
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        setActiveModal((prev) =>
          prev === 'none'
            ? 'pause'
            : prev === 'pause' || prev === 'settings'
            ? 'none'
            : prev
        );
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleMute]);

  // Real-time Dual-Transport Multiplayer Connection (WebSocket + HTTP Room Sync + Firestore mirror)
  useEffect(() => {
    const leaveRoomEverywhere = () => {
      fetch(
        `/api/sessions/${encodeURIComponent(session.joinCode)}/players/${encodeURIComponent(studentId)}`,
        { method: 'DELETE', keepalive: true }
      ).catch(() => undefined);
      if (auth.currentUser?.uid === studentId) {
        void syncPlayerStateToFirestore({
          sessionId: session.id,
          studentId,
          displayName: studentName,
          avatarColor: currentAvatarColorRef.current,
          ...latestLocalStateRef.current,
          isOnline: false,
        });
      }
    };

    if (soloMode) {
      wsRef.current?.close();
      wsRef.current = null;
      wsPlayersRef.current.clear();
      httpPlayersRef.current.clear();
      fsPlayersRef.current.clear();
      setWsConnected(false);
      setHttpSyncReady(false);
      setOnlinePlayers([]);
      engineRef.current?.syncRemotePlayers([], studentId);
      leaveRoomEverywhere();
      return;
    }

    let cancelled = false;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws: WebSocket | null = null;

    try {
      ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        setWsConnected(true);
        ws?.send(
          JSON.stringify({
            type: 'join_room',
            sessionId: session.id,
            studentId,
            displayName: studentName,
            role: 'siswa',
            avatarColor: currentAvatarColorRef.current,
            skinId: currentSkinIdRef.current,
            ...latestLocalStateRef.current,
          })
        );
      };

      ws.onmessage = (evt) => {
        if (cancelled) return;
        try {
          const msg = JSON.parse(String(evt.data));
          if (msg.type === 'room_init') {
            const list = (msg.players || []) as PlayerAvatarState[];
            const nextMap = new Map<string, PlayerAvatarState>();
            for (const p of list) {
              nextMap.set(p.studentId, p);
            }
            wsPlayersRef.current = nextMap;
            rebuildAndSyncPlayers();
          } else if (msg.type === 'player_joined' || msg.type === 'player_moved') {
            const player = msg.player as PlayerAvatarState;
            wsPlayersRef.current.set(player.studentId, player);
            rebuildAndSyncPlayers();
          } else if (msg.type === 'player_left') {
            const leftId = String(msg.studentId || '');
            wsPlayersRef.current.delete(leftId);
            httpPlayersRef.current.delete(leftId);
            fsPlayersRef.current.delete(leftId);
            rebuildAndSyncPlayers();
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
        if (!cancelled) setWsConnected(false);
      };
      ws.onerror = () => {
        if (!cancelled) setWsConnected(false);
      };
    } catch {
      setWsConnected(false);
    }

    // Immediate HTTP presence sync (ensures instant visibility & works on Vercel serverless)
    void pushHttpPresence();

    const syncInterval = window.setInterval(() => {
      if (cancelled || soloModeRef.current) return;
      const wsOpen = wsRef.current?.readyState === WebSocket.OPEN;
      const elapsed = Date.now() - lastHttpPostMsRef.current;
      // Poll faster (~800ms) when WS isn't open or player moved; keepalive (~3s) when WS is open
      if ((!wsOpen && elapsed >= 750) || (dirtyMoveRef.current && !wsOpen) || elapsed >= 3000) {
        dirtyMoveRef.current = false;
        void pushHttpPresence();
      }
    }, 500);

    // Optional Firestore realtime mirror for Google-authenticated students across serverless instances
    const unsubFs = subscribeSessionPlayerStates(session.id, (fsPlayers) => {
      if (cancelled) return;
      const nextFs = new Map<string, PlayerAvatarState>();
      for (const p of fsPlayers) {
        nextFs.set(p.studentId, p);
      }
      fsPlayersRef.current = nextFs;
      rebuildAndSyncPlayers();
    });

    if (auth.currentUser?.uid === studentId) {
      lastFsPostMsRef.current = Date.now();
      void syncPlayerStateToFirestore({
        sessionId: session.id,
        studentId,
        displayName: studentName,
        avatarColor: currentAvatarColorRef.current,
        ...latestLocalStateRef.current,
        isOnline: true,
      });
    }

    const handlePageExit = () => {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          `/api/sessions/${encodeURIComponent(session.joinCode)}/players/leave`,
          new Blob([JSON.stringify({ studentId })], { type: 'application/json' })
        );
      }
    };
    window.addEventListener('beforeunload', handlePageExit);

    return () => {
      cancelled = true;
      window.clearInterval(syncInterval);
      window.removeEventListener('beforeunload', handlePageExit);
      unsubFs();
      ws?.close();
      wsRef.current = null;
      leaveRoomEverywhere();
    };
  }, [session.id, session.joinCode, studentId, studentName, soloMode, pushHttpPresence, rebuildAndSyncPlayers]);

  const xpStats = useMemo(
    () => calculateXpProgressInLevel(progress.xpEarned + bonusXp),
    [progress.xpEarned, bonusXp]
  );

  const currentZoneInfo = useMemo(
    () => WORLD_ZONES.find((z) => z.id === activeZone) || WORLD_ZONES[0],
    [activeZone]
  );

  const streakMultiplier = useMemo(() => calculateStreakMultiplier(streak), [streak]);

  const formatClock = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleRecoverAndContinue = () => {
    setShieldHp(3);
    if (secondsLeft <= 0) {
      setSecondsLeft(120);
    }
    engineRef.current?.respawnAtPlaza();
    setActiveModal('none');
    setToastMsg('Perisai Energi dipulihkan! Hindari Drone & Laser dengan [Shift/Q] Dash.');
  };

  const handleSubmitAnswer = useCallback(async () => {
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

      const speedReward = calculateQuestSpeedBonus(questTimer, data.isCorrect);
      if (speedReward.bonusXp > 0) {
        setBonusXp((x) => x + speedReward.bonusXp);
      }

      if (data.isCorrect) {
        const nextStreak = streak + 1;
        setStreak(nextStreak);
        if (nextStreak % 2 === 0) {
          setLifelines((prev) => ({
            ...prev,
            freeze_time: Math.min(3, prev.freeze_time + 1),
          }));
        }
        if (nextStreak >= 2) {
          playSfx('combo', nextStreak);
        } else {
          playSfx('correct');
        }
      } else {
        playSfx('wrong');
        setStreak(0);
      }

      setProgress(data.progress);
      if (Array.isArray(data.leaderboard)) {
        setLeaderboard(data.leaderboard);
      }
      setAnswerHistory((prev) => [
        ...prev.filter((h) => h.questionId !== activeQuestion.id),
        {
          questionId: activeQuestion.id,
          prompt: activeQuestion.prompt,
          isCorrect: Boolean(data.isCorrect),
          pointsEarned: Number(data.pointsEarned || 0),
        },
      ]);
      setGradeFeedback({
        isCorrect: data.isCorrect,
        pointsEarned: data.pointsEarned,
        xpEarned: data.xpEarned,
        speedLabel: speedReward.label,
        speedBonusXp: speedReward.bonusXp,
        explanation: data.explanation || '',
        correctIndex: data.correctIndex,
        newlyUnlockedBadges: data.newlyUnlockedBadges || [],
      });

      if (data.progress.status === 'completed') {
        playSfx('victory');
        setToastMsg('Selamat! Seluruh misi sesi telah diselesaikan!');
      }
    } catch {
      setAiError('Koneksi ke server penilaian gagal.');
    } finally {
      setSubmitting(false);
    }
  }, [activeQuestion, selectedOption, session.joinCode, studentId, studentName, streak, questTimer, playSfx]);

  const handleUseFiftyFifty = async () => {
    if (!activeQuestion || gradeFeedback || lifelines.fifty_fifty <= 0 || lifelineBusy) return;
    setLifelineBusy(true);
    setAiError(null);
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(session.joinCode)}/lifeline-5050`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: activeQuestion.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !Array.isArray(data.eliminatedIndices)) {
        setAiError(data?.error || 'Power-up 50:50 tidak dapat digunakan untuk soal ini.');
        return;
      }
      playSfx('uiClick');
      setEliminatedOptions(data.eliminatedIndices);
      if (selectedOption !== null && data.eliminatedIndices.includes(selectedOption)) {
        setSelectedOption(null);
      }
      setLifelines((prev) => ({ ...prev, fifty_fifty: Math.max(0, prev.fifty_fifty - 1) }));
    } catch {
      setAiError('Gagal menghubungi server untuk 50:50.');
    } finally {
      setLifelineBusy(false);
    }
  };

  const handleUseFreezeTime = () => {
    if (gradeFeedback || lifelines.freeze_time <= 0) return;
    playSfx('unlock');
    setQuestTimer((t) => Math.min(45, t + 12));
    setTimeFrozen(true);
    setLifelines((prev) => ({ ...prev, freeze_time: Math.max(0, prev.freeze_time - 1) }));
  };

  const handleUseShieldBoost = () => {
    if (lifelines.shield_boost <= 0) return;
    playSfx('unlock');
    setShieldHp((hp) => Math.min(3, hp + 1));
    setLifelines((prev) => ({ ...prev, shield_boost: Math.max(0, prev.shield_boost - 1) }));
    setToastMsg('Perisai Energi dipulihkan +1!');
  };

  // Quiz Keyboard Shortcuts: 1-5 / A-E select option, Enter submit / advance
  useEffect(() => {
    if (activeModal !== 'quest' || !activeQuestion) return;
    const onQuizKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (!gradeFeedback) {
        const keyMap: Record<string, number> = {
          Digit1: 0,
          Digit2: 1,
          Digit3: 2,
          Digit4: 3,
          Digit5: 4,
          KeyA: 0,
          KeyB: 1,
          KeyC: 2,
          KeyD: 3,
          KeyE: 4,
        };
        const idx = keyMap[e.code];
        if (
          typeof idx === 'number' &&
          idx < activeQuestion.options.length &&
          !eliminatedOptions.includes(idx)
        ) {
          setSelectedOption(idx);
        } else if (e.code === 'Enter' && selectedOption !== null && !submitting) {
          e.preventDefault();
          void handleSubmitAnswer();
        }
      } else if (e.code === 'Enter') {
        e.preventDefault();
        if (progress.status === 'completed') {
          setActiveModal('victory');
        } else {
          openNextPendingQuiz();
        }
      }
    };
    window.addEventListener('keydown', onQuizKey);
    return () => window.removeEventListener('keydown', onQuizKey);
  }, [
    activeModal,
    activeQuestion,
    gradeFeedback,
    eliminatedOptions,
    selectedOption,
    submitting,
    progress.status,
    handleSubmitAnswer,
    openNextPendingQuiz,
  ]);

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

  const dangerLabel =
    musicIntensity === 'boss'
      ? 'Zona Boss / Kritis'
      : nearHazard
      ? 'Waspada Drone / Laser'
      : musicIntensity === 'tense'
      ? 'Zona Tantangan'
      : 'Aman';

  const feverStatus = useMemo(() => getQuizFeverStatus(streak), [streak]);
  const touchScaleVal = useMemo(
    () => getTouchControlScaleValue(touchSize, deviceProfile),
    [touchSize, deviceProfile]
  );
  const currentArena = getArenaTheme(currentArenaId);
  const currentSkin = getCharacterSkin(currentSkinId);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-sky-200 select-none touch-none overscroll-none">
      {/* Isolated 3D Canvas Container (no React HUD children inside) */}
      <div ref={canvasMountRef} data-testid="world-3d-canvas" className="absolute inset-0 w-full h-full touch-none" />

      {/* Pointer Pass-Through Perimeter HUD (Zero backdrop-blur over WebGL) */}
      <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-2.5 sm:p-4">
        {/* Top Perimeter Clusters */}
        <div className="flex items-start justify-between gap-2 sm:gap-4">
          {/* Top-Left Player, Energy Shields, Dash Stamina & Zone Readout */}
          <div className="pointer-events-auto rounded-2xl bg-slate-900/90 text-white px-3 py-2 sm:px-4 sm:py-3 border border-slate-700/90 shadow-lg max-w-[192px] sm:max-w-xs shrink-0">
            <div className="flex items-center justify-between gap-2 sm:gap-3">
              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                <div
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center font-bold text-xs sm:text-sm text-white shrink-0"
                  style={{ backgroundColor: currentAvatarColor }}
                >
                  Lv.{xpStats.level}
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-bold truncate">{studentName}</p>
                  <p className="text-[11px] sm:text-xs text-sky-300 truncate">
                    {currentZoneInfo.name} · {currentArena.name}
                  </p>
                </div>
              </div>

              {/* 3 Energy Shield Sockets */}
              <div className="flex items-center gap-0.5 sm:gap-1 shrink-0" aria-label={`Perisai Energi ${shieldHp} dari 3`}>
                {[0, 1, 2].map((idx) => (
                  <ShieldSocketSvg key={idx} active={idx < shieldHp} />
                ))}
              </div>
            </div>

            {/* XP & Dash Stamina Bars */}
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:gap-2">
              <div>
                <div className="flex justify-between text-[10px] font-mono text-amber-300 mb-0.5">
                  <span>XP</span>
                  <span>{xpStats.percent}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-amber-400 transition-all" style={{ width: `${xpStats.percent}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] font-mono text-cyan-300 mb-0.5">
                  <span>DASH</span>
                  <span>{dashStamina}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-cyan-400 transition-all" style={{ width: `${dashStamina}%` }} />
                </div>
              </div>
            </div>

            <div className="mt-1.5 sm:mt-2 flex items-center justify-between gap-1.5 text-[11px] sm:text-xs font-mono tabular-nums text-slate-200">
              <span>Skor: {progress.score}</span>
              <span>Misi: {progress.completedQuests.length}/{questions.length}</span>
              <span className="hidden sm:inline">Kristal: {crystalsCollected}</span>
            </div>

            <div className="mt-1 hidden sm:flex items-center justify-between gap-2 text-[11px] font-semibold">
              <span
                className={
                  musicIntensity === 'boss'
                    ? 'text-rose-400'
                    : nearHazard
                    ? 'text-amber-300'
                    : 'text-emerald-400'
                }
              >
                {dangerLabel}
              </span>
              {streak >= 1 && (
                <span className="inline-flex items-center gap-1 text-amber-300 font-mono">
                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                  Combo {streak}x ({streakMultiplier}x)
                </span>
              )}
            </div>
          </div>

          {/* Top-Center Live Compass Radar (Compact & Non-Blocking) */}
          {radarBlips.length > 0 && (
            <div className="pointer-events-auto hidden md:flex items-center gap-3 rounded-xl bg-slate-900/90 text-white px-3.5 py-2 border border-slate-700/80 text-xs shadow">
              {radarBlips.map((blip) => (
                <div key={`${blip.type}-${blip.zoneId}`} className="flex items-center gap-1.5">
                  <Navigation
                    className={`w-3.5 h-3.5 ${
                      blip.type === 'crystal' ? 'text-amber-400' : 'text-sky-400'
                    }`}
                    style={{ transform: `rotate(${Math.round((blip.angleRad * 180) / Math.PI)}deg)` }}
                  />
                  <span className="font-semibold">{blip.label}</span>
                  <span className="font-mono text-[11px] text-slate-300">{blip.distanceMeters}m</span>
                </div>
              ))}
            </div>
          )}

          {/* Top-Right Compact Utility Controls */}
          <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            <div
              className={`rounded-xl px-2.5 py-2 sm:px-3.5 border text-[11px] sm:text-xs font-mono tabular-nums flex items-center gap-1.5 sm:gap-3 min-h-[40px] ${
                secondsLeft <= 60
                  ? 'bg-rose-950/95 text-rose-200 border-rose-500'
                  : 'bg-slate-900/92 text-white border-slate-700/80'
              }`}
            >
              <span className="hidden sm:inline">{session.joinCode}</span>
              <span className="hidden sm:inline" aria-hidden="true">·</span>
              <span>{formatClock(secondsLeft)}</span>
            </div>

            <button
              type="button"
              onClick={openNextPendingQuiz}
              aria-label="Buka Kuis Arena"
              data-testid="hud-quiz-blitz-btn"
              className="rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 px-2.5 sm:px-3 py-2 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 min-w-[40px] min-h-[40px]"
            >
              <Zap className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">Kuis</span>
            </button>

            <button
              type="button"
              data-testid="hud-mode-toggle-btn"
              onClick={() => handleSetSoloMode(!soloMode)}
              title="Ubah mode Multiplayer / Individual"
              aria-label={
                soloMode
                  ? 'Mode Individual — Klik untuk ubah ke Multiplayer'
                  : 'Mode Multiplayer — Klik untuk ubah ke Individual'
              }
              className={`inline-flex rounded-xl px-2.5 sm:px-3 py-2 border text-xs font-bold items-center gap-1.5 min-h-[40px] transition-colors ${
                soloMode
                  ? 'bg-amber-950/90 hover:bg-amber-900 text-amber-200 border-amber-500/70'
                  : 'bg-emerald-950/90 hover:bg-emerald-900 text-emerald-100 border-emerald-500/70'
              }`}
            >
              {soloMode ? (
                <>
                  <User className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="hidden md:inline">Individual</span>
                  <span className="md:hidden">Solo</span>
                </>
              ) : (
                <>
                  <Users className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="hidden md:inline">
                    Multiplayer · {Math.max(1, onlinePlayers.length)}
                  </span>
                  <span className="md:hidden">Multi · {Math.max(1, onlinePlayers.length)}</span>
                  <span
                    aria-hidden="true"
                    className={`w-1.5 h-1.5 rounded-full ${
                      wsConnected || httpSyncReady ? 'bg-emerald-400' : 'bg-amber-300 animate-pulse'
                    }`}
                  />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveModal('map')}
              aria-label="Buka Peta Zona"
              className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-2.5 sm:px-3 py-2 text-xs font-semibold inline-flex items-center justify-center gap-1.5 min-w-[40px] min-h-[40px]"
            >
              <MapIcon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">Peta Misi</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveModal('leaderboard')}
              aria-label="Buka Leaderboard"
              className="rounded-xl bg-slate-900/92 hover:bg-slate-800 text-white px-2.5 sm:px-3 py-2 border border-slate-700/80 text-xs font-semibold inline-flex items-center justify-center gap-1.5 min-w-[40px] min-h-[40px]"
            >
              <Trophy className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Peringkat</span>
            </button>

            <button
              type="button"
              onClick={toggleTouchPad}
              aria-label={showTouchPad ? 'Matikan Kontrol Sentuh HP' : 'Aktifkan Kontrol Sentuh HP'}
              title="Kontrol Sentuh Layar HP & Tablet"
              className={`rounded-xl px-2.5 py-2 border text-xs font-semibold inline-flex items-center justify-center gap-1.5 min-w-[40px] min-h-[40px] ${
                showTouchPad
                  ? 'bg-emerald-700/95 border-emerald-400 text-white'
                  : 'bg-slate-900/92 hover:bg-slate-800 border-slate-700/80 text-white'
              }`}
            >
              <Gamepad2 className="w-4 h-4" />
              <span className="hidden xl:inline">{showTouchPad ? 'Sentuh Aktif' : 'Mode Sentuh'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                ensureAudioPlaying();
                toggleMute();
              }}
              aria-label={muted ? 'Nyalakan Musik & Suara' : 'Matikan Musik & Suara'}
              className="hidden sm:inline-flex rounded-xl bg-slate-900/92 hover:bg-slate-800 text-white px-3 py-2 border border-slate-700/80 text-xs font-semibold items-center gap-1.5 min-h-[40px]"
            >
              {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
              <span className="hidden md:inline">{muted ? 'Bisu' : 'Musik'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                ensureAudioPlaying();
                playSfx('uiClick');
                setSettingsTab('audio');
                setActiveModal('settings');
              }}
              aria-label="Pengaturan Game, Audio & Skin"
              className="rounded-xl bg-slate-900/92 hover:bg-slate-800 text-white px-2.5 sm:px-3 py-2 border border-slate-700/80 text-xs font-semibold inline-flex items-center justify-center gap-1.5 min-w-[40px] min-h-[40px]"
            >
              <Settings className="w-4 h-4 text-sky-400" />
              <span className="hidden lg:inline">Pengaturan</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveModal('pause')}
              aria-label="Jeda Permainan"
              className="rounded-xl bg-slate-900/92 hover:bg-slate-800 text-white p-2 border border-slate-700/80 inline-flex items-center justify-center min-w-[40px] min-h-[40px]"
            >
              <Pause className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center Notification Toast & Non-Blocking Portrait Tip */}
        <div className="flex flex-col items-center gap-2">
          {isPortraitPhone && !portraitDismissed && activeModal === 'none' && (
            <div className="pointer-events-auto rounded-xl bg-slate-900/95 text-sky-200 px-3.5 py-2 border border-sky-500/40 text-xs font-medium flex items-center gap-2.5 shadow">
              <Smartphone className="w-4 h-4 text-sky-400 shrink-0" />
              <span>Tip HP: Putar layar mendatar (landscape) agar kontrol lebih luas.</span>
              <button
                type="button"
                aria-label="Tutup tip orientasi"
                onClick={() => setPortraitDismissed(true)}
                className="p-1 rounded hover:bg-slate-800 text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
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
            <div className="rounded-xl bg-slate-900/95 text-amber-300 px-4 py-2 border border-amber-500/50 text-xs sm:text-sm font-semibold shadow-md text-center max-w-md">
              {toastMsg}
            </div>
          )}
        </div>

        {/* Bottom Perimeter Controls: Smartphone Analog Touch Ergonomics vs Desktop Hints */}
        <div className="flex flex-col gap-2 pb-1">
          {nearNpcZone && !showTouchPad && (
            <div className="pointer-events-auto flex justify-center sm:hidden">
              <button
                type="button"
                onClick={() => openQuestForZone(nearNpcZone)}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-lg whitespace-nowrap"
              >
                Bicara dengan {nearNpcZone.npcName}
              </button>
            </div>
          )}

          <div className="flex items-end justify-between gap-2 sm:gap-4">
            {showTouchPad ? (
              <VirtualJoystick
                disabled={activeModal !== 'none'}
                scaleMultiplier={touchScaleVal}
                onMove={(dx, dy, isSprinting) => {
                  engineRef.current?.setVirtualInput(dx, dy, isSprinting);
                }}
              />
            ) : (
              <button
                type="button"
                onClick={toggleTouchPad}
                className="pointer-events-auto rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 px-3.5 py-2.5 text-xs font-semibold border border-slate-700 inline-flex items-center gap-1.5 min-h-[44px]"
              >
                <Gamepad2 className="w-4 h-4 text-emerald-400" />
                Kontrol Sentuh
              </button>
            )}

            <div className="pointer-events-auto hidden md:flex flex-col items-center gap-2 min-w-0">
              {nearNpcZone && (
                <button
                  type="button"
                  onClick={() => openQuestForZone(nearNpcZone)}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow-lg whitespace-nowrap"
                >
                  {showTouchPad ? `Bicara: ${nearNpcZone.npcName}` : `[E] Bicara dengan ${nearNpcZone.npcName}`}
                </button>
              )}
              <div className="rounded-xl bg-slate-900/90 text-slate-200 px-4 py-1.5 text-xs border border-slate-700/80 whitespace-nowrap">
                {showTouchPad
                  ? 'Analog Kiri Gerak · Dorong ke Tepi untuk Lari · Geser Layar Putar Kamera · Cubit Zoom'
                  : 'WASD Gerak · Shift/Q Dash · Spasi Lompat · Seret Kamera · E Interaksi · Gamepad Didukung'}
              </div>
            </div>

            {showTouchPad ? (
              <MobileActionPad
                dashStamina={dashStamina}
                nearNpcZone={nearNpcZone}
                scaleMultiplier={touchScaleVal}
                onJumpStart={() => {
                  ensureAudioPlaying();
                  engineRef.current?.triggerJump();
                }}
                onJumpEnd={() => engineRef.current?.releaseJump()}
                onDash={() => {
                  ensureAudioPlaying();
                  engineRef.current?.triggerDash();
                }}
                onInteractOrMission={() => {
                  if (nearNpcZone) {
                    openQuestForZone(nearNpcZone);
                  } else {
                    openNextPendingQuiz();
                  }
                }}
                onResetCamera={() => engineRef.current?.resetCameraBehindPlayer()}
              />
            ) : (
              <div className="pointer-events-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openQuestForZone(currentZoneInfo)}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold min-h-[44px]"
                >
                  Buka Misi Zona
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==================== MODAL: NPC QUEST & COMPLETE QUIZ BLITZ ==================== */}
      {activeModal === 'quest' && activeQuestion && (
        <div className="fixed inset-0 z-30 bg-slate-950/80 flex items-center justify-center p-3 sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="quest-modal-title"
            className="max-w-2xl w-full max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 p-5 sm:p-7 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-blue-600 dark:text-sky-400">
                  {currentZoneInfo.id === 'arena' ? 'BOSS BATTLE · ' : ''}
                  {session.gameMode} · {currentZoneInfo.npcName} · Bobot {activeQuestion.points} Poin
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h2 id="quest-modal-title" className="text-lg sm:text-xl font-bold">
                    Kuis {activeQuestion.orderIndex + 1} dari {questions.length}
                  </h2>
                  {feverStatus.isFever && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-300 text-[11px] font-extrabold font-mono">
                      {feverStatus.label} · {feverStatus.xpMultiplier}x
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!gradeFeedback && (
                  <div
                    className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold inline-flex items-center gap-1.5 ${
                      timeFrozen
                        ? 'bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300'
                        : questTimer <= 7
                        ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                        : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                    }`}
                  >
                    <Timer className="w-3.5 h-3.5" />
                    {timeFrozen ? `Beku ${questTimer}d` : `${questTimer}d`}
                  </div>
                )}
                <button
                  type="button"
                  aria-label="Tutup dialog misi"
                  onClick={() => setActiveModal('none')}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Question Progress Dots */}
            <div className="mt-3 flex items-center gap-1.5" aria-label="Progres Soal Sesi">
              {questions.map((q) => {
                const isSolved = progress.completedQuests.includes(q.id);
                const isCurrent = q.id === activeQuestion.id;
                return (
                  <div
                    key={q.id}
                    className={`h-2 flex-1 rounded-full transition-colors ${
                      isCurrent
                        ? 'bg-blue-600 dark:bg-sky-400'
                        : isSolved
                        ? 'bg-emerald-500'
                        : 'bg-slate-200 dark:bg-slate-800'
                    }`}
                  />
                );
              })}
            </div>

            {!gradeFeedback && (
              <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    timeFrozen ? 'bg-cyan-500' : questTimer <= 7 ? 'bg-rose-500' : 'bg-amber-500'
                  }`}
                  style={{ width: `${Math.min(100, (questTimer / 25) * 100)}%` }}
                />
              </div>
            )}

            {/* Power-Up Lifelines Bar */}
            {!gradeFeedback && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="lifeline-5050-btn"
                  disabled={lifelines.fifty_fifty <= 0 || lifelineBusy || eliminatedOptions.length > 0}
                  onClick={() => void handleUseFiftyFifty()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 text-xs font-bold disabled:opacity-45"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  50:50 ({lifelines.fifty_fifty})
                </button>
                <button
                  type="button"
                  data-testid="lifeline-freeze-btn"
                  disabled={lifelines.freeze_time <= 0}
                  onClick={handleUseFreezeTime}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-300 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 text-xs font-bold disabled:opacity-45"
                >
                  <Clock className="w-3.5 h-3.5" />
                  +12d Waktu ({lifelines.freeze_time})
                </button>
                <button
                  type="button"
                  data-testid="lifeline-shield-btn"
                  disabled={lifelines.shield_boost <= 0 || shieldHp >= 3}
                  onClick={handleUseShieldBoost}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold disabled:opacity-45"
                >
                  <Shield className="w-3.5 h-3.5" />
                  Perisai +1 ({lifelines.shield_boost})
                </button>
                <span className="ml-auto hidden sm:inline text-[11px] text-slate-400">
                  Shortcut: 1–{activeQuestion.options.length} pilih · Enter kirim
                </span>
              </div>
            )}

            <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4">
              <p className="text-base font-medium leading-relaxed">{activeQuestion.prompt}</p>
            </div>

            <div className="mt-4 space-y-2.5">
              {activeQuestion.options.map((opt, idx) => {
                const letter = String.fromCharCode(65 + idx);
                const isEliminated = eliminatedOptions.includes(idx);
                const isSelected = selectedOption === idx;
                const isRevealedCorrect = gradeFeedback?.correctIndex === idx;
                const isWrongChoice = gradeFeedback && !gradeFeedback.isCorrect && isSelected;

                let btnStyle =
                  'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800';
                if (isEliminated) {
                  btnStyle =
                    'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 text-slate-400 dark:text-slate-600 line-through opacity-45';
                } else if (isRevealedCorrect) {
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
                    disabled={Boolean(gradeFeedback) || submitting || isEliminated}
                    onClick={() => setSelectedOption(idx)}
                    className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium flex items-center gap-3 transition-colors min-h-[48px] ${btnStyle}`}
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
                    ? `Benar! +${gradeFeedback.pointsEarned} Poin · +${gradeFeedback.xpEarned} XP${
                        gradeFeedback.speedBonusXp
                          ? ` (${gradeFeedback.speedLabel} +${gradeFeedback.speedBonusXp} XP)`
                          : ''
                      }`
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
                  <div className="flex flex-wrap items-center gap-2">
                    {progress.status === 'completed' ? (
                      <button
                        type="button"
                        onClick={() => setActiveModal('victory')}
                        className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold"
                      >
                        Lihat Hasil & Ringkasan Kuis
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={openNextPendingQuiz}
                          className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-extrabold"
                        >
                          Soal Berikutnya
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveModal('none')}
                          className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold"
                        >
                          Lanjut Jelajahi Dunia
                        </button>
                      </>
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
        <div className="fixed inset-0 z-30 bg-slate-950/80 flex items-center justify-center p-4">
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
        <div className="fixed inset-0 z-30 bg-slate-950/80 flex items-center justify-center p-4">
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

      {/* ==================== MODAL: SETTINGS (AUDIO + HP/TABLET/DESKTOP CONTROLS + ARENA/SKIN) ==================== */}
      {activeModal === 'settings' && (
        <div className="fixed inset-0 z-30 bg-slate-950/80 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Pengaturan Game, Audio, Kontrol Perangkat & Arena"
            className="max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 p-6 shadow-xl"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200 dark:border-slate-800 mb-4">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'audio', label: 'Audio & Musik' },
                  { id: 'controls', label: 'Mode & Kontrol' },
                  { id: 'appearance', label: 'Arena & Skin 3D' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSettingsTab(t.id as 'audio' | 'controls' | 'appearance')}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                      settingsTab === t.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-label="Tutup pengaturan"
                onClick={() => setActiveModal('none')}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {settingsTab === 'audio' && (
              <AudioSettingsPanel onClose={() => setActiveModal('none')} />
            )}

            {settingsTab === 'controls' && (
              <div className="space-y-5">
                {/* Mode Permainan: Multiplayer vs Individual */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold">Mode Permainan Arena</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {soloMode
                          ? 'Saat ini mode Individual (Solo): hanya kamu di arena.'
                          : `Saat ini mode Multiplayer (${Math.max(1, onlinePlayers.length)} pemain aktif di sesi ${session.joinCode}).`}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      data-testid="settings-mode-multiplayer"
                      onClick={() => handleSetSoloMode(false)}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors ${
                        !soloMode
                          ? 'border-emerald-500 bg-emerald-600 text-white'
                          : 'border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                      Multiplayer
                    </button>
                    <button
                      type="button"
                      data-testid="settings-mode-individual"
                      onClick={() => handleSetSoloMode(true)}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors ${
                        soloMode
                          ? 'border-amber-500 bg-amber-500 text-slate-950'
                          : 'border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <User className="w-4 h-4" />
                      Individual (Solo)
                    </button>
                  </div>

                  {!soloMode && (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                        Pemain di Arena Saat Ini ({Math.max(1, onlinePlayers.length)})
                      </p>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                        {onlinePlayers.length === 0 ? (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {studentName} (Anda)
                          </span>
                        ) : (
                          onlinePlayers.map((p) => (
                            <span
                              key={p.studentId}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium"
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: p.avatarColor || '#3B82F6' }}
                              />
                              <span>{p.displayName}</span>
                              {p.studentId === studentId && (
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                                  (Anda)
                                </span>
                              )}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {deviceProfile === 'phone' ? (
                      <Smartphone className="w-5 h-5 text-emerald-500" />
                    ) : deviceProfile === 'tablet' ? (
                      <Tablet className="w-5 h-5 text-sky-500" />
                    ) : (
                      <Monitor className="w-5 h-5 text-blue-600" />
                    )}
                    <div>
                      <p className="text-sm font-bold capitalize">Mode Perangkat: {deviceProfile}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Mendukung Sentuh Layar, Keyboard + Mouse, dan Controller Gamepad.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={toggleTouchPad}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold ${
                      showTouchPad
                        ? 'bg-emerald-600 text-white'
                        : 'border border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {showTouchPad ? 'Sentuh Aktif' : 'Sentuh Nonaktif'}
                  </button>
                </div>

                <div>
                  <span className="block text-xs font-bold mb-2">Ukuran Tombol Sentuh (HP & Tablet)</span>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'compact', label: 'Kecil' },
                      { id: 'normal', label: 'Normal' },
                      { id: 'large', label: 'Besar' },
                    ].map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setTouchSize(s.id as TouchControlSize)}
                        className={`py-2 rounded-xl border text-xs font-bold ${
                          touchSize === s.id
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold mb-1.5">
                    <label htmlFor="cam-sens-range">Sensitivitas Putar Kamera</label>
                    <span className="font-mono">{cameraSensitivity.toFixed(1)}x</span>
                  </div>
                  <input
                    id="cam-sens-range"
                    type="range"
                    min={0.5}
                    max={1.8}
                    step={0.1}
                    value={cameraSensitivity}
                    onChange={(e) => setCameraSensitivity(Number(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                </div>

                <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 text-xs font-semibold cursor-pointer">
                  <span>Kamera Otomatis Mengikuti Arah Jalan (Direkomendasikan di HP/Tablet)</span>
                  <input
                    type="checkbox"
                    checked={autoFollowCamera}
                    onChange={(e) => setAutoFollowCamera(e.target.checked)}
                  />
                </label>
              </div>
            )}

            {settingsTab === 'appearance' && (
              <div className="space-y-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Arena aktif: <strong className="text-slate-900 dark:text-white">{currentArena.name}</strong> · Karakter:{' '}
                  <strong className="text-slate-900 dark:text-white">{currentSkin.name}</strong>
                </p>
                <ArenaSkinSelector
                  compact
                  selectedArenaId={currentArenaId}
                  onSelectArena={(id) => {
                    setCurrentArenaId(id);
                    setToastMsg(`Arena 3D diubah ke ${getArenaTheme(id).name}!`);
                  }}
                  selectedSkinId={currentSkinId}
                  onSelectSkin={(id) => {
                    setCurrentSkinId(id);
                    setToastMsg(`Skin karakter diubah ke ${getCharacterSkin(id).name}!`);
                  }}
                  avatarColor={currentAvatarColor}
                  onSelectColor={setCurrentAvatarColor}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== MODAL: PAUSE / VICTORY / DEFEAT ==================== */}
      {(activeModal === 'pause' || activeModal === 'victory' || activeModal === 'defeat') && (
        <div className="fixed inset-0 z-30 bg-slate-950/85 flex items-center justify-center p-4">
          <div className="max-w-md w-full max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 p-6 sm:p-7 text-center">
            {activeModal === 'victory' ? (
              <Award className="w-12 h-12 text-amber-500 mx-auto" />
            ) : activeModal === 'defeat' ? (
              <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
            ) : (
              <Users className="w-10 h-10 text-blue-600 mx-auto" />
            )}
            <h2 className="mt-3 text-2xl font-extrabold">
              {activeModal === 'victory'
                ? 'Misi Dunia Selesai!'
                : activeModal === 'defeat'
                ? defeatReason === 'timeout'
                  ? 'Waktu Sesi Habis!'
                  : 'Perisai Energi Hancur!'
                : 'Permainan Dijeda'}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {activeModal === 'defeat'
                ? 'Progres soalmu tetap aman. Pulihkan perisai dan gunakan Dash [Shift/Q] atau Lompat [Spasi] untuk menghindari Drone & Laser!'
                : session.title}
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
                <p className="text-xs text-slate-500 dark:text-slate-400">Kristal</p>
                <p className="text-lg font-bold font-mono">{crystalsCollected}</p>
              </div>
            </div>

            {activeModal === 'victory' && answerHistory.length > 0 && (
              <div className="mt-5 text-left space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Ringkasan Jawaban Kuis
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1.5">
                  {answerHistory.map((item, i) => (
                    <div
                      key={item.questionId}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs flex items-center justify-between gap-2"
                    >
                      <span className="inline-flex items-center gap-1.5 truncate">
                        {item.isCorrect ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                        )}
                        <span className="truncate">
                          #{i + 1} {item.prompt}
                        </span>
                      </span>
                      <span className="font-mono font-bold shrink-0">+{item.pointsEarned}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-2.5">
              {activeModal === 'defeat' ? (
                <button
                  type="button"
                  data-start="true"
                  onClick={handleRecoverAndContinue}
                  className="w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-sm inline-flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Pulihkan Perisai & Bangkit
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveModal('none')}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm"
                >
                  {activeModal === 'victory' ? 'Kembali Jelajahi Dunia' : 'Lanjutkan Bermain'}
                </button>
              )}
              {activeModal === 'pause' && (
                <>
                  <button
                    type="button"
                    data-testid="pause-mode-toggle-btn"
                    onClick={() => handleSetSoloMode(!soloMode)}
                    className="w-full py-3 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold text-sm inline-flex items-center justify-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {soloMode ? (
                      <User className="w-4 h-4 text-amber-500" />
                    ) : (
                      <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    )}
                    Mode Permainan: {soloMode ? 'Individual (Solo)' : `Multiplayer (${Math.max(1, onlinePlayers.length)})`}
                  </button>
                  <button
                    type="button"
                    onClick={toggleTouchPad}
                    className="w-full py-3 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold text-sm inline-flex items-center justify-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Gamepad2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Kontrol Sentuh HP/Tablet: {showTouchPad ? 'Aktif' : 'Nonaktif'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsTab('appearance');
                      setActiveModal('settings');
                    }}
                    className="w-full py-3 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold text-sm inline-flex items-center justify-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Ganti Arena 3D & Skin Karakter
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsTab('audio');
                      setActiveModal('settings');
                    }}
                    className="w-full py-3 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold text-sm inline-flex items-center justify-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Settings className="w-4 h-4 text-blue-600 dark:text-sky-400" />
                    Pengaturan Mode, Audio & Kontrol
                  </button>
                </>
              )}
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
