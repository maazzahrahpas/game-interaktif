import type { MusicIntensity } from '../utils/gameRules.ts';
import {
  clampVolume,
  computeEffectiveMasterGain,
  computeEffectiveMusicGain,
  computeEffectiveSfxGain,
  DEFAULT_AUDIO_PREFERENCES,
  type SfxEventName,
  type StoredAudioPreferences,
} from './audioConfig.ts';

// D minor / Phrygian suspense frequencies (Hz)
const BASS_EXPLORE = [73.42, 73.42, 55.0, 65.41, 73.42, 87.31, 82.41, 55.0];
const BASS_TENSE = [73.42, 73.42, 77.78, 73.42, 87.31, 82.41, 77.78, 69.3];
const BASS_BOSS = [73.42, 146.83, 73.42, 77.78, 73.42, 146.83, 103.83, 69.3];

const ARP_EXPLORE = [293.66, 349.23, 440.0, 523.25, 440.0, 349.23, 329.63, 277.18];
const ARP_TENSE = [293.66, 311.13, 392.0, 440.0, 466.16, 440.0, 392.0, 311.13];
const ARP_BOSS = [587.33, 622.25, 880.0, 830.61, 698.46, 622.25, 587.33, 554.37];

class EduverseAudioSynth {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private prefs: StoredAudioPreferences = { ...DEFAULT_AUDIO_PREFERENCES };
  private musicPlaying = false;
  private paused = false;
  private intensity: MusicIntensity = 'explore';
  private schedulerId: number | null = null;
  private nextNoteTime = 0;
  private stepIndex = 0;

  public get muted(): boolean {
    return this.prefs.muted;
  }
  public set muted(val: boolean) {
    this.setMuted(val);
  }

  public get musicEnabled(): boolean {
    return this.prefs.musicEnabled;
  }
  public set musicEnabled(val: boolean) {
    this.setMusicEnabled(val);
  }

  public getPreferences(): StoredAudioPreferences {
    return { ...this.prefs };
  }

  public applyPreferences(next: StoredAudioPreferences) {
    this.prefs = {
      masterVolume: clampVolume(next.masterVolume),
      musicVolume: clampVolume(next.musicVolume),
      sfxVolume: clampVolume(next.sfxVolume),
      musicEnabled: Boolean(next.musicEnabled),
      sfxEnabled: Boolean(next.sfxEnabled),
      muted: Boolean(next.muted),
    };
    this.syncGainNodes();
  }

  private syncGainNodes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(computeEffectiveMasterGain(this.prefs), t, 0.03);
    }
    if (this.musicGain) {
      this.musicGain.gain.setTargetAtTime(computeEffectiveMusicGain(this.prefs, this.paused), t, 0.05);
    }
    if (this.sfxGain) {
      this.sfxGain.gain.setTargetAtTime(computeEffectiveSfxGain(this.prefs), t, 0.03);
    }
  }

  private ensureContext(allowWhenMuted = false): AudioContext | null {
    if (this.prefs.muted && !allowWhenMuted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.setValueAtTime(-16, this.ctx.currentTime);
        comp.ratio.setValueAtTime(4, this.ctx.currentTime);

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(computeEffectiveMasterGain(this.prefs), this.ctx.currentTime);

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.setValueAtTime(
          computeEffectiveMusicGain(this.prefs, this.paused),
          this.ctx.currentTime
        );

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.setValueAtTime(computeEffectiveSfxGain(this.prefs), this.ctx.currentTime);

        this.musicGain.connect(comp);
        this.sfxGain.connect(comp);
        comp.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const sampleRate = ctx.sampleRate;
    const len = Math.floor(sampleRate * 0.25);
    const buffer = ctx.createBuffer(1, len, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainVal = 0.08,
    delay = 0,
    target: 'sfx' | 'music' = 'sfx',
    cutoffHz?: number,
    whenOverride?: number
  ) {
    if (target === 'sfx' && (!this.prefs.sfxEnabled || this.prefs.sfxVolume <= 0)) return;
    if (target === 'music' && (!this.prefs.musicEnabled || this.prefs.musicVolume <= 0)) return;

    const ctx = this.ensureContext();
    if (!ctx) return;
    const out = target === 'music' ? this.musicGain : this.sfxGain;
    if (!out) return;

    const now = (whenOverride ?? ctx.currentTime) + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0008, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, gainVal), now + 0.014);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    if (cutoffHz) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(cutoffHz, now);
      filter.Q.setValueAtTime(3.2, now);
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }

    gain.connect(out);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  private playKick(when: number, level = 0.22) {
    const ctx = this.ctx;
    const out = this.musicGain;
    if (!ctx || !out || !this.prefs.musicEnabled || this.prefs.musicVolume <= 0) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(125, when);
    osc.frequency.exponentialRampToValueAtTime(42, when + 0.13);
    gain.gain.setValueAtTime(level, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.16);
    osc.connect(gain);
    gain.connect(out);
    osc.start(when);
    osc.stop(when + 0.17);
  }

  private playTickHat(when: number, level = 0.06, open = false) {
    const ctx = this.ctx;
    const out = this.musicGain;
    if (!ctx || !out || !this.prefs.musicEnabled || this.prefs.musicVolume <= 0) return;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(open ? 5200 : 7500, when);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, when);
    gain.gain.exponentialRampToValueAtTime(0.0005, when + (open ? 0.09 : 0.035));
    src.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    src.start(when);
    src.stop(when + (open ? 0.1 : 0.04));
  }

  private getStepSeconds(): number {
    const bpm = this.intensity === 'boss' ? 148 : this.intensity === 'tense' ? 134 : 118;
    return 60 / bpm / 4;
  }

  private scheduleMusicStep(step: number, when: number) {
    if (this.prefs.muted || this.paused || !this.prefs.musicEnabled || this.prefs.musicVolume <= 0) return;
    const beat16 = step % 16;
    const barStep = Math.floor(step / 2) % 8;

    const bassArray =
      this.intensity === 'boss'
        ? BASS_BOSS
        : this.intensity === 'tense'
        ? BASS_TENSE
        : BASS_EXPLORE;
    const arpArray =
      this.intensity === 'boss'
        ? ARP_BOSS
        : this.intensity === 'tense'
        ? ARP_TENSE
        : ARP_EXPLORE;

    // 1. Driving Sub-Bass Ostinato
    const bassFreq = bassArray[barStep];
    if (this.intensity === 'boss') {
      if (beat16 % 2 === 0) {
        this.playTone(bassFreq, 0.14, 'sawtooth', 0.13, 0, 'music', 460, when);
      }
    } else if (this.intensity === 'tense') {
      if (beat16 % 2 === 0) {
        this.playTone(bassFreq, 0.16, 'sawtooth', 0.1, 0, 'music', 340, when);
      }
    } else {
      if (beat16 % 4 === 0 || beat16 === 10) {
        this.playTone(bassFreq, 0.28, 'triangle', 0.12, 0, 'music', 280, when);
      }
    }

    // 2. Eerie Suspense Arpeggio Pluck
    const sweepCutoff =
      650 + Math.sin(step * 0.25) * 320 + (this.intensity === 'boss' ? 900 : this.intensity === 'tense' ? 450 : 0);
    if (this.intensity === 'boss') {
      this.playTone(arpArray[step % 8], 0.11, 'square', 0.045, 0, 'music', sweepCutoff, when);
    } else if (this.intensity === 'tense') {
      if (beat16 % 2 === 0 || beat16 === 7 || beat16 === 15) {
        this.playTone(arpArray[barStep], 0.14, 'triangle', 0.055, 0, 'music', sweepCutoff, when);
      }
    } else {
      if (beat16 % 4 === 2) {
        this.playTone(arpArray[barStep], 0.22, 'sine', 0.05, 0, 'music', sweepCutoff, when);
      }
    }

    // 3. Heartbeat Kick & Ticking Tension Percussion
    if (beat16 === 0 || beat16 === 8 || (this.intensity !== 'explore' && beat16 === 12)) {
      this.playKick(when, this.intensity === 'boss' ? 0.26 : 0.19);
    } else if (this.intensity === 'explore' && beat16 === 6) {
      this.playKick(when, 0.12);
    }

    if (this.intensity === 'boss') {
      this.playTickHat(when, beat16 % 2 === 0 ? 0.065 : 0.032, beat16 === 14);
    } else if (this.intensity === 'tense' && beat16 % 2 === 1) {
      this.playTickHat(when, 0.045, beat16 === 15);
    } else if (beat16 % 4 === 2) {
      this.playTickHat(when, 0.025, false);
    }

    // 4. Cinematic Pad Chord Swell
    if (beat16 === 0 && step % 32 === 0) {
      this.playTone(146.83, 1.4, 'sawtooth', 0.032, 0, 'music', 520, when);
      this.playTone(220.0, 1.4, 'triangle', 0.028, 0, 'music', 600, when);
      if (this.intensity !== 'explore') {
        this.playTone(207.65, 1.1, 'sine', 0.025, 0, 'music', 700, when);
      }
    }
  }

  public startMusic(initialIntensity: MusicIntensity = 'explore') {
    this.intensity = initialIntensity;
    if (this.musicPlaying) return;
    const ctx = this.ensureContext(true);
    if (!ctx) return;

    this.musicPlaying = true;
    this.nextNoteTime = ctx.currentTime + 0.06;

    if (this.schedulerId !== null) {
      window.clearInterval(this.schedulerId);
    }

    this.schedulerId = window.setInterval(() => {
      if (
        !this.musicPlaying ||
        !this.ctx ||
        this.prefs.muted ||
        this.paused ||
        !this.prefs.musicEnabled ||
        this.prefs.musicVolume <= 0
      ) {
        if (this.ctx) {
          this.nextNoteTime = this.ctx.currentTime + 0.05;
        }
        return;
      }
      const lookahead = 0.18;
      while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
        this.scheduleMusicStep(this.stepIndex, this.nextNoteTime);
        this.nextNoteTime += this.getStepSeconds();
        this.stepIndex = (this.stepIndex + 1) % 64;
      }
    }, 55);
  }

  public setMusicIntensity(level: MusicIntensity) {
    this.intensity = level;
  }

  public setPaused(paused: boolean) {
    this.paused = paused;
    this.syncGainNodes();
  }

  public setMasterVolume(val: number) {
    this.prefs.masterVolume = clampVolume(val);
    this.syncGainNodes();
  }

  public setMusicVolume(val: number) {
    this.prefs.musicVolume = clampVolume(val);
    this.syncGainNodes();
  }

  public setSfxVolume(val: number) {
    this.prefs.sfxVolume = clampVolume(val);
    this.syncGainNodes();
  }

  public setMusicEnabled(enabled: boolean) {
    this.prefs.musicEnabled = enabled;
    this.syncGainNodes();
  }

  public setSfxEnabled(enabled: boolean) {
    this.prefs.sfxEnabled = enabled;
    this.syncGainNodes();
  }

  public setMuted(muted: boolean) {
    this.prefs.muted = muted;
    this.syncGainNodes();
  }

  public toggleMute(): boolean {
    this.setMuted(!this.prefs.muted);
    return this.prefs.muted;
  }

  public stopMusic() {
    this.musicPlaying = false;
    if (this.schedulerId !== null) {
      window.clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
  }

  public playSfx(event: SfxEventName, streak = 1) {
    switch (event) {
      case 'jump':
        this.playJump();
        break;
      case 'dash':
        this.playDash();
        break;
      case 'jumpPad':
        this.playJumpPad();
        break;
      case 'pickup':
        this.playPickup(false);
        break;
      case 'goldenPickup':
        this.playPickup(true);
        break;
      case 'warning':
        this.playWarningBeep();
        break;
      case 'hurt':
        this.playHurt();
        break;
      case 'correct':
        this.playCorrect();
        break;
      case 'combo':
        this.playCombo(streak);
        break;
      case 'wrong':
        this.playWrong();
        break;
      case 'unlock':
        this.playUnlock();
        break;
      case 'victory':
        this.playVictoryFanfare();
        break;
      case 'defeat':
        this.playDefeatSting();
        break;
      case 'uiClick':
        this.playUiClick();
        break;
    }
  }

  public playUiClick() {
    this.playTone(680, 0.06, 'sine', 0.055, 0, 'sfx');
  }

  public playJump() {
    const pitchJitter = 0.94 + Math.random() * 0.12;
    this.playTone(320 * pitchJitter, 0.12, 'triangle', 0.08);
    this.playTone(480 * pitchJitter, 0.12, 'sine', 0.05, 0.04);
  }

  public playDash() {
    if (!this.prefs.sfxEnabled || this.prefs.sfxVolume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(340, now + 0.18);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(now);
    src.stop(now + 0.2);

    this.playTone(540, 0.1, 'sine', 0.06, 0);
  }

  public playJumpPad() {
    this.playTone(330, 0.12, 'triangle', 0.09, 0);
    this.playTone(495, 0.14, 'triangle', 0.09, 0.05);
    this.playTone(660, 0.2, 'sine', 0.1, 0.1);
    this.playTone(990, 0.24, 'sine', 0.07, 0.15);
  }

  public playPickup(isGolden = false) {
    const pitchJitter = 0.96 + Math.random() * 0.08;
    if (isGolden) {
      this.playTone(659.25 * pitchJitter, 0.11, 'triangle', 0.1, 0);
      this.playTone(880 * pitchJitter, 0.12, 'triangle', 0.1, 0.06);
      this.playTone(1318.5 * pitchJitter, 0.24, 'sine', 0.11, 0.12);
    } else {
      this.playTone(587 * pitchJitter, 0.1, 'sine', 0.08);
      this.playTone(880 * pitchJitter, 0.16, 'triangle', 0.08, 0.06);
    }
  }

  public playWarningBeep() {
    this.playTone(920, 0.08, 'square', 0.055, 0, 'sfx', 2400);
    this.playTone(1240, 0.1, 'square', 0.06, 0.11, 'sfx', 2800);
  }

  public playHurt() {
    this.playTone(155, 0.18, 'sawtooth', 0.12, 0, 'sfx', 550);
    this.playTone(98, 0.24, 'square', 0.11, 0.04, 'sfx', 400);
  }

  public playCorrect() {
    this.playTone(523.25, 0.12, 'triangle', 0.09, 0);
    this.playTone(659.25, 0.12, 'triangle', 0.09, 0.08);
    this.playTone(783.99, 0.18, 'triangle', 0.1, 0.16);
    this.playTone(1046.5, 0.28, 'sine', 0.1, 0.24);
  }

  public playCombo(streak: number) {
    const base = 587.33 + Math.min(4, streak) * 55;
    this.playTone(base, 0.1, 'sine', 0.08, 0);
    this.playTone(base * 1.25, 0.12, 'triangle', 0.09, 0.06);
    this.playTone(base * 1.5, 0.22, 'sine', 0.1, 0.12);
  }

  public playWrong() {
    this.playTone(220, 0.16, 'sawtooth', 0.07, 0, 'sfx', 700);
    this.playTone(165, 0.24, 'sawtooth', 0.07, 0.1, 'sfx', 550);
  }

  public playUnlock() {
    this.playTone(440, 0.15, 'sine', 0.08, 0);
    this.playTone(554.37, 0.15, 'sine', 0.08, 0.08);
    this.playTone(659.25, 0.25, 'triangle', 0.09, 0.16);
    this.playTone(880, 0.3, 'sine', 0.09, 0.24);
  }

  public playVictoryFanfare() {
    this.playTone(523.25, 0.14, 'triangle', 0.1, 0);
    this.playTone(659.25, 0.14, 'triangle', 0.1, 0.11);
    this.playTone(783.99, 0.16, 'triangle', 0.1, 0.22);
    this.playTone(1046.5, 0.42, 'sine', 0.12, 0.34);
  }

  public playDefeatSting() {
    this.playTone(293.66, 0.22, 'sawtooth', 0.09, 0, 'sfx', 720);
    this.playTone(261.63, 0.24, 'sawtooth', 0.09, 0.2, 'sfx', 620);
    this.playTone(220.0, 0.45, 'sawtooth', 0.1, 0.42, 'sfx', 480);
  }
}

export const audioSynth = new EduverseAudioSynth();
