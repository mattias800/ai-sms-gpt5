import { readFileSync } from 'fs';
import { createMachine } from './src/machine/machine.js';

const rom = new Uint8Array(readFileSync('./sonic.sms'));
const cart = { rom };

const m = createMachine({
  cart,
  wait: { smsModel: true, includeWaitInCycles: false, vdpPenalty: 4 },
  bus: { allowCartRam: false }
});

console.log('Looking for Sonic sprites in actual gameplay...\n');

const cyclesPerFrame = 228 * 262;
let lastSpriteConfig = '';
let inGame = false;

for (let frame = 0; frame < 60 * 60; frame++) { // Run for up to 60 seconds
  m.runCycles(cyclesPerFrame);
  
  const vdp = m.getVDP();
  const state = vdp.getState?.();
  
  if (state && frame % 30 === 0) { // Check every half second
    const spriteAttrBase = ((state.regs[5] ?? 0) & 0x7e) << 7;
    
    // Look for sprites in typical Sonic positions (Y between 80-180)
    let sonicLikeSprites = [];
    
    for (let i = 0; i < 64; i++) {
      const y = state.vram[spriteAttrBase + i] ?? 0;
      
      if (y >= 80 && y < 180) { // Likely gameplay sprites
        const xAddr = spriteAttrBase + 128 + i * 2;
        const x = state.vram[xAddr] ?? 0;
        const pattern = state.vram[xAddr + 1] ?? 0;
        
        // Sonic is usually around the center/left of screen
        if (x >= 20 && x <= 160) {
          sonicLikeSprites.push({i, y, x, pattern});
        }
      }
    }
    
    const currentConfig = JSON.stringify(sonicLikeSprites);
    
    // If we have gameplay-like sprites and they're changing, we're probably in-game
    if (sonicLikeSprites.length >= 2 && currentConfig !== lastSpriteConfig) {
      if (!inGame) {
        console.log(`\n=== POSSIBLE GAMEPLAY DETECTED at frame ${frame} (${(frame/60).toFixed(1)}s) ===\n`);
        inGame = true;
      }
      
      console.log(`Frame ${frame}: ${sonicLikeSprites.length} potential gameplay sprites`);
      sonicLikeSprites.slice(0, 5).forEach(s => {
        console.log(`  Sprite ${s.i}: Y=${s.y}, X=${s.x}, Pattern=${s.pattern}`);
      });
      
      lastSpriteConfig = currentConfig;
    } else if (inGame && sonicLikeSprites.length === 0) {
      console.log(`\nGameplay sprites disappeared at frame ${frame}`);
      inGame = false;
    }
  }
}

// Check final state
const vdp = m.getVDP();
const state = vdp.getState?.();
if (state) {
  console.log('\n=== Final VDP State ===');
  console.log('Display:', state.displayEnabled ? 'ON' : 'OFF');
  console.log('Registers:', state.regs.slice(0, 16).map((r, i) => `R${i}=0x${r.toString(16)}`).join(', '));
  
  // Manually check what renderFrame would produce
  if (vdp.renderFrame) {
    const frame = vdp.renderFrame();
    let nonBlack = 0;
    for (let i = 0; i < frame.length; i += 3) {
      if (frame[i] !== 0 || frame[i+1] !== 0 || frame[i+2] !== 0) {
        nonBlack++;
      }
    }
    console.log(`Rendered frame has ${nonBlack} non-black pixels out of ${256*192}`);
  }
}
