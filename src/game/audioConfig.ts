import type { MusicIntensity } from '../utils/gameRules.ts';

export interface StoredAudioPreferences {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  musicEnabled: boolean;
  sfxEnabled: boolean;
  muted: boolean;
}

export const AUDIO_STORAGE_KEY = 'eduverse-audio-settings';

export const DEFAULT_AUDIO_PREFERENCES: StoredAudioPreferences = {
  masterVolume: 0.85,
  musicVolume: 0.42,
  sfxVolume: 0.9,
  musicEnabled: true,
  sfxEnabled: true,
  muted: false,
};

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, Number(value.toFixed(2))));
}

export function computeEffectiveMusicGain(prefs: StoredAudioPreferences, paused: boolean): number {
  if (prefs.muted || paused || !prefs.musicEnabled) return 0;
  // Keep music comfortably balanced under SFX so cues cut through clearly
  return clampVolume(prefs.musicVolume) * 0.65;
}

export function computeEffectiveMasterGain(prefs: StoredAudioPreferences): number {
  if (prefs.muted) return 0;
  return clampVolume(prefs.masterVolume);
}

export function computeEffectiveSfxGain(prefs: StoredAudioPreferences): number {
  if (prefs.muted || !prefs.sfxEnabled) return 0;
  return clampVolume(prefs.sfxVolume);
}

export function sanitizeAudioPreferences(raw: unknown): StoredAudioPreferences {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_AUDIO_PREFERENCES };
  }
  const obj = raw as Record<string, unknown>;
  return {
    masterVolume:
      typeof obj.masterVolume === 'number'
        ? clampVolume(obj.masterVolume)
        : DEFAULT_AUDIO_PREFERENCES.masterVolume,
    musicVolume:
      typeof obj.musicVolume === 'number'
        ? clampVolume(obj.musicVolume)
        : DEFAULT_AUDIO_PREFERENCES.musicVolume,
    sfxVolume:
      typeof obj.sfxVolume === 'number'
        ? clampVolume(obj.sfxVolume)
        : DEFAULT_AUDIO_PREFERENCES.sfxVolume,
    musicEnabled:
      typeof obj.musicEnabled === 'boolean'
        ? obj.musicEnabled
        : DEFAULT_AUDIO_PREFERENCES.musicEnabled,
    sfxEnabled:
      typeof obj.sfxEnabled === 'boolean'
        ? obj.sfxEnabled
        : DEFAULT_AUDIO_PREFERENCES.sfxEnabled,
    muted: typeof obj.muted === 'boolean' ? obj.muted : DEFAULT_AUDIO_PREFERENCES.muted,
  };
}

export type SfxEventName =
  | 'jump'
  | 'dash'
  | 'jumpPad'
  | 'pickup'
  | 'goldenPickup'
  | 'warning'
  | 'hurt'
  | 'correct'
  | 'combo'
  | 'wrong'
  | 'unlock'
  | 'victory'
  | 'defeat'
  | 'uiClick';

export type { MusicIntensity };
