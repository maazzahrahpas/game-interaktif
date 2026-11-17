import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AUDIO_STORAGE_KEY,
  clampVolume,
  DEFAULT_AUDIO_PREFERENCES,
  sanitizeAudioPreferences,
  type SfxEventName,
  type StoredAudioPreferences,
} from '../game/audioConfig.ts';
import { audioSynth } from '../game/audioSynth.ts';
import type { MusicIntensity } from '../utils/gameRules.ts';

export interface AudioContextValue extends StoredAudioPreferences {
  intensity: MusicIntensity;
  isMusicPlaying: boolean;
  isPaused: boolean;
  setMasterVolume: (volume: number) => void;
  setMusicVolume: (volume: number) => void;
  setSfxVolume: (volume: number) => void;
  setMusicEnabled: (enabled: boolean) => void;
  setSfxEnabled: (enabled: boolean) => void;
  setMuted: (muted: boolean) => void;
  toggleMute: () => boolean;
  startMusic: (initialIntensity?: MusicIntensity) => void;
  stopMusic: () => void;
  setIntensity: (intensity: MusicIntensity) => void;
  setPaused: (paused: boolean) => void;
  playSfx: (event: SfxEventName, streak?: number) => void;
  resetAudioDefaults: () => void;
}

const AudioManagementContext = createContext<AudioContextValue | null>(null);

function loadStoredPreferences(): StoredAudioPreferences {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_AUDIO_PREFERENCES };
  }
  try {
    const raw = window.localStorage.getItem(AUDIO_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AUDIO_PREFERENCES };
    return sanitizeAudioPreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_AUDIO_PREFERENCES };
  }
}

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [prefs, setPrefs] = useState<StoredAudioPreferences>(loadStoredPreferences);
  const [intensity, setIntensityState] = useState<MusicIntensity>('explore');
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [isPaused, setIsPausedState] = useState(false);

  // Keep singleton Web Audio synthesizer synced with React state & persist to localStorage
  useEffect(() => {
    audioSynth.applyPreferences(prefs);
    try {
      window.localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore storage failures in restricted contexts
    }
  }, [prefs]);

  const setMasterVolume = useCallback((volume: number) => {
    const v = clampVolume(volume);
    setPrefs((prev) => ({
      ...prev,
      masterVolume: v,
      muted: v > 0 ? false : prev.muted,
    }));
  }, []);

  const setMusicVolume = useCallback((volume: number) => {
    const v = clampVolume(volume);
    setPrefs((prev) => ({
      ...prev,
      musicVolume: v,
      musicEnabled: v > 0 ? true : prev.musicEnabled,
    }));
  }, []);

  const setSfxVolume = useCallback((volume: number) => {
    const v = clampVolume(volume);
    setPrefs((prev) => ({
      ...prev,
      sfxVolume: v,
      sfxEnabled: v > 0 ? true : prev.sfxEnabled,
    }));
  }, []);

  const setMusicEnabled = useCallback((enabled: boolean) => {
    setPrefs((prev) => ({ ...prev, musicEnabled: enabled }));
  }, []);

  const setSfxEnabled = useCallback((enabled: boolean) => {
    setPrefs((prev) => ({ ...prev, sfxEnabled: enabled }));
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    setPrefs((prev) => ({ ...prev, muted }));
  }, []);

  const toggleMute = useCallback(() => {
    let nextMuted = false;
    setPrefs((prev) => {
      nextMuted = !prev.muted;
      return { ...prev, muted: nextMuted };
    });
    return nextMuted;
  }, []);

  const startMusic = useCallback((initialIntensity: MusicIntensity = 'explore') => {
    setIntensityState(initialIntensity);
    audioSynth.startMusic(initialIntensity);
    setIsMusicPlaying(true);
  }, []);

  const stopMusic = useCallback(() => {
    audioSynth.stopMusic();
    setIsMusicPlaying(false);
  }, []);

  const setIntensity = useCallback((nextIntensity: MusicIntensity) => {
    setIntensityState(nextIntensity);
    audioSynth.setMusicIntensity(nextIntensity);
  }, []);

  const setPaused = useCallback((paused: boolean) => {
    setIsPausedState(paused);
    audioSynth.setPaused(paused);
  }, []);

  const playSfx = useCallback((event: SfxEventName, streak = 1) => {
    audioSynth.playSfx(event, streak);
  }, []);

  const resetAudioDefaults = useCallback(() => {
    setPrefs({ ...DEFAULT_AUDIO_PREFERENCES });
  }, []);

  const value = useMemo<AudioContextValue>(
    () => ({
      ...prefs,
      intensity,
      isMusicPlaying,
      isPaused,
      setMasterVolume,
      setMusicVolume,
      setSfxVolume,
      setMusicEnabled,
      setSfxEnabled,
      setMuted,
      toggleMute,
      startMusic,
      stopMusic,
      setIntensity,
      setPaused,
      playSfx,
      resetAudioDefaults,
    }),
    [
      prefs,
      intensity,
      isMusicPlaying,
      isPaused,
      setMasterVolume,
      setMusicVolume,
      setSfxVolume,
      setMusicEnabled,
      setSfxEnabled,
      setMuted,
      toggleMute,
      startMusic,
      stopMusic,
      setIntensity,
      setPaused,
      playSfx,
      resetAudioDefaults,
    ]
  );

  return <AudioManagementContext.Provider value={value}>{children}</AudioManagementContext.Provider>;
};

export function useAudio(): AudioContextValue {
  const ctx = useContext(AudioManagementContext);
  if (!ctx) {
    throw new Error('useAudio harus dipanggil di dalam AudioProvider');
  }
  return ctx;
}
