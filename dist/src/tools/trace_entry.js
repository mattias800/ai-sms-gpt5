import { readFileSync, writeFileSync } from 'fs';
import { createMachine } from '../machine/machine.js';
import { disassembleOne } from '../cpu/z80/disasm.js';
async function main() {
    const rom = new Uint8Array(readFileSync('./sonic.sms'));
    const cart = { rom };
    let lastPC = 0;
    let step = 0;
    const traceLog = [];
    const m = createMachine({
        cart,
        fastBlocks: true,
        trace: {
            onTrace: (ev) => {
                const pc = (ev.pcBefore ?? 0) & 0xffff;
                const bus = m.getBus();
                // Get disassembly
                const bytes = [];
                for (let i = 0; i < 4; i++) {
                    bytes.push(bus.read8(pc + i));
                }
                const readFn = (addr) => bytes[addr - pc] ?? 0;
                const dis = disassembleOne(readFn, pc);
                const line = `${step.toString().padStart(6, '0')}: PC=${pc.toString(16).padStart(4, '0')} ${dis.text.padEnd(20)} ; bytes: ${bytes.slice(0, dis.length).map(b => b.toString(16).padStart(2, '0')).join(' ')}`;
                traceLog.push(line);
                // Important transitions - look for when we first jump to 0x0284
                if (pc === 0x0284) {
                    console.log(`\nSTEP ${step}: Entering loop at 0x0284`);
                    console.log('Previous 20 instructions:');
                    for (let i = Math.max(0, traceLog.length - 20); i < traceLog.length; i++) {
                        console.log(traceLog[i]);
                    }
                    // Show bank registers
                    const bankRegs = bus.bankRegs;
                    if (bankRegs) {
                        console.log('\nBank registers at entry:');
                        console.log(`  Bank 0: 0x${bankRegs[0]?.toString(16).padStart(2, '0') ?? '??'}`);
                        console.log(`  Bank 1: 0x${bankRegs[1]?.toString(16).padStart(2, '0') ?? '??'}`);
                        console.log(`  Bank 2: 0x${bankRegs[2]?.toString(16).padStart(2, '0') ?? '??'}`);
                    }
                    // Show what the code looks like from 0x0280 to 0x02b5
                    console.log('\nMemory from 0x0280 to 0x02b5:');
                    for (let addr = 0x0280; addr <= 0x02b5; addr++) {
                        const b = bus.read8(addr);
                        if (addr % 16 === 0) {
                            process.stdout.write(`\n  0x${addr.toString(16).padStart(4, '0')}: `);
                        }
                        process.stdout.write(b.toString(16).padStart(2, '0') + ' ');
                    }
                    console.log('\n');
                    // Save full trace
                    writeFileSync('trace.txt', traceLog.join('\n'));
                    console.log('\nFull trace saved to trace.txt');
                    process.exit(0);
                }
                step++;
                lastPC = pc;
            },
            traceDisasm: false,
            traceRegs: false,
        },
    });
    // Help it get past HC waits
    const bus = m.getBus();
    const origReadIO8 = bus.readIO8.bind(bus);
    let hcReads = 0;
    bus.readIO8 = (port) => {
        const p = port & 0xff;
        if (p === 0x7e) {
            hcReads++;
            if (lastPC === 0x0003 || lastPC === 0x0005) {
                if (hcReads <= 2)
                    return 0x00;
                return 0xb0;
            }
        }
        return origReadIO8(p);
    };
    const vdp = m.getVDP();
    const st0 = vdp.getState ? vdp.getState() : undefined;
    const cyclesPerFrame = (st0?.cyclesPerLine ?? 228) * (st0?.linesPerFrame ?? 262);
    console.log('Tracing initialization to find jump to 0x0284...');
    // Run until we hit the bad loop
    for (let i = 0; i < 1000; i++) {
        m.runCycles(100);
        if (step > 10000) {
            console.log(`Exceeded 10000 steps without entering loop at 0x0284`);
            console.log(`Last PC: 0x${lastPC.toString(16).padStart(4, '0')}`);
            break;
        }
    }
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=trace_entry.js.map