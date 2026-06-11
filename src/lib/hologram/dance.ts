/**
 * Dance controller — music-driven animation for the holographic avatar.
 *
 * Uses Web Audio API's AnalyserNode to extract FFT data and detect
 * rhythmic patterns vs continuous speech. When music is detected, it
 * drives particle oscillation, rotation, and "body" movement.
 *
 * Architecture:
 *   AnalyserNode → FFT → beat detection → dance parameters
 *   The HologramEngine polls `getDanceParams()` each frame.
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface DanceParams {
  /** 0 = no dancing, 1 = full dance. */
  intensity: number;
  /** Body sway angle (radians). */
  sway: number;
  /** Vertical bounce offset. */
  bounce: number;
  /** Particle spread multiplier. */
  spread: number;
  /** Rotation speed multiplier. */
  spin: number;
  /** Is music (vs speech) currently detected. */
  isMusic: boolean;
}

export interface DanceControllerOptions {
  fftSize?: number;
  minDecibels?: number;
  maxDecibels?: number;
  smoothingTimeConstant?: number;
}

// ─── Constants ───────────────────────────────────────────────────────

const ENERGY_HISTORY_LEN = 43; // ~1 second at 44.1kHz / 1024 FFT
const MIN_MUSIC_DURATION = 3;  // seconds before declaring "music"
const MIN_SPEECH_DURATION = 2; // seconds before declaring "speech"

// ─── Controller ──────────────────────────────────────────────────────

export class DanceController {
  private analyser: AnalyserNode | null = null;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;

  private fftBuffer!: Uint8Array;
  private energyHistory: number[] = [];
  private musicDuration = 0;
  private speechDuration = 0;
  private _isMusic = false;
  private time = 0;

  // Dance parameters (smoothed)
  private params: DanceParams = {
    intensity: 0,
    sway: 0,
    bounce: 0,
    spread: 1,
    spin: 0,
    isMusic: false,
  };

  constructor(private options: DanceControllerOptions = {}) {}

  /** Start listening to the user's microphone for music detection. */
  async start(): Promise<void> {
    if (this.analyser) return;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new AudioContext();
      this.source = this.audioContext.createMediaStreamSource(this.stream);

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.options.fftSize ?? 1024;
      this.analyser.minDecibels = this.options.minDecibels ?? -80;
      this.analyser.maxDecibels = this.options.maxDecibels ?? -20;
      this.analyser.smoothingTimeConstant = this.options.smoothingTimeConstant ?? 0.85;

      this.source.connect(this.analyser);
      this.fftBuffer = new Uint8Array(this.analyser.frequencyBinCount);
      this.energyHistory = [];
    } catch (err) {
      console.warn('[mambru] dance: failed to start audio analysis:', err);
    }
  }

  /** Stop listening and release resources. */
  stop(): void {
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.audioContext?.close();
    this.analyser = null;
    this.source = null;
    this.stream = null;
    this.audioContext = null;
    this._isMusic = false;
    this.params.intensity = 0;
    this.params.isMusic = false;
  }

  /** Call each frame to update dance parameters. Returns the current params. */
  update(deltaSeconds: number): DanceParams {
    this.time += deltaSeconds;

    if (!this.analyser) {
      this.params.intensity *= 0.95; // decay
      this.params.sway *= 0.9;
      this.params.bounce *= 0.9;
      return this.params;
    }

    // Read FFT data
    this.analyser.getByteFrequencyData(this.fftBuffer as any);

    // Calculate total energy
    // Weighted: low frequencies (bass) count more for rhythm detection
    const len = this.fftBuffer.length;
    let totalEnergy = 0;
    let bassEnergy = 0;
    const bassCutoff = Math.min(len, 10); // first 10 bins = bass

    for (let i = 0; i < len; i++) {
      const normalized = this.fftBuffer[i] / 255;
      totalEnergy += normalized;
      if (i < bassCutoff) {
        bassEnergy += normalized;
      }
    }
    totalEnergy /= len;
    bassEnergy /= bassCutoff;

    // Energy history for variance analysis
    this.energyHistory.push(totalEnergy);
    if (this.energyHistory.length > ENERGY_HISTORY_LEN) {
      this.energyHistory.shift();
    }

    // Detect music vs speech via energy variance
    const isMusic = this.detectMusic(totalEnergy);

    if (isMusic) {
      this.musicDuration += deltaSeconds;
      this.speechDuration = 0;
    } else {
      this.speechDuration += deltaSeconds;
      this.musicDuration = 0;
    }

    // Only switch after sustained detection
    if (this.musicDuration > MIN_MUSIC_DURATION) {
      this._isMusic = true;
    } else if (this.speechDuration > MIN_SPEECH_DURATION) {
      this._isMusic = false;
    }

    // Compute dance parameters
    if (this._isMusic) {
      // Bass drives bounce
      const bassPulse = bassEnergy * 2;
      const beat = Math.sin(this.time * Math.PI * 4 * (0.8 + bassEnergy * 0.4));

      this.params.intensity += (Math.min(1, totalEnergy * 3) - this.params.intensity) * 0.1;
      this.params.bounce += (bassPulse * 0.3 * Math.max(0, beat) - this.params.bounce) * 0.15;
      this.params.sway += (Math.sin(this.time * 0.5) * 0.15 * totalEnergy - this.params.sway) * 0.08;
      this.params.spread += (1 + bassEnergy * 0.5 - this.params.spread) * 0.05;
      this.params.spin += (0.5 + bassEnergy - this.params.spin) * 0.05;
    } else {
      // Decay
      this.params.intensity *= 0.97;
      this.params.bounce *= 0.9;
      this.params.sway *= 0.95;
      this.params.spread += (1 - this.params.spread) * 0.05;
      this.params.spin *= 0.98;
    }

    this.params.isMusic = this._isMusic;
    return this.params;
  }

  /** True if music is currently detected. */
  get isActive(): boolean {
    return this._isMusic;
  }

  // ─── Private ─────────────────────────────────────────────────────

  /**
   * Detect music vs speech by analyzing energy variance.
   * Music has higher variance (beats) than speech's more constant energy.
   */
  private detectMusic(currentEnergy: number): boolean {
    if (this.energyHistory.length < ENERGY_HISTORY_LEN) return false;

    const mean = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;
    const variance =
      this.energyHistory.reduce((sum, e) => sum + (e - mean) ** 2, 0) /
      this.energyHistory.length;
    const stdDev = Math.sqrt(variance);

    // High std-dev + current energy above mean = rhythmic beat pattern
    return stdDev > 0.015 && currentEnergy > mean;
  }
}
