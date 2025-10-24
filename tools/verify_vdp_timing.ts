import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

// SMS VDP timing constants (NTSC)
const VDP_TIMING = {
  CYCLES_PER_SCANLINE: 228, // CPU cycles per scanline
  ACTIVE_SCANLINES: 192, // Visible scanlines
  VBLANK_SCANLINES: 70, // VBlank scanlines (262 total - 192 active)
  TOTAL_SCANLINES: 262, // Total scanlines per frame (NTSC)
  CYCLES_PER_FRAME: 59736, // 228 * 262
  HBLANK_START: 171, // Approximate cycle when HBlank starts
  VBLANK_START_LINE: 192, // Line where VBlank starts
  VBLANK_IRQ_LINE: 192, // Line where VBlank IRQ triggers
};

console.log('=== VDP Timing Verification ===\n');

// Test VBlank timing
function testVBlankTiming(): void {
  console.log('Testing VBlank timing...');

  const rom = new Uint8Array(0x4000);
  // Enable interrupts and wait for VBlank
  rom[0x0000] = 0xfb; // EI
  rom[0x0001] = 0x00; // NOP (wait for interrupt)
  rom[0x0002] = 0x18; // JR
  rom[0x0003] = 0xfd; // -3 (loop)

  // Interrupt handler at 0x0038
  rom[0x0038] = 0x3e; // LD A,n
  rom[0x0039] = 0x01; // 0x01
  rom[0x003a] = 0x32; // LD (nn),A
  rom[0x003b] = 0x00; // Address low
  rom[0x003c] = 0xc0; // Address high (0xC000)
  rom[0x003d] = 0xc9; // RET

  const cart: Cartridge = { rom };
  const m = createMachine({ cart, fastBlocks: false });
  const cpu = m.getCPU();
  const vdp = m.getVDP();
  const bus = m.getBus();

  // Enable VBlank interrupts in VDP
  vdp.writePort(0xbf, 0x81); // Register 1, enable frame interrupt
  vdp.writePort(0xbf, 0x81);

  let totalCycles = 0;
  let vblankCount = 0;
  let lastVBlankCycle = 0;

  // Run for exactly 3 frames
  for (let frame = 0; frame < 3; frame++) {
    let cyclesInFrame = 0;

    while (cyclesInFrame < VDP_TIMING.CYCLES_PER_FRAME) {
      const result = cpu.stepOne();
      cyclesInFrame += result.cycles;
      totalCycles += result.cycles;

      // Tick VDP
      vdp.tickCycles(result.cycles);

      // Check for VBlank IRQ
      if (vdp.hasIRQ()) {
        cpu.requestIRQ();

        // Check if interrupt was handled (memory write at 0xC000)
        if (bus.read8(0xc000) === 0x01) {
          vblankCount++;
          const cyclesSinceLastVBlank = totalCycles - lastVBlankCycle;
          if (lastVBlankCycle > 0) {
            const expectedCycles = VDP_TIMING.CYCLES_PER_FRAME;
            const deviation = Math.abs(cyclesSinceLastVBlank - expectedCycles);
            if (deviation <= 10) {
              // Allow small deviation
              console.log(
                `  ✅ Frame ${frame}: VBlank after ${cyclesSinceLastVBlank} cycles (expected ${expectedCycles})`
              );
            } else {
              console.log(
                `  ❌ Frame ${frame}: VBlank after ${cyclesSinceLastVBlank} cycles (expected ${expectedCycles}, deviation: ${deviation})`
              );
            }
          }
          lastVBlankCycle = totalCycles;
          bus.write8(0xc000, 0x00); // Clear flag
        }
      }
    }
  }

  if (vblankCount === 3) {
    console.log(`✅ VBlank count correct: ${vblankCount} in 3 frames`);
  } else {
    console.log(`❌ VBlank count incorrect: ${vblankCount} (expected 3)`);
  }
}

// Test HCounter timing
function testHCounterTiming(): void {
  console.log('\nTesting H-Counter timing...');

  const rom = new Uint8Array(0x4000);
  // Read H-counter multiple times
  let addr = 0;
  for (let i = 0; i < 10; i++) {
    rom[addr++] = 0xdb; // IN A,(n)
    rom[addr++] = 0x7e; // Port 0x7E (H-counter)
    rom[addr++] = 0x00; // NOP (delay)
  }
  rom[addr++] = 0x76; // HALT

  const cart: Cartridge = { rom };
  const m = createMachine({ cart, fastBlocks: false });
  const cpu = m.getCPU();
  const vdp = m.getVDP();

  const hCounterValues: number[] = [];
  let totalCycles = 0;

  // Run and collect H-counter values
  for (let i = 0; i < 10; i++) {
    const result = cpu.stepOne(); // IN A,(0x7E)
    totalCycles += result.cycles;
    vdp.tickCycles(result.cycles);

    const hCounter = vdp.readPort(0x7e);
    hCounterValues.push(hCounter);

    if (i > 0) {
      const delta = hCounter - hCounterValues[i - 1];
      // H-counter should increment based on cycles passed
      // Each H-counter unit represents approximately 2 CPU cycles
      const expectedDelta = Math.floor(result.cycles / 2);
      if (Math.abs(delta - expectedDelta) <= 2) {
        console.log(`  ✅ H-counter delta: ${delta} (cycles: ${result.cycles})`);
      } else {
        console.log(`  ❌ H-counter delta: ${delta}, expected ~${expectedDelta} (cycles: ${result.cycles})`);
      }
    }

    // NOP delay
    const nopResult = cpu.stepOne();
    totalCycles += nopResult.cycles;
    vdp.tickCycles(nopResult.cycles);
  }
}

// Test V-counter timing
function testVCounterTiming(): void {
  console.log('\nTesting V-Counter timing...');

  const rom = new Uint8Array(0x4000);
  // Wait one scanline between V-counter reads
  let addr = 0;
  for (let i = 0; i < 5; i++) {
    rom[addr++] = 0xdb; // IN A,(n)
    rom[addr++] = 0x7f; // Port 0x7F (V-counter)

    // Delay for approximately one scanline (228 cycles)
    // Using DJNZ loop: ~13 cycles per iteration
    rom[addr++] = 0x06; // LD B,n
    rom[addr++] = 17; // 17 iterations * 13 ≈ 221 cycles
    rom[addr++] = 0x10; // DJNZ
    rom[addr++] = 0xfe; // -2
  }
  rom[addr++] = 0x76; // HALT

  const cart: Cartridge = { rom };
  const m = createMachine({ cart, fastBlocks: false });
  const cpu = m.getCPU();
  const vdp = m.getVDP();

  const vCounterValues: number[] = [];

  for (let i = 0; i < 5; i++) {
    // Read V-counter
    cpu.stepOne(); // IN A,(0x7F)
    vdp.tickCycles(11);
    const vCounter = vdp.readPort(0x7f);
    vCounterValues.push(vCounter);

    // Delay loop
    cpu.stepOne(); // LD B,17
    vdp.tickCycles(7);

    // Execute DJNZ loop
    let loopCycles = 0;
    for (let j = 0; j < 17; j++) {
      const result = cpu.stepOne(); // DJNZ
      loopCycles += result.cycles;
      vdp.tickCycles(result.cycles);
    }

    if (i > 0) {
      const delta = vCounterValues[i] - vCounterValues[i - 1];
      // Should increment by 1 after ~228 cycles (one scanline)
      if (delta === 1 || (vCounterValues[i - 1] === 0xff && vCounterValues[i] === 0)) {
        console.log(
          `  ✅ V-counter incremented: ${vCounterValues[i - 1].toString(16).padStart(2, '0')} -> ${vCounterValues[i].toString(16).padStart(2, '0')}`
        );
      } else {
        console.log(
          `  ❌ V-counter unexpected: ${vCounterValues[i - 1].toString(16).padStart(2, '0')} -> ${vCounterValues[i].toString(16).padStart(2, '0')} (delta: ${delta})`
        );
      }
    }
  }
}

// Test scanline timing
function testScanlineTiming(): void {
  console.log('\nTesting scanline timing...');

  const cart: Cartridge = { rom: new Uint8Array(0x4000) };
  const m = createMachine({ cart, fastBlocks: false });
  const vdp = m.getVDP();

  // Track scanline changes
  let currentScanline = 0;
  let cyclesInScanline = 0;
  const scanlineCycles: number[] = [];

  // Run for one frame
  for (let cycle = 0; cycle < VDP_TIMING.CYCLES_PER_FRAME; cycle++) {
    vdp.tickCycles(1);
    cyclesInScanline++;

    const vCounter = vdp.readPort(0x7f);
    if (vCounter !== currentScanline) {
      scanlineCycles.push(cyclesInScanline);
      cyclesInScanline = 0;
      currentScanline = vCounter;
    }
  }

  // Check scanline timing
  let correctScanlines = 0;
  for (let i = 0; i < Math.min(10, scanlineCycles.length); i++) {
    if (scanlineCycles[i] === VDP_TIMING.CYCLES_PER_SCANLINE) {
      correctScanlines++;
    } else {
      console.log(`  ❌ Scanline ${i}: ${scanlineCycles[i]} cycles (expected ${VDP_TIMING.CYCLES_PER_SCANLINE})`);
    }
  }

  if (correctScanlines === Math.min(10, scanlineCycles.length)) {
    console.log(`  ✅ All tested scanlines have correct timing (${VDP_TIMING.CYCLES_PER_SCANLINE} cycles)`);
  }

  // Check total scanlines per frame
  console.log(`  Total scanlines in frame: ${scanlineCycles.length} (expected ${VDP_TIMING.TOTAL_SCANLINES})`);
}

// Test sprite collision flag timing
function testSpriteCollisionTiming(): void {
  console.log('\nTesting sprite collision flag...');

  const cart: Cartridge = { rom: new Uint8Array(0x4000) };
  const m = createMachine({ cart, fastBlocks: false });
  const vdp = m.getVDP();

  // Set up two overlapping sprites in VRAM
  // Sprite attribute table at 0x3F00
  vdp.writePort(0xbf, 0x00); // Address low
  vdp.writePort(0xbf, 0x7f); // Address high (0x3F00, write)

  // Sprite 0: Y=100, X=100
  vdp.writePort(0xbe, 100); // Y position

  // Sprite 1: Y=100, X=105 (overlapping)
  vdp.writePort(0xbe, 100); // Y position

  // Set X positions and patterns
  vdp.writePort(0xbf, 0x80); // Address low
  vdp.writePort(0xbf, 0x7f); // Address high (0x3F80, write)

  vdp.writePort(0xbe, 100); // Sprite 0 X
  vdp.writePort(0xbe, 0); // Sprite 0 pattern
  vdp.writePort(0xbe, 105); // Sprite 1 X (overlapping)
  vdp.writePort(0xbe, 0); // Sprite 1 pattern

  // Enable sprites
  vdp.writePort(0xbf, 0xe0); // Register 0
  vdp.writePort(0xbf, 0x81); // Register 1: enable display

  // Run one frame
  for (let cycle = 0; cycle < VDP_TIMING.CYCLES_PER_FRAME; cycle += 10) {
    vdp.tickCycles(10);
  }

  // Check collision flag
  const status = vdp.readPort(0xbf);
  if (status & 0x20) {
    // Bit 5 = sprite collision
    console.log('  ✅ Sprite collision flag set correctly');
  } else {
    console.log('  ❌ Sprite collision flag not set (overlapping sprites)');
  }
}

// Run all tests
testVBlankTiming();
testHCounterTiming();
testVCounterTiming();
testScanlineTiming();
testSpriteCollisionTiming();

console.log('\n=== VDP Timing Verification Complete ===');
