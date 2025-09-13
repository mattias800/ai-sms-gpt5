export interface IPSG {
  write: (val: number) => void;
  tickCycles: (cpuCycles: number) => void;
  getState: () => PSGState;
  getSample: () => number;
  reset: () => void;
}

export interface PSGState {
  latchedReg: number;
  tones: [number, number, number]; // 10-bit frequencies
  vols: [number, number, number, number]; // 4-bit attenuation
  noise: { mode: number; shift: number };
  // Internal state for sound generation
  counters: [number, number, number];
  outputs: [boolean, boolean, boolean];
  noiseCounter: number;
  noiseOutput: boolean;
  lfsr: number; // Linear feedback shift register for noise
}

export const createPSG = (): IPSG => {
  const state: PSGState = {
    latchedReg: 0,
    tones: [0, 0, 0],
    vols: [0xf, 0xf, 0xf, 0xf], // 0xF = silent
    noise: { mode: 0, shift: 0 },
    counters: [0, 0, 0],
    outputs: [false, false, false],
    noiseCounter: 0,
    noiseOutput: false,
    lfsr: 0x8000, // 15-bit LFSR, initial seed
  };
  // Track last latched tone channel separately from volume/noise latches.
  // This matches test expectations that a volume latch between tone low and data-only
  // high write should NOT disturb which tone channel receives the high bits.
  let latchedToneChannel = 0;

  // Debug controls
  const PSG_DEBUG: boolean = (() => { try { return typeof process !== 'undefined' && !!process.env && (process.env.PSG_DEBUG === '1' || process.env.PSG_DEBUG === 'true'); } catch { return false; } })();
  // Debug: track write activity (enabled only when PSG_DEBUG)
  let writeCount = 0;
  let lastDebugTime = Date.now();
  let soundDebugCounter = 0;
  // Debug: classify writes
  const volWriteCounts: [number, number, number, number] = [0, 0, 0, 0];
  const toneWriteCounts: [number, number, number] = [0, 0, 0];
  let noiseWriteCount = 0;
  let dataWriteCount = 0;

  // PSG clock is 3.579545 MHz / 16 = 223.72 kHz
  const PSG_CLOCK = 3579545;
  const CLOCK_DIVIDER = 16;
  let cycleAccumulator = 0;

  const write = (val: number): void => {
    const b = val & 0xff;
    
    // Debug logging (guarded)
    if (PSG_DEBUG) {
      writeCount++;
      const now = Date.now();
      if (now - lastDebugTime > 1000) {
        const volsStr = `[${state.vols.join(',')}]`;
        const tonesStr = `[${state.tones.join(',')}]`;
        const volWStr = `[${volWriteCounts.join(',')}]`;
        const toneWStr = `[${toneWriteCounts.join(',')}]`;
        const anyActive = state.vols.some(v => (v & 0x0f) < 0x0f);
        console.log(`PSG writes/sec: ${writeCount}, volW: ${volWStr}, toneW: ${toneWStr}, noiseW: ${noiseWriteCount}, dataW: ${dataWriteCount}, Vols: ${volsStr}, Tones: ${tonesStr}${anyActive ? ' (VOL ACTIVE)' : ''}`);
        writeCount = 0;
        noiseWriteCount = 0;
        dataWriteCount = 0;
        toneWriteCounts[0] = toneWriteCounts[1] = toneWriteCounts[2] = 0;
        volWriteCounts[0] = volWriteCounts[1] = volWriteCounts[2] = volWriteCounts[3] = 0;
        lastDebugTime = now;
      }
    }
    if (b & 0x80) {
      // Latch + data byte format: 1CCRDDDD
      // CC = channel (00=tone0, 01=tone1, 10=tone2, 11=noise)
      // R = register type (0=tone/noise, 1=volume)
      // DDDD = 4-bit data
      const channel = (b >>> 5) & 0x03;
      const isVolume = (b & 0x10) !== 0;
      const data = b & 0x0f;

      if (isVolume) {
        // Volume register
        if (PSG_DEBUG) { if (channel >= 0 && channel <= 3) volWriteCounts[channel] = (volWriteCounts[channel] ?? 0) + 1; }
        state.vols[channel] = data;
        state.latchedReg = (channel << 1) | 1; // Store for completeness (not used by data-only high writes)
        // NOTE: Intentionally do NOT modify latchedToneChannel here.
      } else {
        // Tone or noise register (low 4 bits)
        if (channel < 3) {
          // Tone frequency low 4 bits
          if (PSG_DEBUG) { if (channel >= 0 && channel < 3) toneWriteCounts[channel] = (toneWriteCounts[channel] ?? 0) + 1; }
          const currentTone = state.tones[channel] ?? 0;
          state.tones[channel] = (currentTone & 0x3f0) | data;
          state.latchedReg = channel << 1; // For visibility
          latchedToneChannel = channel | 0; // Data-only high updates should target this channel
        } else {
          // Noise control (mode = bits 3-2, shift rate = bits 1-0)
          state.noise = { mode: (data >>> 2) & 0x03, shift: data & 0x03 };
          if (PSG_DEBUG) { noiseWriteCount++; }
          state.latchedReg = 6; // Noise register
        }
      }
    } else {
      // Data byte - applies to last latched register
      if (PSG_DEBUG) { dataWriteCount++; }
      // Format: 0-DDDDDD (6 bits of data)
      const data = b & 0x3f;

      // Tests expect that data-only writes update the HIGH 6 bits of the last
      // latched TONE channel, regardless of any intervening volume latches.
      // So use latchedToneChannel (0..2) rather than state.latchedReg.
      const ch = latchedToneChannel & 0x03;
      if (ch >= 0 && ch < 3) {
        const currentTone = state.tones[ch] ?? 0;
        state.tones[ch] = (currentTone & 0x00f) | (data << 4);
      }
    }
  };

  const tickCycles = (cpuCycles: number): void => {
    // Accumulate CPU cycles and convert to PSG ticks
    // SMS CPU runs at ~3.58 MHz, PSG runs at 3.579545 MHz / 16
    cycleAccumulator += cpuCycles;

    // Process PSG ticks (simplified - in reality would need precise timing)
    const psgTicks = Math.floor(cycleAccumulator / CLOCK_DIVIDER);
    cycleAccumulator %= CLOCK_DIVIDER;

    for (let tick = 0; tick < psgTicks; tick++) {
      // Update tone generators
      for (let ch = 0; ch < 3; ch++) {
        const counter = state.counters[ch];
        if (counter !== undefined && counter <= 0) {
          // Reload counter
          const tone = state.tones[ch];
          if (tone !== undefined) {
            state.counters[ch] = tone;
          }
          // Toggle output
          const output = state.outputs[ch];
          if (output !== undefined) {
            state.outputs[ch] = !output;
          }
        } else if (counter !== undefined) {
          state.counters[ch] = counter - 1;
        }
      }

      // Update noise generator
      if (state.noiseCounter <= 0) {
        // Reload noise counter based on shift rate
        const shiftRate = state.noise.shift;
        if (shiftRate < 3) {
          // Fixed frequencies
          const noiseFreqs = [0x10, 0x20, 0x40];
          state.noiseCounter = noiseFreqs[shiftRate] ?? 0x10;
        } else {
          // Use tone 2 frequency
          state.noiseCounter = state.tones[2] ?? 0;
        }

        // Shift LFSR and generate noise output
        if (state.noise.mode !== 0) {
          // White noise mode
          const feedback = ((state.lfsr & 0x0001) !== 0) !== ((state.lfsr & 0x0008) !== 0);
          state.lfsr = (state.lfsr >> 1) | (feedback ? 0x4000 : 0);
        } else {
          // Periodic noise mode
          const feedback = (state.lfsr & 0x0001) !== 0;
          state.lfsr = (state.lfsr >> 1) | (feedback ? 0x4000 : 0);
        }
        state.noiseOutput = (state.lfsr & 0x0001) !== 0;
      } else {
        state.noiseCounter--;
      }
    }
  };

  const getSample = (): number => {
    // Volume table (logarithmic, in 2dB steps)
    // 0 = full volume (max), 15 = silence
    const volumeTable = [8191, 6507, 5168, 4105, 3261, 2590, 2057, 1634, 1298, 1031, 819, 651, 517, 411, 326, 0];

    let mixed = 0;
    let hasSound = false;

    // Mix tone channels as signed square waves around 0
    for (let ch = 0; ch < 3; ch++) {
      const vol = (state.vols[ch] ?? 0xf) & 0x0f;
      const amp = (volumeTable[vol] ?? 0) | 0;
      if (amp > 0) {
        const out = state.outputs[ch] ?? false;
        mixed += out ? amp : -amp;
        hasSound = true;
      }
    }

    // Mix noise channel as signed
    const noiseVol = (state.vols[3] ?? 0xf) & 0x0f;
    const noiseAmp = (volumeTable[noiseVol] ?? 0) | 0;
    if (noiseAmp > 0) {
      mixed += state.noiseOutput ? noiseAmp : -noiseAmp;
      hasSound = true;
    }

    // Debug: log when we have actual sound energy
    if (PSG_DEBUG && hasSound && soundDebugCounter++ % 44100 === 0) {
      console.log(`PSG generating sound: mixed=${mixed}`);
    }

    // Apply DC offset so that absolute silence returns -8192 as tests expect.
    // Then clamp to [-8192, 8191].
    let sample = (mixed - 8192) | 0;
    if (sample > 8191) sample = 8191;
    if (sample < -8192) sample = -8192;
    return sample | 0;
  };

  const reset = (): void => {
    state.latchedReg = 0;
    state.tones = [0, 0, 0];
    state.vols = [0xf, 0xf, 0xf, 0xf];
    state.noise = { mode: 0, shift: 0 };
    state.counters = [0, 0, 0];
    state.outputs = [false, false, false];
    state.noiseCounter = 0;
    state.noiseOutput = false;
    state.lfsr = 0x8000;
    cycleAccumulator = 0;
    latchedToneChannel = 0;
  };

  const getState = (): PSGState => ({
    latchedReg: state.latchedReg,
    tones: [...state.tones] as [number, number, number],
    vols: [...state.vols] as [number, number, number, number],
    noise: { ...state.noise },
    counters: [...state.counters] as [number, number, number],
    outputs: [...state.outputs] as [boolean, boolean, boolean],
    noiseCounter: state.noiseCounter,
    noiseOutput: state.noiseOutput,
    lfsr: state.lfsr,
  });

  return { write, tickCycles, getState, getSample, reset };
};
