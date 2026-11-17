class EduverseAudioSynth {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private playTone(freq: number, duration: number, type: OscillatorType = 'sine', gainVal = 0.08, delay = 0) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(gainVal, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playJump() {
    const pitchJitter = 0.94 + Math.random() * 0.12;
    this.playTone(320 * pitchJitter, 0.12, 'triangle', 0.07);
    this.playTone(480 * pitchJitter, 0.12, 'sine', 0.05, 0.04);
  }

  public playPickup() {
    const pitchJitter = 0.95 + Math.random() * 0.1;
    this.playTone(587 * pitchJitter, 0.1, 'sine', 0.08);
    this.playTone(880 * pitchJitter, 0.16, 'triangle', 0.08, 0.06);
  }

  public playCorrect() {
    this.playTone(523.25, 0.12, 'triangle', 0.09, 0);
    this.playTone(659.25, 0.12, 'triangle', 0.09, 0.08);
    this.playTone(783.99, 0.18, 'triangle', 0.1, 0.16);
    this.playTone(1046.5, 0.28, 'sine', 0.1, 0.24);
  }

  public playWrong() {
    this.playTone(220, 0.16, 'sawtooth', 0.06, 0);
    this.playTone(175, 0.22, 'sawtooth', 0.06, 0.1);
  }

  public playUnlock() {
    this.playTone(440, 0.15, 'sine', 0.08, 0);
    this.playTone(554.37, 0.15, 'sine', 0.08, 0.08);
    this.playTone(659.25, 0.25, 'triangle', 0.09, 0.16);
  }
}

export const audioSynth = new EduverseAudioSynth();
