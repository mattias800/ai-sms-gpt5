/**
 * Simple musical content detection for mono 16-bit WAV samples.
 * Approach:
 *  - Window the signal (Hann) into short frames
 *  - Estimate pitch per frame using normalized autocorrelation (ACF)
 *  - Count tonal frames, unique quantized notes (MIDI), and pitch changes over time
 *  - Decide "musical" if we have enough tonal energy and multiple distinct notes/changes
 *
 * This works well for PSG square waves (strong periodicity => strong ACF peaks).
 */

export interface MusicAnalysisResult {
  sampleRate: number;
  totalFrames: number;
  tonalFrames: number;
  tonalRatio: number;
  uniqueNotes: number;
  uniqueMidis: number[];
  pitchHzPerFrame: Array<number | null>;
  midiPerFrame: Array<number | null>;
  noteChanges: number;
  avgACFPeak: number;
  rms: number; // global RMS (0..1)
  hasMusicalContent: boolean;
}

export interface MusicAnalysisOptions {
  // Window in seconds (typical 40-60ms)
  windowSec?: number;
  // Hop (stride) in seconds (typical 50% of window)
  hopSec?: number;
  // Acceptable pitch range (Hz)
  minHz?: number;
  maxHz?: number;
  // Minimum normalized ACF peak (0..1) for a frame to be considered tonal
  minPeak?: number;
  // Minimum thresholds to declare music
  minTonalRatio?: number;
  minUniqueNotes?: number;
  minNoteChanges?: number;
}

/**
 * Analyze mono 16-bit samples for musical content.
 * samples: Int16Array PCM [-32768..32767]
 * sampleRate: Hz
 */
export function analyzeMusicFromSamples(
  samples: Int16Array,
  sampleRate: number,
  opts: MusicAnalysisOptions = {}
): MusicAnalysisResult {
  const sr = sampleRate >>> 0;

  const windowSec = opts.windowSec ?? 0.05; // 50 ms
  const hopSec = opts.hopSec ?? (windowSec * 0.5); // 50% overlap
  const minHz = opts.minHz ?? 80;    // ignore sub bass / DC
  const maxHz = opts.maxHz ?? 5000;  // PSG overtones can be high; cap sensibly
  const minPeak = opts.minPeak ?? 0.3; // normalized ACF threshold
  const minTonalRatio = opts.minTonalRatio ?? 0.15;
  const minUniqueNotes = opts.minUniqueNotes ?? 3;
  const minNoteChanges = opts.minNoteChanges ?? 2;

  const winSize = clampPow2(Math.max(128, Math.floor(windowSec * sr)));
  const hopSize = Math.max(8, Math.floor(hopSec * sr));
  const lagMin = Math.max(1, Math.floor(sr / maxHz));
  const lagMax = Math.max(lagMin + 1, Math.min(winSize - 1, Math.floor(sr / minHz)));

  // Convert to float [-1,1]
  const x = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) x[i] = (samples[i] as number) / 32768;

  const globalRms = Math.sqrt(dot(x, x) / Math.max(1, x.length));

  // Precompute Hann window
  const hann = new Float32Array(winSize);
  for (let n = 0; n < winSize; n++) hann[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (winSize - 1)));

  const pitchHzPerFrame: Array<number | null> = [];
  const midiPerFrame: Array<number | null> = [];
  const acfPeaks: number[] = [];

  let tonalFrames = 0;
  let frames = 0;

  for (let start = 0; start + winSize <= x.length; start += hopSize) {
    frames++;
    // Copy window and apply Hann + mean removal
    let mean = 0;
    for (let i = 0; i < winSize; i++) mean += x[start + i]!;
    mean /= winSize;
    const w = new Float32Array(winSize);
    for (let i = 0; i < winSize; i++) w[i] = (x[start + i]! - mean) * hann[i]!;

    // ACF-based pitch estimation
    const { freqHz, peakNorm } = estimatePitchACF(w, sr, lagMin, lagMax);
    acfPeaks.push(peakNorm);

    if (freqHz !== null && peakNorm >= minPeak) {
      tonalFrames++;
      pitchHzPerFrame.push(freqHz);
      const midi = freqToMidi(freqHz);
      midiPerFrame.push(midi);
    } else {
      pitchHzPerFrame.push(null);
      midiPerFrame.push(null);
    }
  }

  // Unique notes: collect unique MIDI integers across tonal frames
  const uniqueMidiSet = new Set<number>();
  for (const m of midiPerFrame) if (typeof m === 'number') uniqueMidiSet.add(Math.round(m));
  const uniqueMidis = [...uniqueMidiSet].sort((a, b) => a - b);

  // Count note changes across consecutive tonal frames (ignoring nulls)
  let prevMidi: number | null = null;
  let changes = 0;
  for (const m of midiPerFrame) {
    if (m == null) continue;
    const mr = Math.round(m);
    if (prevMidi == null) prevMidi = mr;
    else if (mr !== prevMidi) { changes++; prevMidi = mr; }
  }

  const tonalRatio = frames > 0 ? tonalFrames / frames : 0;
  const avgACFPeak = acfPeaks.length ? acfPeaks.reduce((a, b) => a + b, 0) / acfPeaks.length : 0;

  const hasMusicalContent =
    tonalRatio >= minTonalRatio &&
    uniqueMidis.length >= minUniqueNotes &&
    changes >= minNoteChanges;

  return {
    sampleRate: sr,
    totalFrames: frames,
    tonalFrames,
    tonalRatio,
    uniqueNotes: uniqueMidis.length,
    uniqueMidis,
    pitchHzPerFrame,
    midiPerFrame,
    noteChanges: changes,
    avgACFPeak,
    rms: globalRms,
    hasMusicalContent,
  };
}

function estimatePitchACF(
  w: Float32Array,
  sr: number,
  lagMin: number,
  lagMax: number
): { freqHz: number | null; peakNorm: number } {
  const N = w.length | 0;
  // Energy (zero-lag ACF)
  const e0 = dot(w, w);
  if (e0 <= 1e-9) return { freqHz: null, peakNorm: 0 };

  // Compute normalized ACF for lags [lagMin..lagMax]
  let bestLag = -1;
  let bestVal = 0;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let s = 0;
    // Naive O(N) per lag; acceptable for small windows
    for (let n = 0; n + lag < N; n++) s += w[n]! * w[n + lag]!;
    const r = s / e0; // normalized by e0
    if (r > bestVal) {
      bestVal = r;
      bestLag = lag;
    }
  }

  if (bestLag > 0 && bestVal > 0) {
    const freq = sr / bestLag;
    if (isFinite(freq) && freq > 0) return { freqHz: freq, peakNorm: bestVal };
  }
  return { freqHz: null, peakNorm: bestVal };
}

function dot(a: Float32Array, b: Float32Array): number {
  const N = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < N; i++) s += a[i]! * b[i]!;
  return s;
}

function clampPow2(v: number): number {
  // Return nearest power-of-two window from v (within reasonable bounds)
  const p = Math.pow(2, Math.round(Math.log2(Math.max(32, Math.min(16384, v)))));
  return p | 0;
}

function freqToMidi(freq: number): number {
  // MIDI 69 == A4 = 440Hz
  return 69 + 12 * Math.log2(freq / 440);
}

/**
 * FFT-based musical content detection for mono 16-bit WAV samples.
 * Approach:
 *  - Window the signal (Hann) into short frames
 *  - Compute magnitude spectrum via radix-2 FFT
 *  - Detect dominant spectral peak within [minHz..maxHz] with peak prominence over mean
 *  - Map dominant peak to nearest MIDI note per frame
 *  - Decide "musical" based on tonal ratio, unique notes, and note changes
 *
 * Designed for PSG square waves: strong harmonic structure yields clear peaks.
 */
export interface FFTAnalysisOptions extends MusicAnalysisOptions {
  // Peak prominence threshold relative to average magnitude in passband
  // E.g., 8.0 => dominant peak at least 8x average magnitude
  minProminence?: number;
}

export function analyzeMusicFFTFromSamples(
  samples: Int16Array,
  sampleRate: number,
  opts: FFTAnalysisOptions = {}
): MusicAnalysisResult {
  const sr = sampleRate >>> 0;

  const windowSec = opts.windowSec ?? 0.05; // 50 ms
  const hopSec = opts.hopSec ?? (windowSec * 0.5); // 50% overlap
  const minHz = opts.minHz ?? 80;
  const maxHz = opts.maxHz ?? 5000;
  const minProm = opts.minProminence ?? 8.0; // dominant/mean magnitude threshold

  const minTonalRatio = opts.minTonalRatio ?? 0.10;
  const minUniqueNotes = opts.minUniqueNotes ?? 2;
  const minNoteChanges = opts.minNoteChanges ?? 1;

  const winSize = clampPow2(Math.max(128, Math.floor(windowSec * sr)));
  const hopSize = Math.max(8, Math.floor(hopSec * sr));
  const n = winSize; // use power-of-two window length

  // Convert to float [-1,1]
  const x = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) x[i] = (samples[i] as number) / 32768;

  const globalRms = Math.sqrt(dot(x, x) / Math.max(1, x.length));

  // Precompute Hann window
  const hann = new Float32Array(n);
  for (let k = 0; k < n; k++) hann[k] = 0.5 * (1 - Math.cos((2 * Math.PI * k) / (n - 1)));

  const kMin = Math.max(1, Math.floor((minHz * n) / sr));
  const kMax = Math.min(Math.floor((maxHz * n) / sr), Math.floor(n / 2));

  const pitchHzPerFrame: Array<number | null> = [];
  const midiPerFrame: Array<number | null> = [];

  let frames = 0;
  let tonalFrames = 0;
  const acfPeaksProxy: number[] = []; // store prominence as a proxy metric

  const re = new Float32Array(n);
  const im = new Float32Array(n);

  for (let start = 0; start + n <= x.length; start += hopSize) {
    frames++;
    // Prepare windowed frame with mean removal
    let mean = 0;
    for (let i = 0; i < n; i++) mean += x[start + i]!;
    mean /= n;
    for (let i = 0; i < n; i++) {
      re[i] = (x[start + i]! - mean) * hann[i]!;
      im[i] = 0;
    }

    // FFT
    fftRadix2(re, im);

    // Magnitude spectrum (one-sided) with harmonic scoring (square waves have strong harmonics)
    let bestScore = 0;
    let bestBin = -1;
    let sumMag = 0;
    let countMag = 0;
    for (let k = kMin; k <= kMax; k++) {
      const mag1 = Math.hypot(re[k]!, im[k]!);
      sumMag += mag1;
      countMag++;

      // Include 2nd and 3rd harmonics to prefer true (lower) fundamentals
      const k2 = k * 2;
      const k3 = k * 3;
      const mag2 = k2 <= kMax ? Math.hypot(re[k2]!, im[k2]!) : 0;
      const mag3 = k3 <= kMax ? Math.hypot(re[k3]!, im[k3]!) : 0;

      const score = mag1 + 0.5 * mag2 + 0.3 * mag3;
      if (score > bestScore) {
        bestScore = score;
        bestBin = k;
      }
    }
    const meanMag = countMag > 0 ? sumMag / countMag : 0;
    const prominence = meanMag > 0 ? bestScore / (meanMag + 1e-12) : 0;
    acfPeaksProxy.push(prominence);

    if (bestBin > 0 && prominence >= minProm) {
      const freq = (bestBin * sr) / n;
      if (freq >= minHz && freq <= maxHz) {
        tonalFrames++;
        pitchHzPerFrame.push(freq);
        midiPerFrame.push(freqToMidi(freq));
        continue;
      }
    }
    pitchHzPerFrame.push(null);
    midiPerFrame.push(null);
  }

  // Unique notes and note changes (rounded MIDI)
  const uniqueMidiSet = new Set<number>();
  for (const m of midiPerFrame) if (typeof m === 'number') uniqueMidiSet.add(Math.round(m));
  const uniqueMidis = [...uniqueMidiSet].sort((a, b) => a - b);

  let prevMidi: number | null = null;
  let changes = 0;
  for (const m of midiPerFrame) {
    if (m == null) continue;
    const mr = Math.round(m);
    if (prevMidi == null) prevMidi = mr;
    else if (mr !== prevMidi) { changes++; prevMidi = mr; }
  }

  const tonalRatio = frames > 0 ? tonalFrames / frames : 0;
  const avgACFPeak = acfPeaksProxy.length ? acfPeaksProxy.reduce((a, b) => a + b, 0) / acfPeaksProxy.length : 0;

  const hasMusicalContent =
    tonalRatio >= minTonalRatio &&
    uniqueMidis.length >= minUniqueNotes &&
    changes >= minNoteChanges;

  return {
    sampleRate: sr,
    totalFrames: frames,
    tonalFrames,
    tonalRatio,
    uniqueNotes: uniqueMidis.length,
    uniqueMidis,
    pitchHzPerFrame,
    midiPerFrame,
    noteChanges: changes,
    avgACFPeak,
    rms: globalRms,
    hasMusicalContent,
  };
}

/**
 * In-place radix-2 Cooley–Tukey FFT for real/imag arrays (length must be power of 2).
 * re, im are modified in-place.
 */
function fftRadix2(re: Float32Array, im: Float32Array): void {
  const n = re.length | 0;
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      const ti = im[i]!;
      re[i] = re[j]!;
      im[i] = im[j]!;
      re[j] = tr;
      im[j] = ti;
    }
  }
  // FFT butterflies
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1.0;
      let wIm = 0.0;
      const half = len >>> 1;
      for (let j = 0; j < half; j++) {
        const uRe = re[i + j]!;
        const uIm = im[i + j]!;
        const vRe = re[i + j + half]! * wRe - im[i + j + half]! * wIm;
        const vIm = re[i + j + half]! * wIm + im[i + j + half]! * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + half] = uRe - vRe;
        im[i + j + half] = uIm - vIm;
        // w *= wlen
        const nwRe = wRe * wlenRe - wIm * wlenIm;
        const nwIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nwRe;
        wIm = nwIm;
      }
    }
  }
}
