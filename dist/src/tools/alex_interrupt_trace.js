import { readFileSync } from 'fs';
import { createMachine } from '../machine/machine.js';
const romFile = './Alex Kidd - The Lost Stars (UE) [!].sms';
const rom = new Uint8Array(readFileSync(romFile));
console.log('=== Alex Kidd Interrupt Trace ===\n');
const cart = { rom };
let eiFound = false;
let irqAccepted = false;
const m = createMachine({
    cart,
    fastBlocks: false,
    trace: {
        onTrace: (ev) => {
            // Check for EI instruction
            if (ev.opcode === 0xFB && !eiFound) {
                eiFound = true;
                console.log(`EI found at PC=0x${ev.pcBefore.toString(16).padStart(4, '0')}`);
            }
            // Check for interrupt acceptance
            if (ev.irqAccepted && !irqAccepted) {
                irqAccepted = true;
                console.log(`IRQ accepted at PC=0x${ev.pcBefore.toString(16).padStart(4, '0')}`);
            }
        },
        traceDisasm: false,
        traceRegs: false,
    }
});
const cyclesPerFrame = 59736;
console.log('Running for 300 frames (5 seconds)...\n');
for (let frame = 0; frame < 300; frame++) {
    m.runCycles(cyclesPerFrame);
    if (frame % 60 === 0) {
        const cpu = m.getCPU();
        const vdp = m.getVDP();
        const cpuState = cpu.getState();
        const vdpState = vdp.getState ? vdp.getState() : undefined;
        console.log(`Frame ${frame}:`);
        console.log(`  PC=0x${cpuState.pc.toString(16).padStart(4, '0')}, IFF1=${cpuState.iff1}, IM=${cpuState.im}`);
        if (vdpState) {
            console.log(`  VDP: Display=${vdpState.displayEnabled}, VBlank IRQ enabled=${vdpState.vblankIrqEnabled}`);
            console.log(`  VRAM writes=${vdpState.vramWrites}, non-zero=${vdpState.nonZeroVramWrites}`);
        }
    }
}
if (!eiFound) {
    console.log('\n⚠️ EI instruction was never executed!');
}
if (!irqAccepted) {
    console.log('⚠️ No IRQs were accepted!');
}
// Check final state
const cpu = m.getCPU();
const cpuState = cpu.getState();
console.log(`\nFinal state: PC=0x${cpuState.pc.toString(16).padStart(4, '0')}, IFF1=${cpuState.iff1}`);
// Look for EI in the ROM
console.log('\n=== Searching for EI instructions in ROM ===');
let eiLocations = [];
for (let i = 0; i < rom.length; i++) {
    if (rom[i] === 0xFB) {
        eiLocations.push(i);
        if (eiLocations.length <= 10) {
            // Show context
            const before = i > 0 ? rom[i - 1] : 0;
            const after = i < rom.length - 1 ? rom[i + 1] : 0;
            console.log(`  EI at 0x${i.toString(16).padStart(4, '0')}: [0x${before.toString(16).padStart(2, '0')} FB 0x${after.toString(16).padStart(2, '0')}]`);
        }
    }
}
console.log(`Total EI instructions found: ${eiLocations.length}`);
//# sourceMappingURL=alex_interrupt_trace.js.map