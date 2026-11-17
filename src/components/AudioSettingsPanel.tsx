import React from 'react';
import { Music, RotateCcw, Sliders, Volume2, VolumeX, Zap } from 'lucide-react';
import { useAudio } from '../contexts/AudioContext.tsx';

interface AudioSettingsPanelProps {
  onClose?: () => void;
  compact?: boolean;
}

export const AudioSettingsPanel: React.FC<AudioSettingsPanelProps> = ({
  onClose,
  compact = false,
}) => {
  const {
    masterVolume,
    musicVolume,
    sfxVolume,
    musicEnabled,
    sfxEnabled,
    muted,
    intensity,
    setMasterVolume,
    setMusicVolume,
    setSfxVolume,
    setMusicEnabled,
    setSfxEnabled,
    setMuted,
    startMusic,
    playSfx,
    resetAudioDefaults,
  } = useAudio();

  const intensityLabel =
    intensity === 'boss'
      ? 'Boss / Kritis (148 BPM)'
      : intensity === 'tense'
      ? 'Waspada (134 BPM)'
      : 'Eksplorasi (118 BPM)';

  const handleTestSfx = () => {
    startMusic(intensity);
    playSfx('goldenPickup');
  };

  return (
    <div className={compact ? 'space-y-4 text-left' : 'space-y-5 text-left'}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Sliders className="w-5 h-5 text-blue-600 dark:text-sky-400" />
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Pengaturan Audio Dunia 3D
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Mode musik saat ini: {intensityLabel}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMuted(!muted)}
          aria-pressed={muted}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
            muted
              ? 'border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
              : 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          {muted ? 'Semua Dibisukan' : 'Audio Aktif'}
        </button>
      </div>

      {/* Master Volume */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5">
        <div className="flex items-center justify-between text-xs font-semibold mb-2">
          <label htmlFor="audio-master-volume" className="text-slate-700 dark:text-slate-200">
            Volume Utama
          </label>
          <span className="font-mono tabular-nums text-blue-600 dark:text-sky-400">
            {Math.round(masterVolume * 100)}%
          </span>
        </div>
        <input
          id="audio-master-volume"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(masterVolume * 100)}
          onChange={(e) => setMasterVolume(Number(e.target.value) / 100)}
          className="w-full accent-blue-600 cursor-pointer"
        />
      </div>

      {/* Background Suspense Music Volume + Toggle */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5">
        <div className="flex items-center justify-between gap-3 mb-2">
          <label
            htmlFor="audio-music-volume"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            <Music className="w-3.5 h-3.5 text-violet-500" />
            Musik Latar Menegangkan
          </label>
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-mono tabular-nums text-violet-600 dark:text-violet-400">
              {Math.round(musicVolume * 100)}%
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={musicEnabled}
              aria-label="Aktifkan atau matikan musik latar"
              onClick={() => setMusicEnabled(!musicEnabled)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                musicEnabled
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {musicEnabled ? 'Nyala' : 'Mati'}
            </button>
          </div>
        </div>
        <input
          id="audio-music-volume"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(musicVolume * 100)}
          onChange={(e) => setMusicVolume(Number(e.target.value) / 100)}
          className="w-full accent-violet-600 cursor-pointer"
        />
      </div>

      {/* Interactive SFX Volume + Toggle */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5">
        <div className="flex items-center justify-between gap-3 mb-2">
          <label
            htmlFor="audio-sfx-volume"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            Efek Suara Interaktif (Lompat, Dash, Kuis)
          </label>
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-mono tabular-nums text-amber-600 dark:text-amber-400">
              {Math.round(sfxVolume * 100)}%
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={sfxEnabled}
              aria-label="Aktifkan atau matikan efek suara"
              onClick={() => setSfxEnabled(!sfxEnabled)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                sfxEnabled
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {sfxEnabled ? 'Nyala' : 'Mati'}
            </button>
          </div>
        </div>
        <input
          id="audio-sfx-volume"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(sfxVolume * 100)}
          onChange={(e) => setSfxVolume(Number(e.target.value) / 100)}
          className="w-full accent-amber-500 cursor-pointer"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTestSfx}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors"
          >
            Uji Suara & Musik
          </button>
          <button
            type="button"
            onClick={resetAudioDefaults}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Default
          </button>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold"
          >
            Simpan & Tutup
          </button>
        )}
      </div>
    </div>
  );
};
