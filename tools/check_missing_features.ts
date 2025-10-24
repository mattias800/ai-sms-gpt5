import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

function diagnoseGame(romPath: string, gameName: string): void {
  const rom = new Uint8Array(readFileSync(romPath));
  const cart: Cartridge = { rom };

  const spriteWrites = 0;
  const scrollWrites = 0;
  let controllerReads = 0;
  let soundWrites = 0;

  const m = createMachine({
    cart,
    wait: undefined,
    bus: { allowCartRam: false },
    fastBlocks: true,
  });

  // Intercept I/O operations
  const bus = m.getBus();
  const originalWriteIO = bus.writeIO8.bind(bus);
  const originalReadIO = bus.readIO8.bind(bus);

  bus.writeIO8 = (port: number, val: number) => {
    const p = port & 0xff;
    // PSG writes on port 0x7F
    if (p === 0x7f) soundWrites++;

    originalWriteIO(port, val);
  };

  bus.readIO8 = (port: number) => {
    const p = port & 0xff;
    // Controller ports 0xDC/0xDD
    if (p === 0xdc || p === 0xdd) controllerReads++;

    return originalReadIO(port);
  };

  // Run for 5 seconds
  const vdp = m.getVDP();
  const cyclesPerFrame = 228 * 262;
  const totalFrames = 300;

  console.log(`\n=== ${gameName} Feature Usage ===`);

  for (let frame = 0; frame < totalFrames; frame++) {
    m.runCycles(cyclesPerFrame);

    // Check VDP state periodically
    if (frame === totalFrames - 1) {
      const st = vdp.getState ? vdp.getState?.() : undefined;
      if (st) {
        // Check sprite attribute table
        const satBase = st.spriteAttrBase & 0x3f00;
        let activeSprites = 0;
        for (let i = 0; i < 64; i++) {
          const yPos = st.vram[satBase + i];
          if (yPos !== 0xd0 && yPos !== 0) {
            // 0xD0 = end marker
            activeSprites++;
          } else {
            break;
          }
        }

        // Check scroll registers
        const hScroll = st.regs[8] ?? 0;
        const vScroll = st.regs[9] ?? 0;

        console.log('\nVDP Analysis:');
        console.log(`  Active sprites: ${activeSprites}/64`);
        console.log(`  H-Scroll: ${hScroll}`);
        console.log(`  V-Scroll: ${vScroll}`);
        console.log(`  Display: ${st.displayEnabled ? 'ON' : 'OFF'}`);
        console.log(`  Sprite size: ${st.regs[1] & 0x02 ? '16x16' : '8x8'}`);
        console.log(`  VBlank IRQ: ${st.vblankIrqEnabled ? 'ON' : 'OFF'}`);
      }
    }
  }

  console.log('\nI/O Analysis:');
  console.log(`  Controller reads: ${controllerReads}`);
  console.log(`  Sound writes: ${soundWrites}`);

  // Check if game is waiting for input
  const cpu = m.getCPU();
  const cpuState = cpu.getState();
  console.log(`  CPU halted: ${cpuState.halted}`);
  console.log(`  Last PC: 0x${cpuState.pc.toString(16).padStart(4, '0')}`);
}

// Check both games
diagnoseGame('./sonic.sms', 'Sonic');
diagnoseGame('./alexkidd.sms', 'Alex Kidd');

console.log('\n=== Feature Priority ===');
console.log('Based on the analysis above:');
console.log("1. Sprites - Games are trying to use them but they're not rendered");
console.log('2. Controller Input - Games are reading controller state');
console.log('3. Sound - PSG writes are happening');
console.log('4. Scrolling - May be used for gameplay');
