#!/usr/bin/env npx tsx
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

// Helper to encode RGB data to PNG
function encodeRGBtoPNG(rgb: Uint8Array, width: number, height: number): Buffer {
  const PNG = require('pngjs').PNG;
  const png = new PNG({ width, height });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const srcIdx = (width * y + x) * 3;
      png.data[idx] = rgb[srcIdx] ?? 0; // R
      png.data[idx + 1] = rgb[srcIdx + 1]; // G
      png.data[idx + 2] = rgb[srcIdx + 2]; // B
      png.data[idx + 3] = 255; // A
    }
  }

  return PNG.sync.write(png);
}

async function runVisualCheck() {
  // Create output directory
  const outputDir = join(process.cwd(), 'visual_output');
  mkdirSync(outputDir, { recursive: true });

  // Load Sonic ROM
  const romPath = join(process.cwd(), 'sonic.sms');
  let rom: Uint8Array;

  try {
    rom = new Uint8Array(readFileSync(romPath));
    console.log(`✓ Loaded ROM: ${romPath} (${rom.length} bytes)`);
  } catch (e) {
    console.error(`✗ Failed to load ROM: ${romPath}`);
    console.error(`  Please ensure the test ROM is present`);
    process.exit(1);
  }

  // Create emulator with fast block operations
  const cart: Cartridge = { rom };
  const machine = createMachine({ cart, fastBlocks: true });
  const vdp = machine.getVDP() as any;
  const cpu = machine.getCPU() as any;
  console.log('✓ Created SMS emulator and loaded ROM (with fast block ops)');

  // Run emulator and capture frames at various points
  // SMS runs at ~3.58MHz, so 3.58M cycles = 1 second
  const frameCaptures = [
    { cycles: 500000, name: 'frame_500k' },
    { cycles: 1000000, name: 'frame_1m' },
    { cycles: 3580000, name: 'frame_1sec' },
    { cycles: 7160000, name: 'frame_2sec' },
    { cycles: 10740000, name: 'frame_3sec' },
    { cycles: 17900000, name: 'frame_5sec' },
  ];

  let totalCycles = 0;

  for (const capture of frameCaptures) {
    const cyclesToRun = capture.cycles - totalCycles;
    console.log(`Running ${cyclesToRun} cycles (total: ${capture.cycles})...`);

    machine.runCycles(cyclesToRun);
    totalCycles = capture.cycles;

    // Get VDP state
    const vdpState = vdp.getState?.();

    console.log(`  VDP State at ${capture.cycles} cycles:`);
    console.log(`    - Display enabled: ${vdpState.displayEnabled}`);
    console.log(`    - VBlank IRQ enabled: ${vdpState.vblankIrqEnabled}`);
    console.log(`    - Name table base: 0x${vdpState.nameTableBase.toString(16).padStart(4, '0')}`);
    console.log(`    - BG pattern base: 0x${vdpState.bgPatternBase.toString(16).padStart(4, '0')}`);
    console.log(`    - Border color: ${vdpState.borderColor}`);
    console.log(`    - Current line: ${vdpState.line}`);
    console.log(`    - VRAM writes: ${vdpState.vramWrites}`);
    console.log(`    - Non-zero VRAM writes: ${vdpState.nonZeroVramWrites}`);
    console.log(`    - Last non-zero VRAM addr: 0x${vdpState.lastNonZeroVramAddr.toString(16).padStart(4, '0')}`);
    console.log(`    - CRAM writes: ${vdpState.cramWrites}`);

    // Check CPU state
    const cpuState = cpu.getState();
    console.log(`  CPU State:`);
    console.log(`    - PC: 0x${cpuState.pc.toString(16).padStart(4, '0')}`);
    console.log(`    - SP: 0x${cpuState.sp.toString(16).padStart(4, '0')}`);
    console.log(
      `    - A: 0x${cpuState.a.toString(16).padStart(2, '0')}, F: 0x${cpuState.f.toString(16).padStart(2, '0')}`
    );
    console.log(`    - BC: 0x${cpuState.b.toString(16).padStart(2, '0')}${cpuState.c.toString(16).padStart(2, '0')}`);
    console.log(`    - DE: 0x${cpuState.d.toString(16).padStart(2, '0')}${cpuState.e.toString(16).padStart(2, '0')}`);
    console.log(`    - HL: 0x${cpuState.h.toString(16).padStart(2, '0')}${cpuState.l.toString(16).padStart(2, '0')}`);
    console.log(`    - Halted: ${cpuState.halted}`);

    // Render frame
    const frameData = vdp.renderFrame?.();

    if (frameData && frameData.length === 256 * 192 * 3) {
      // Check if frame is all black
      const isBlack = frameData.every(b => b === 0);

      if (isBlack) {
        console.log(`  ⚠ Frame is all black`);
      } else {
        console.log(`  ✓ Frame has content`);

        // Count unique colors
        const colors = new Set<string>();
        for (let i = 0; i < frameData.length; i += 3) {
          const color = `${frameData[i]},${frameData[i + 1]},${frameData[i + 2]}`;
          colors.add(color);
        }
        console.log(`    - Unique colors: ${colors.size}`);
      }

      // Save frame as PNG
      const pngPath = join(outputDir, `${capture.name}.png`);
      try {
        const pngData = encodeRGBtoPNG(frameData, 256, 192);
        writeFileSync(pngPath, pngData);
        console.log(`  ✓ Saved frame to ${pngPath}`);
      } catch (e) {
        console.log(`  ⚠ Could not save PNG (pngjs not installed)`);
        // Save as raw RGB instead
        const rawPath = join(outputDir, `${capture.name}.rgb`);
        writeFileSync(rawPath, frameData);
        console.log(`  ✓ Saved raw RGB to ${rawPath}`);
      }
    } else {
      console.log(`  ✗ Invalid frame data (length: ${frameData?.length || 0})`);
    }

    console.log('');
  }

  console.log('Visual check complete!');
  console.log(`Output saved to: ${outputDir}/`);
}

// Run the visual check
runVisualCheck().catch(console.error);
