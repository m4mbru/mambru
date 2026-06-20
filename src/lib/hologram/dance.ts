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
  /** Energy history length for variance analysis (default: 43 = ~1s). */
  energyHistoryLen?: number;
  /** Standard-deviation threshold: above = rhythmic/music, below = speech (default: 0.012). */
  varianceThreshold?: number;
  /** Seconds of sustained rhythmic energy before declaring music (default: 2). */
  minMusicDuration?: number;
  /** Seconds of sustained low-variance before declaring speech (default: 1.5). */
  minSpeechDuration?: number;
  /** Number of FFT bins treated as bass (default: 10 ≈ 230Hz at 1024 FFT). */
  bassBinCount?: number;
  /** Smoothing rate for dance param attack (0–1, default: 0.12). */
  attackSmooth?: number;
  /** Decay multiplier per frame when music stops (default: 0.96). */
  decayRate?: number;
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

  // Resolved options with defaults
  private opts: Required<DanceControllerOptions>;

  // Dance parameters (smoothed)
  private params: DanceParams = {
    intensity: 0,
    sway: 0,
    bounce: 0,
    spread: 1,
    spin: 0,
    isMusic: false,
  };

  constructor(options: DanceControllerOptions = {}) {
    this.opts = {
      fftSize: options.fftSize ?? 1024,
      minDecibels: options.minDecibels ?? -80,
      maxDecibels: options.maxDecibels ?? -20,
      smoothingTimeConstant: options.smoothingTimeConstant ?? 0.85,
      energyHistoryLen: options.energyHistoryLen ?? 43,
      varianceThreshold: options.varianceThreshold ?? 0.012,
      minMusicDuration: options.minMusicDuration ?? 2,
      minSpeechDuration: options.minSpeechDuration ?? 1.5,
      bassBinCount: options.bassBinCount ?? 10,
      attackSmooth: options.attackSmooth ?? 0.12,
      decayRate: options.decayRate ?? 0.96,
    };
  }

  /** Start listening to the user's microphone for music detection. */
  async start(): Promise<void> {
    if (this.analyser) return;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new AudioContext();
      this.source = this.audioContext.createMediaStreamSource(this.stream);

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.opts.fftSize;
      this.analyser.minDecibels = this.opts.minDecibels;
      this.analyser.maxDecibels = this.opts.maxDecibels;
      this.analyser.smoothingTimeConstant = this.opts.smoothingTimeConstant;

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
    const bassCutoff = Math.min(len, this.opts.bassBinCount);

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
    if (this.energyHistory.length > this.opts.energyHistoryLen) {
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
    if (this.musicDuration > this.opts.minMusicDuration) {
      this._isMusic = true;
    } else if (this.speechDuration > this.opts.minSpeechDuration) {
      this._isMusic = false;
    }

    // Compute dance parameters
    if (this._isMusic) {
      const { attackSmooth } = this.opts;

      // Bass drives bounce — detect individual beats
      const bassPulse = bassEnergy * 2;
      const beatPhase = (this.time * 120 * Math.PI) / 30; // assume ~120 BPM
      const beat = Math.max(0, Math.sin(beatPhase));

      this.params.intensity += (Math.min(1, totalEnergy * 2.5) - this.params.intensity) * attackSmooth;
      this.params.bounce += (bassPulse * 0.4 * beat - this.params.bounce) * attackSmooth * 1.5;
      this.params.sway += (Math.sin(this.time * 2.5) * 0.12 * (0.5 + bassEnergy) - this.params.sway) * attackSmooth * 0.8;
      this.params.spread += (1 + bassEnergy * 0.6 - this.params.spread) * attackSmooth * 0.6;
      this.params.spin += (0.3 + bassEnergy * 0.8 - this.params.spin) * attackSmooth * 0.7;
    } else {
      // Decay
      const { decayRate } = this.opts;
      this.params.intensity *= decayRate;
      this.params.bounce *= decayRate * 0.95;
      this.params.sway *= decayRate;
      this.params.spread += (1 - this.params.spread) * 0.03;
      this.params.spin *= decayRate * 1.02;
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
    if (this.energyHistory.length < this.opts.energyHistoryLen) return false;

    const mean = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;
    const variance =
      this.energyHistory.reduce((sum, e) => sum + (e - mean) ** 2, 0) /
      this.energyHistory.length;
    const stdDev = Math.sqrt(variance);

    return stdDev > this.opts.varianceThreshold && currentEnergy > mean;
  }
}
