import { readFileSync } from 'fs';
import { createMachine } from '../machine/machine.js';
async function main() {
    const rom = new Uint8Array(readFileSync('./sonic.sms'));
    const cart = { rom };
    let lastPC = 0;
    let callCount = 0;
    let step = 0;
    const m = createMachine({
        cart,
        fastBlocks: true,
        trace: {
            onTrace: (ev) => {
                const pc = (ev.pcBefore ?? 0) & 0xffff;
                step++;
                // Track calls to 0x4012
                if (pc === 0x02e2 && ev.opcode === 0xcd) {
                    callCount++;
                    console.log(`Step ${step}: CALL 4012 from PC=0x02e2 (count=${callCount})`);
                }
                // Track when we reach 0x4012
                if (pc === 0x4012) {
                    console.log(`Step ${step}: Reached 0x4012!`);
                    // Read what's at 0x4012 after bank switching
                    const bus = m.getBus();
                    console.log('\nCode at 0x4012 after bank switch:');
                    for (let i = 0; i < 16; i++) {
                        const byte = bus.read8(0x4012 + i);
                        process.stdout.write(byte.toString(16).padStart(2, '0') + ' ');
                    }
                    console.log('\n');
                    process.exit(0);
                }
                // Track JP 1C49
                if (pc === 0x02d4 && ev.opcode === 0xc3) {
                    console.log(`Step ${step}: JP 1C49 from PC=0x02d4`);
                }
                if (pc === 0x1c49) {
                    console.log(`Step ${step}: Reached 0x1c49!`);
                }
                lastPC = pc;
            },
            traceDisasm: false,
            traceRegs: false,
        },
    });
    // Help it get past the first HC wait
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
                return 0xb0; // Let it pass the first wait
            }
        }
        return origReadIO8(p);
    };
    const vdp = m.getVDP();
    const st0 = vdp.getState ? vdp.getState() : undefined;
    const cyclesPerFrame = (st0?.cyclesPerLine ?? 228) * (st0?.linesPerFrame ?? 262);
    console.log('Looking for jumps to key addresses...\n');
    // Run for many frames
    for (let frame = 0; frame < 100; frame++) {
        m.runCycles(cyclesPerFrame);
        if (frame === 10) {
            console.log('\nAfter 10 frames, still no jump to 0x4012 or 0x1c49');
            console.log(`Last PC: 0x${lastPC.toString(16).padStart(4, '0')}`);
            break;
        }
    }
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=find_jump.js.map