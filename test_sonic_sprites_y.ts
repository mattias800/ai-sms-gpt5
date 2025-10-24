import { readFileSync } from 'fs';
import { createMachine } from './src/machine/machine.js';

const rom = new Uint8Array(readFileSync('./sonic.sms'));
const cart = { rom };

const m = createMachine({
  cart,
  wait: { smsModel: true, includeWaitInCycles: false, vdpPenalty: 4 },
  bus: { allowCartRam: false }
});

// Run for 20 seconds to get into actual gameplay
const cyclesPerFrame = 228 * 262; 
const totalFrames = 60 * 20; // 20 seconds

console.log('Running Sonic for 20 seconds to reach gameplay...\n');

for (let frame = 0; frame < totalFrames; frame++) {
  m.runCycles(cyclesPerFrame);
  
  const vdp = m.getVDP();
  const state = vdp.getState?.();
  
  if (state && frame % 60 === 0) { // Check every second
    const spriteAttrBase = ((state.regs[5] ?? 0) & 0x7e) << 7;
    
    // Count visible sprites
    let visibleCount = 0;
    let offscreenCount = 0;
    let terminatorCount = 0;
    
    for (let i = 0; i < 64; i++) {
      const y = state.vram[spriteAttrBase + i] ?? 0;
      
      if (y === 0xd0) {
        terminatorCount++;
      } else if (y >= 0xe0) {
        offscreenCount++;
      } else {
        // Check if sprite would actually be visible after Y+1 adjustment
        const displayY = (y + 1) & 0xff;
        
        // This sprite should be visible if displayY is < 192 (at least partially)
        if (displayY < 208) { // 192 + 16 for max sprite height
          visibleCount++;
        }
      }
    }
    
    if (visibleCount > 0 || frame >= 600) { // After 10 seconds
      console.log(`Frame ${frame} (${frame/60}s):`);
      console.log(`  Visible sprites: ${visibleCount}`);
      console.log(`  Off-screen (Y>=0xE0): ${offscreenCount}`);
      console.log(`  Terminators (Y=0xD0): ${terminatorCount}`);
      
      // Show details of first few visible sprites
      if (visibleCount > 0) {
        console.log('  First few visible sprites:');
        let shown = 0;
        for (let i = 0; i < 64 && shown < 3; i++) {
          const y = state.vram[spriteAttrBase + i] ?? 0;
          if (y < 0xd0 || (y > 0xd0 && y < 0xe0)) {
            const xAddr = spriteAttrBase + 128 + i * 2;
            const x = state.vram[xAddr] ?? 0;
            const pattern = state.vram[xAddr + 1] ?? 0;
            const displayY = (y + 1) & 0xff;
            console.log(`    Sprite ${i}: Y=${y} (display=${displayY}), X=${x}, Pattern=${pattern}`);
            shown++;
          }
        }
      }
      console.log();
    }
  }
}

// Now check specifically what's at the current frame
const vdp = m.getVDP();
const finalState = vdp.getState?.();
if (finalState) {
  console.log('\nFinal state check:');
  console.log('Display enabled:', finalState.displayEnabled);
  console.log('Sprite Pattern Base:', (finalState.regs[6] & 0x04) ? '0x2000' : '0x0000');
  
  // Check if sprite patterns actually have data
  const spritePatternBase = (finalState.regs[6] & 0x04) ? 0x2000 : 0x0000;
  let nonZeroPatternBytes = 0;
  for (let i = 0; i < 256 * 32; i++) { // Check first 256 sprite patterns
    if (finalState.vram[spritePatternBase + i] !== 0) {
      nonZeroPatternBytes++;
    }
  }
  console.log(`Non-zero bytes in sprite pattern area: ${nonZeroPatternBytes} / ${256*32}`);
}
