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

  // PSG clock is 3.579545 MHz / 16 = 223.72 kHz
  const PSG_CLOCK = 3579545;
  const CLOCK_DIVIDER = 16;
  let cycleAccumulator = 0;

  const write = (val: number): void => {
    const b = val & 0xff;
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
        state.vols[channel] = data;
        state.latchedReg = (channel << 1) | 1; // Store for data writes
      } else {
        // Tone or noise register (low 4 bits)
        if (channel < 3) {
          // Tone frequency low 4 bits
          const currentTone = state.tones[channel] ?? 0;
          state.tones[channel] = (currentTone & 0x3f0) | data;
          state.latchedReg = channel << 1; // Store channel for subsequent data writes
        } else {
          // Noise control
          state.noise = { mode: (data >>> 2) & 0x01, shift: data & 0x03 };
          state.latchedReg = 6; // Noise register
        }
      }
    } else {
      // Data byte - applies to last latched register
      // Format: 0-DDDDDD (6 bits of data)
      const data = b & 0x3f;
      const reg = state.latchedReg;

      // Data writes only update tone frequency high bits
      if (reg < 6 && (reg & 1) === 0) {
        // Tone register high 6 bits
        const channel = reg >> 1;
        if (channel < 3) {
          const currentTone = state.tones[channel] ?? 0;
          state.tones[channel] = (currentTone & 0x00f) | (data << 4);
        }
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
        if (state.noise.mode & 0x04) {
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
    // 0 = full volume, 15 = silence
    const volumeTable = [8191, 6507, 5168, 4105, 3261, 2590, 2057, 1634, 1298, 1031, 819, 651, 517, 411, 326, 0];

    let sample = 0;

    // Mix tone channels
    for (let ch = 0; ch < 3; ch++) {
      if (state.outputs[ch]) {
        const vol = state.vols[ch];
        if (vol !== undefined) {
          const tableVal = volumeTable[vol & 0x0f];
          if (tableVal !== undefined) {
            sample += tableVal;
          }
        }
      }
    }

    // Mix noise channel
    if (state.noiseOutput) {
      const noiseVol = state.vols[3];
      if (noiseVol !== undefined) {
        const tableVal = volumeTable[noiseVol & 0x0f];
        if (tableVal !== undefined) {
          sample += tableVal;
        }
      }
    }

    // Convert to signed 16-bit range
    return (sample - 16384) >> 1;
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
