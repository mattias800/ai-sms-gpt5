import { readFileSync } from 'fs';
import { createMachine } from '../machine/machine.js';
import { disassembleOne } from '../cpu/z80/disasm.js';
const romFile = './Alex Kidd - The Lost Stars (UE) [!].sms';
console.log('=== Alex Kidd Trace Analysis ===\n');
const rom = new Uint8Array(readFileSync(romFile));
console.log(`ROM size: ${rom.length / 1024}KB`);
// Check initial ROM content
console.log('\nFirst 128 bytes of ROM:');
for (let addr = 0; addr < 128; addr += 16) {
    let hex = '';
    let ascii = '';
    for (let i = 0; i < 16; i++) {
        const byte = rom[addr + i];
        hex += byte.toString(16).padStart(2, '0') + ' ';
        ascii += (byte >= 32 && byte < 127) ? String.fromCharCode(byte) : '.';
    }
    console.log(`0x${addr.toString(16).padStart(4, '0')}: ${hex} ${ascii}`);
}
// Disassemble first few instructions
console.log('\nFirst instructions:');
for (let addr = 0; addr < 32;) {
    const result = disassembleOne((a) => rom[a] ?? 0, addr);
    console.log(`0x${addr.toString(16).padStart(4, '0')}: ${result.text}`);
    addr += result.length;
}
const cart = { rom };
const m = createMachine({
    cart,
    fastBlocks: true,
    trace: {
        onTrace: (ev) => {
            if (ev.pcBefore < 10 || (ev.pcBefore >= 0x38 && ev.pcBefore < 0x50)) {
                console.log(`PC=${ev.pcBefore.toString(16).padStart(4, '0')}`);
            }
        },
        traceDisasm: false,
        traceRegs: false,
    }
});
console.log('\nRunning first 1000 cycles...');
m.runCycles(1000);
const cpu = m.getCPU();
const cpuState = cpu.getState();
console.log(`\nAfter 1000 cycles:`);
console.log(`PC=0x${cpuState.pc.toString(16).padStart(4, '0')}`);
console.log(`SP=0x${cpuState.sp.toString(16).padStart(4, '0')}`);
console.log(`IFF1=${cpuState.iff1}, IFF2=${cpuState.iff2}, IM=${cpuState.im}`);
// Check VDP state
const vdp = m.getVDP();
const vdpState = vdp.getState ? vdp.getState() : undefined;
if (vdpState) {
    console.log(`\nVDP State:`);
    console.log(`Display: ${vdpState.displayEnabled}`);
    console.log(`VRAM writes: ${vdpState.vramWrites}`);
    console.log(`Registers: [${vdpState.regs.slice(0, 8).join(', ')}]`);
}
// Run more and check for loops
console.log('\n\nRunning 10000 more cycles...');
const pcCounts = new Map();
let lastPC = 0;
const m2 = createMachine({
    cart,
    fastBlocks: true,
    trace: {
        onTrace: (ev) => {
            lastPC = ev.pcBefore;
            pcCounts.set(ev.pcBefore, (pcCounts.get(ev.pcBefore) ?? 0) + 1);
        },
        traceDisasm: false,
        traceRegs: false,
    }
});
m2.runCycles(10000);
console.log('\n\nMost visited PCs:');
const sorted = Array.from(pcCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
for (const [pc, count] of sorted) {
    const result = disassembleOne((a) => rom[a & 0x3fff] ?? 0, pc);
    console.log(`0x${pc.toString(16).padStart(4, '0')}: ${count}x - ${result.text}`);
}
//# sourceMappingURL=alex_trace.js.map