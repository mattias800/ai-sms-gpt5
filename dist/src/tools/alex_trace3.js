import { readFileSync } from 'fs';
import { createMachine } from '../machine/machine.js';
import { disassembleOne } from '../cpu/z80/disasm.js';
const romFile = './Alex Kidd - The Lost Stars (UE) [!].sms';
const rom = new Uint8Array(readFileSync(romFile));
console.log('=== Checking what happens after INC HL ===\n');
// Disassemble from 0x69 onward
console.log('Code from 0x0069:');
for (let addr = 0x69; addr < 0x80;) {
    const result = disassembleOne((a) => rom[a] ?? 0, addr);
    const bytes = result.bytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`0x${addr.toString(16).padStart(4, '0')}: ${bytes.padEnd(12)} ${result.text}`);
    addr += result.length;
}
// The problem is at 0x006F (after INC HL)
console.log('\nBytes at critical locations:');
console.log(`0x006E: 0x${rom[0x6E]?.toString(16).padStart(2, '0')} (INC HL)`);
console.log(`0x006F: 0x${rom[0x6F]?.toString(16).padStart(2, '0')}`);
console.log(`0x0070: 0x${rom[0x70]?.toString(16).padStart(2, '0')}`);
// Check what instruction is missing
const missing = disassembleOne((a) => rom[a] ?? 0, 0x6F);
console.log(`\n0x006F instruction: ${missing.text}`);
// Run with more detailed error trapping
const cart = { rom };
const m = createMachine({
    cart,
    fastBlocks: false, // Disable fast blocks to see every instruction
    trace: {
        onTrace: (ev) => {
            if (ev.pcBefore >= 0x69 && ev.pcBefore < 0x80) {
                const result = disassembleOne((a) => rom[a & 0x3fff] ?? 0, ev.pcBefore);
                console.log(`PC=0x${ev.pcBefore.toString(16).padStart(4, '0')}: ${result.text}`);
            }
        },
        traceDisasm: false,
        traceRegs: false,
    }
});
console.log('\n=== Running emulation ===\n');
try {
    m.runCycles(1000);
}
catch (e) {
    console.log('Error during execution:', e);
}
const cpu = m.getCPU();
const cpuState = cpu.getState();
console.log(`\nFinal PC=0x${cpuState.pc.toString(16).padStart(4, '0')}`);
//# sourceMappingURL=alex_trace3.js.map