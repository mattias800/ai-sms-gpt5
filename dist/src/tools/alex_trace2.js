import { readFileSync } from 'fs';
import { createMachine } from '../machine/machine.js';
import { disassembleOne } from '../cpu/z80/disasm.js';
const romFile = './Alex Kidd - The Lost Stars (UE) [!].sms';
console.log('=== Alex Kidd Detailed Trace ===\n');
const rom = new Uint8Array(readFileSync(romFile));
// Disassemble around 0xD8 (the jump target from 0x38)
console.log('Code around 0x00D8:');
for (let addr = 0xD0; addr < 0xF0;) {
    const result = disassembleOne((a) => rom[a] ?? 0, addr);
    console.log(`0x${addr.toString(16).padStart(4, '0')}: ${result.text}`);
    addr += result.length;
}
// Let's trace execution more carefully
const cart = { rom };
const visitedPCs = new Set();
let traceLog = [];
const m = createMachine({
    cart,
    fastBlocks: true,
    trace: {
        onTrace: (ev) => {
            if (!visitedPCs.has(ev.pcBefore)) {
                visitedPCs.add(ev.pcBefore);
                const result = disassembleOne((a) => rom[a & 0x3fff] ?? 0, ev.pcBefore);
                const entry = `PC=0x${ev.pcBefore.toString(16).padStart(4, '0')}: ${result.text}`;
                traceLog.push(entry);
                if (traceLog.length < 100) {
                    console.log(entry);
                }
            }
        },
        traceDisasm: false,
        traceRegs: false,
    }
});
console.log('\n=== Execution Trace (unique PCs only) ===\n');
m.runCycles(50000);
const cpu = m.getCPU();
const vdp = m.getVDP();
const cpuState = cpu.getState();
const vdpState = vdp.getState ? vdp.getState() : undefined;
console.log(`\n=== Final State ===`);
console.log(`PC=0x${cpuState.pc.toString(16).padStart(4, '0')}`);
console.log(`SP=0x${cpuState.sp.toString(16).padStart(4, '0')}`);
console.log(`IFF1=${cpuState.iff1}, IM=${cpuState.im}`);
if (vdpState) {
    console.log(`\nVDP:`);
    console.log(`Display: ${vdpState.displayEnabled}`);
    console.log(`VRAM writes: ${vdpState.vramWrites}`);
    console.log(`CRAM writes: ${vdpState.cramWrites}`);
}
console.log(`\nUnique PCs visited: ${visitedPCs.size}`);
// Check memory mapper state
const bus = m.getBus();
console.log(`\n=== Memory Mapper ===`);
console.log(`Bank 0xFFFC: 0x${bus.read8(0xFFFC).toString(16).padStart(2, '0')}`);
console.log(`Bank 0xFFFD: 0x${bus.read8(0xFFFD).toString(16).padStart(2, '0')}`);
console.log(`Bank 0xFFFE: 0x${bus.read8(0xFFFE).toString(16).padStart(2, '0')}`);
console.log(`Bank 0xFFFF: 0x${bus.read8(0xFFFF).toString(16).padStart(2, '0')}`);
//# sourceMappingURL=alex_trace2.js.map