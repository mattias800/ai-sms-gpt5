import { readFileSync } from 'fs';
import { createMachine } from '../machine/machine.js';
async function main() {
    const rom = new Uint8Array(readFileSync('./sonic.sms'));
    const cart = { rom };
    let lastPC = 0;
    let cycleCount = 0;
    const pcHistory = new Map();
    let eiFound = false;
    let firstEIPC = 0;
    const m = createMachine({
        cart,
        fastBlocks: true,
        trace: {
            onTrace: (ev) => {
                lastPC = (ev.pcBefore ?? 0) & 0xffff;
                cycleCount += ev.cycles;
                // Track PC frequency
                const count = pcHistory.get(lastPC) || 0;
                pcHistory.set(lastPC, count + 1);
                // Check for EI instruction
                if (ev.opcode === 0xfb && !eiFound) {
                    eiFound = true;
                    firstEIPC = lastPC;
                    console.log(`Found EI at PC=0x${lastPC.toString(16).padStart(4, '0')} after ${cycleCount} cycles`);
                }
                // Stop if we hit a specific address multiple times (stuck in loop)
                if (count > 100000) {
                    console.log(`Stuck at PC=0x${lastPC.toString(16).padStart(4, '0')} (${count} executions)`);
                    process.exit(0);
                }
            },
            traceDisasm: false,
            traceRegs: false,
        },
    });
    const vdp = m.getVDP();
    const st0 = vdp.getState ? vdp.getState() : undefined;
    const cyclesPerFrame = (st0?.cyclesPerLine ?? 228) * (st0?.linesPerFrame ?? 262);
    console.log('Running Sonic boot sequence...');
    console.log('Looking for EI instruction or stuck loops...');
    // Run for up to 100 frames
    for (let frame = 0; frame < 100; frame++) {
        m.runCycles(cyclesPerFrame);
        if (eiFound) {
            console.log(`EI found! Continuing for a few more frames...`);
            // Run 10 more frames after finding EI
            for (let i = 0; i < 10; i++) {
                m.runCycles(cyclesPerFrame);
            }
            break;
        }
    }
    // Print top PC locations
    const topPCs = Array.from(pcHistory.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    console.log('\nTop 10 most executed PCs:');
    for (const [pc, count] of topPCs) {
        console.log(`  0x${pc.toString(16).padStart(4, '0')}: ${count} times`);
    }
    const vdpState = vdp.getState ? vdp.getState() : undefined;
    console.log(`\nVDP State:`);
    console.log(`  Display: ${vdpState?.displayEnabled ? 'ON' : 'OFF'}`);
    console.log(`  VBlank IRQ: ${vdpState?.vblankIrqEnabled ? 'ON' : 'OFF'}`);
    console.log(`  VRAM writes: ${vdpState?.vramWrites}`);
    console.log(`  CRAM writes: ${vdpState?.cramWrites}`);
    if (!eiFound) {
        console.log('\nNo EI instruction found during boot!');
        console.log('The game never enables interrupts, which is very unusual.');
    }
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=test_sonic_boot.js.map