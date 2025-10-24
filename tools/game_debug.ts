#!/usr/bin/env npx tsx
import { createMachine } from '../src/machine/machine.js';
import { createCanvas } from 'canvas';
import * as fs from 'fs';
import * as path from 'path';

const runGame = (romPath: string, frames: number = 600, outputPrefix: string = 'game'): void => {
  // Load ROM
  if (!fs.existsSync(romPath)) {
    console.error(`ROM not found: ${romPath}`);
    process.exit(1);
  }

  const romBuffer = fs.readFileSync(romPath);
  const romData = new Uint8Array(romBuffer);
  console.log(`\n=== Loading: ${path.basename(romPath)} ===`);
  console.log(`ROM size: ${romData.length} bytes`);

  // Create machine
  const machine = createMachine({
    cart: { rom: romData },
    wait: { smsModel: false },
  });

  // Track state changes
  let lastVdpRegs = '';
  let lastBankConfig = '';
  let framesSinceChange = 0;
  let displayEnabledFrames = 0;
  let spritesDetected = false;

  // Simulate start button press after 2 seconds
  let startPressed = false;

  // Run frames
  for (let frame = 0; frame < frames; frame++) {
    // Simulate start button press at frame 120 (2 seconds)
    if (frame === 120 && !startPressed) {
      const bus = machine.getBus();
      if ("setController" in bus && typeof (bus as any).setController === "function") {
        // Press start button (bit 5 or 6 depending on the game)
        // SMS controller: bit 5=button2/start on some games
        (bus as any).setController(1, 0xdf); // Clear bit 5 (active low)
        startPressed = true;
      }
    }
    if (frame === 180 && startPressed) {
      const bus = machine.getBus();
      if ("setController" in bus && typeof (bus as any).setController === "function") {
        // Release start button
        (bus as any).setController(1, 0xff);
      }
    }

    // Run one frame worth of cycles (approx 59736 cycles per frame at NTSC)
    machine.runCycles(59736);

    // Sample every 60 frames (1 second at 60fps)
    if (frame % 60 === 0 || frame === frames - 1) {
      const cpu = machine.getCPU();
      const vdp = machine.getVDP();
      const bus = machine.getBus();

      // Get VDP state if available
      let regs = 'N/A';
      let displayOn = false;
      let vramPercent: number[] = [];
      let activeSprites = 0;

      if (vdp.getState) {
        const state = vdp?.getState?.() ?? {};
        regs = state.regs
          .slice(0, 11)
          .map((r: any) => r.toString(16).padStart(2, '0'))
          .join(' ');
        displayOn = state.displayEnabled;
        if (displayOn) displayEnabledFrames++;

        // Check VRAM usage
        const vramUsage = new Array(16).fill(0);
        for (let i = 0; i < 16384; i++) {
          if (state.vram[i] !== 0) {
            vramUsage[Math.floor(i / 1024)]++;
          }
        }
        vramPercent = vramUsage.map((v: any) => Math.round((v * 100) / 1024));

        // Check for sprites
        const satAddr = state.spriteAttrBase;
        for (let i = 0; i < 64; i++) {
          const y = state.vram[satAddr + i];
          if (y !== 0xd0 && y < 192) {
            // 0xd0 = sprite terminator
            activeSprites++;
          }
        }
        if (activeSprites > 0) spritesDetected = true;
      }

      // Bank configuration
      let bankConfig = 'N/A';
      if (bus.getROMBank) {
        bankConfig = `${bus.getROMBank(0)}:${bus.getROMBank(1)}:${bus.getROMBank(2)}`;
      }

      // Detect changes
      if (regs !== lastVdpRegs || bankConfig !== lastBankConfig) {
        framesSinceChange = 0;
      } else {
        framesSinceChange++;
      }

      const cpuState = cpu.getState();

      console.log(`\nFrame ${frame} (${(frame / 60).toFixed(1)}s):`);
      console.log(
        `PC: 0x${cpuState.pc.toString(16).padStart(4, '0')}, SP: 0x${cpuState.sp.toString(16).padStart(4, '0')}`
      );
      console.log(`VDP Regs: ${regs}`);
      console.log(`  Display: ${displayOn ? 'ON' : 'OFF'}, Sprites: ${activeSprites}`);
      console.log(`VRAM usage %: ${vramPercent.join(' ')}`);
      console.log(`Banks: ${bankConfig}`);

      if (framesSinceChange > 180) {
        console.log('⚠️ No state changes for 3+ seconds');
      }

      lastVdpRegs = regs;
      lastBankConfig = bankConfig;
    }
  }

  // Render final frame
  console.log('\n=== Rendering final frame ===');
  const finalVdp = machine.getVDP();
  if (finalVdp.renderFrame) {
    const frameData = finalVdp.renderFrame();

    const canvas = createCanvas(256, 192);
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(256, 192);

    // Convert RGB to RGBA
    for (let i = 0; i < 256 * 192; i++) {
      imageData.data[i * 4] = frameData[i * 3] ?? 0;
      imageData.data[i * 4 + 1] = frameData[i * 3 + 1] ?? 0;
      imageData.data[i * 4 + 2] = frameData[i * 3 + 2] ?? 0;
      imageData.data[i * 4 + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
    const outputPath = `${outputPrefix}_debug.png`;
    fs.writeFileSync(outputPath, canvas.toBuffer());
    console.log(`Saved to: ${outputPath}`);
  } else {
    console.log('Frame rendering not available');
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Display was enabled for ${displayEnabledFrames} samples`);
  console.log(`Sprites detected: ${spritesDetected ? 'Yes' : 'No'}`);

  const cpu = machine.getCPU();
  const cpuState = cpu.getState();
  if (cpuState.halted) {
    console.log('⚠️ CPU is halted');
  }

  // Check VRAM usage if getState available
  const vdp = machine.getVDP();
  if (vdp.getState) {
    const state = vdp?.getState?.() ?? {};
    let totalUsed = 0;
    for (const byte of state.vram) {
      if (byte !== 0) totalUsed++;
    }

    if (totalUsed < 1000) {
      console.log(`⚠️ Low VRAM usage: ${totalUsed}/16384 bytes`);
    } else {
      console.log(`✅ VRAM usage: ${totalUsed}/16384 bytes`);
    }
  }
};

// Parse command line
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: npx tsx tools/game_debug.ts <rom_path> [frames] [output_prefix]');
  console.log('Example: npx tsx tools/game_debug.ts roms/alexkidd.sms 600 alex');
  process.exit(1);
}

const romPath = args[0];
const frames = args[1] ? parseInt(args[1]) : 600;
const outputPrefix = args[2] || 'game';

runGame(romPath, frames, outputPrefix);
