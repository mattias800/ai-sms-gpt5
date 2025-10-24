import { readFileSync } from 'fs';
import { createMachine } from './src/machine/machine.js';

const romPath = 'alexkidd.sms';
const romData = readFileSync(romPath);
const cart = { rom: romData };

const machine = createMachine({
  cart,
  trace: {
    onTrace: (ev) => {
      // Only trace every 1000th instruction to avoid spam
      if (ev.pcBefore % 1000 === 0) {
        console.log(`PC=0x${ev.pcBefore.toString(16).padStart(4, '0')} op=0x${ev.opcode?.toString(16).padStart(2, '0')} cycles=${ev.cycles}`);
        if (ev.text) console.log(`  ${ev.text}`);
      }
    },
    traceDisasm: false,
    traceRegs: false
  }
});

console.log('Testing Alex Kidd with fast block operations...\n');

// Track PC values to detect if we're stuck
const pcHistory: number[] = [];
const pcCounts = new Map<number, number>();

let frameCount = 0;
const maxFrames = 1200; // 20 seconds at 60fps

while (frameCount < maxFrames) {
  // Run one frame (262 scanlines * 228 cycles = 59736 cycles)
  machine.runCycles(59736);
  frameCount++;
  
  const cpu = machine.getCPU();
  const state = cpu.getState();
  const pc = state.pc & 0xffff;
  
  // Track PC frequency
  pcCounts.set(pc, (pcCounts.get(pc) || 0) + 1);
  
  // Check for potential infinite loops
  if (pcCounts.get(pc)! > 10000) {
    console.log(`\n*** POTENTIAL INFINITE LOOP DETECTED ***`);
    console.log(`PC=0x${pc.toString(16).padStart(4, '0')} executed ${pcCounts.get(pc)} times`);
    console.log(`Frame: ${frameCount}`);
    
    // Show recent PC history
    console.log('Recent PC history:');
    const recent = pcHistory.slice(-20);
    recent.forEach((p, i) => {
      console.log(`  ${i}: 0x${p.toString(16).padStart(4, '0')}`);
    });
    
    // Show top executed addresses
    console.log('\nTop executed addresses:');
    const sorted = Array.from(pcCounts.entries()).sort((a, b) => b[1] - a[1]);
    sorted.slice(0, 10).forEach(([addr, count]) => {
      console.log(`  0x${addr.toString(16).padStart(4, '0')}: ${count} times`);
    });
    
    break;
  }
  
  // Keep recent history
  pcHistory.push(pc);
  if (pcHistory.length > 100) {
    pcHistory.shift();
  }
  
  if (frameCount % 120 === 0) {
    console.log(`Frame ${frameCount}, PC=0x${pc.toString(16).padStart(4, '0')}`);
    
    // Check VDP state
    const vdp = machine.getVDP();
    const vdpState = vdp.getState();
    console.log(`  VDP Status: 0x${vdpState.status.toString(16).padStart(2, '0')}, Line: ${vdpState.line}, VBlank: ${vdpState.vblank}`);
  }
}

console.log(`\nTest complete. Processed ${frameCount} frames.`);

// Final state
const cpu = machine.getCPU();
const state = cpu.getState();
console.log(`Final PC=0x${state.pc.toString(16).padStart(4, '0')}`);
console.log(`Final BC=0x${((state.b << 8) | state.c).toString(16).padStart(4, '0')}`);
console.log(`Final HL=0x${((state.h << 8) | state.l).toString(16).padStart(4, '0')}`);
console.log(`Final DE=0x${((state.d << 8) | state.e).toString(16).padStart(4, '0')}`);

const vdp = machine.getVDP();
const vdpState = vdp.getState();
console.log(`Final VDP Status: 0x${vdpState.status.toString(16).padStart(2, '0')}`);
console.log(`Final VDP Line: ${vdpState.line}`);
console.log(`Final VDP VBlank: ${vdpState.vblank}`);
