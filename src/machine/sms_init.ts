/**
 * Manual SMS System Initialization
 * 
 * This replaces the SMS BIOS functionality by providing proper system initialization
 * that games expect. This eliminates BIOS compatibility issues and gives us full
 * control over the system setup.
 */

import { IZ80 } from '../cpu/z80/z80.js';
import type { Z80State } from '../cpu/z80/state.js';
import { IVDP } from '../vdp/vdp.js';
import { IPSG } from '../psg/sn76489.js';
import { IBus } from '../bus/bus.js';

export interface SMSInitConfig {
  cpu: IZ80;
  vdp: IVDP;
  psg: IPSG;
  bus: IBus;
}

/**
 * Initialize SMS system to a state that games expect
 * This replaces the BIOS initialization sequence
 */
export const initializeSMS = (config: SMSInitConfig): void => {
  const { cpu, vdp, psg, bus } = config;

  console.log('Initializing SMS system (replacing BIOS)...');

  // 1. CPU Initialization
  // Set up CPU state similar to BIOS startup
  const newState: Z80State = {
    pc: 0x0000,        // Start at cartridge
    sp: 0xDFF0,        // Stack pointer (SMS standard)
    a: 0x0000,         // A = 0x00
    f: 0x0000,         // F = 0x00
    b: 0x0000,         // B = 0x00
    c: 0x0000,         // C = 0x00
    d: 0x0000,         // D = 0x00
    e: 0x0000,         // E = 0x00
    h: 0x0000,         // H = 0x00
    l: 0x0000,         // L = 0x00
    a_: 0,             // A' = 0x00
    f_: 0,             // F' = 0x00
    b_: 0,             // B' = 0x00
    c_: 0,             // C' = 0x00
    d_: 0,             // D' = 0x00
    e_: 0,             // E' = 0x00
    h_: 0,             // H' = 0x00
    l_: 0,             // L' = 0x00
    ix: 0x0000,        // IX = 0x0000
    iy: 0x0000,        // IY = 0x0000
    i: 0,              // I = 0x00
    r: 0,              // R = 0x00
    iff1: false,       // Interrupts disabled initially
    iff2: false,       // Interrupts disabled initially
    im: 1,             // Interrupt mode 1 (SMS standard)
    halted: false,     // CPU running
  };
  cpu.setState(newState);

  // 2. VDP Initialization
  // Set up VDP registers to SMS defaults
  initializeVDP(vdp);

  // 3. PSG Initialization  
  // Set up PSG to silent state
  initializePSG(psg);

  // 4. Bus/Memory Initialization
  // Set up memory control and I/O
  initializeBus(bus);

  console.log('SMS system initialization complete');
};

/**
 * Initialize VDP to SMS defaults
 */
const initializeVDP = (vdp: IVDP): void => {
  console.log('Initializing VDP...');

  // VDP Register 0: Mode Control
  // Bit 0: External sync (0=disabled)
  // Bit 1: Mode 4 (0=disabled, SMS uses mode 4)
  // Bit 2: Shift sprites left (0=disabled)
  // Bit 3: Line interrupt (0=disabled)
  // Bit 4: Hide left 8 pixels (0=show)
  // Bit 5: Horizontal scroll lock (0=disabled)
  // Bit 6: Vertical scroll lock (0=disabled)
  // Bit 7: Screen disable (0=enabled)
  vdp.writePort(0xBF, 0x00); // Value
  vdp.writePort(0xBF, 0x80); // Register 0

  // VDP Register 1: Display Control
  // Bit 0: Zoom sprites (0=normal size)
  // Bit 1: 8x16 sprites (0=8x8)
  // Bit 2: Magnify (0=normal)
  // Bit 3: 224 lines (0=192 lines)
  // Bit 4: Line interrupt (0=disabled)
  // Bit 5: VBlank interrupt (1=enabled)
  // Bit 6: Display enable (1=enabled) - THIS IS THE KEY BIT!
  // Bit 7: Sprite shift (0=disabled)
  vdp.writePort(0xBF, 0x60); // Value (display enable + VBlank IRQ)
  vdp.writePort(0xBF, 0x81); // Register 1

  // VDP Register 2: Name Table Base Address
  // SMS typically uses 0x3800 for name table
  vdp.writePort(0xBF, 0x38); // Value
  vdp.writePort(0xBF, 0x82); // Register 2

  // VDP Register 3: Color Table Base Address  
  // SMS typically uses 0x2000 for color table
  vdp.writePort(0xBF, 0x20); // Value
  vdp.writePort(0xBF, 0x83); // Register 3

  // VDP Register 4: Pattern Table Base Address
  // SMS typically uses 0x0000 for pattern table
  vdp.writePort(0xBF, 0x00); // Value
  vdp.writePort(0xBF, 0x84); // Register 4

  // VDP Register 5: Sprite Attribute Table Base Address
  // SMS typically uses 0x3B00 for sprite table
  vdp.writePort(0xBF, 0x3B); // Value
  vdp.writePort(0xBF, 0x85); // Register 5

  // VDP Register 6: Sprite Pattern Table Base Address
  // SMS typically uses 0x0000 for sprite patterns
  vdp.writePort(0xBF, 0x00); // Value
  vdp.writePort(0xBF, 0x86); // Register 6

  // VDP Register 7: Background Color
  // Set to black (color 0) by default; may be overridden by optional init below
  vdp.writePort(0xBF, 0x00); // Value
  vdp.writePort(0xBF, 0x87); // Register 7

  // Optional: Preload CRAM to non-black (blue) to mimic early splash palette.
  // Controlled via env SMS_INIT_BLUE_BG=1 so default test behavior is unchanged.
  try {
    const env = (typeof process !== 'undefined' && (process as any).env) ? (process as any).env : undefined;
    if (env && env.SMS_INIT_BLUE_BG && env.SMS_INIT_BLUE_BG !== '0') {
      // Program CRAM address 0 and write 32 entries of full blue (00BBGGRR, B=3 -> 0x30)
      const cramVal = 0x30 & 0x3f;
      // Set control address to 0x0000 with code=3 (CRAM)
      vdp.writePort(0xBF, 0x00);
      vdp.writePort(0xBF, 0xC0);
      for (let i = 0; i < 32; i++) vdp.writePort(0xBE, cramVal);
      // Ensure background color index points to a visible entry (0)
      vdp.writePort(0xBF, 0x00);
      vdp.writePort(0xBF, 0x87); // R7 <- 0
    }
  } catch {}

  // VDP Register 8: Horizontal Scroll
  vdp.writePort(0xBF, 0x00); // Value
  vdp.writePort(0xBF, 0x88); // Register 8

  // VDP Register 9: Vertical Scroll
  vdp.writePort(0xBF, 0x00); // Value
  vdp.writePort(0xBF, 0x89); // Register 9

  // VDP Register 10: Line Interrupt Counter
  vdp.writePort(0xBF, 0x00); // Value
  vdp.writePort(0xBF, 0x8A); // Register 10

  console.log('VDP initialized with SMS defaults');
};

/**
 * Initialize PSG to silent state
 */
const initializePSG = (psg: IPSG): void => {
  console.log('Initializing PSG...');

  // Silence all channels
  psg.write(0x9F); // Channel 0: silence
  psg.write(0xBF); // Channel 1: silence  
  psg.write(0xDF); // Channel 2: silence
  psg.write(0xFF); // Channel 3: silence

  console.log('PSG initialized (all channels silent)');
};

/**
 * Initialize bus and memory control
 */
const initializeBus = (bus: IBus): void => {
  console.log('Initializing bus...');

  // Memory control (port 0x3E)
  // Bit 0: RAM enable (0=disabled)
  // Bit 1: Slot 0 RAM (0=disabled)
  // Bit 2: BIOS disable (1=disabled, we're not using BIOS)
  // Bit 3: Cartridge RAM (0=disabled)
  // Bit 4-7: Unused
  bus.writeIO8(0x3E, 0x04); // Disable BIOS, enable basic functionality

  // I/O control (port 0x3F)
  // Bit 0-5: I/O direction (0=input)
  // Bit 6: TH-A output (0=input)
  // Bit 7: TH-B output (0=input)
  bus.writeIO8(0x3F, 0x00); // All inputs

  console.log('Bus initialized');
};

/**
 * Enable interrupts after initialization
 */
export const enableSMSInterrupts = (cpu: IZ80): void => {
  console.log('Enabling SMS interrupts...');
  
  const state = cpu.getState();
  const newState: Z80State = {
    ...state,
    iff1: true,  // Enable interrupts
    iff2: true,  // Enable interrupts
  };
  cpu.setState(newState);
  
  console.log('SMS interrupts enabled');
};
