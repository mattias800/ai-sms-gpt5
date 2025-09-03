import { readFileSync } from 'fs';
import { createMachine } from './build/machine/machine.js';

const rom = new Uint8Array(readFileSync('./Alex Kidd - The Lost Stars (UE) [!].sms'));
const cart = { rom };
const m = createMachine({ cart, fastBlocks: false });

let r4Writes = [];

// Hook into VDP to track R4 writes
const vdp = m.getVDP();
const originalWrite = vdp.write8.bind(vdp);
vdp.write8 = function(addr, val) {
  const result = originalWrite(addr, val);
  
  // Check if this was a register write
  if (addr === 0xbf) { // Control port
    const state = this.getState();
    if (state && state.lastRegWrite !== undefined && state.lastRegWrite.reg === 4) {
      r4Writes.push({
        frame: Math.floor(m.getCPU().getState().cycles / 59736),
        value: state.lastRegWrite.value,
        pc: m.getCPU().getState().pc.toString(16)
      });
    }
  }
  return result;
};

// Run for 120 frames
const cyclesPerFrame = 59736;
for (let frame = 0; frame < 120; frame++) {
  m.runCycles(cyclesPerFrame);
}

console.log('R4 writes:');
for (const write of r4Writes) {
  console.log(`  Frame ${write.frame}: R4 = 0x${write.value.toString(16)} (PC: 0x${write.pc})`);
}

const vdpState = vdp.getState();
console.log(`\nFinal R4: 0x${vdpState.regs[4].toString(16)}`);
console.log(`Bit 2 set: ${(vdpState.regs[4] & 0x04) !== 0}`);
