import { createMachine } from '../src/machine/machine.js';
import { promises as fs } from 'fs';

/**
 * Trace the call stack around PSG writes to find who is calling the audio code
 */

const main = async () => {
  console.log('=== PSG WRITE CALL CONTEXT TRACE ===\n');

  const rom = new Uint8Array((await fs.readFile('./sonic.sms')).buffer);
  const m = createMachine({ cart: { rom }, bus: { allowCartRam: true } });
  const cpu = m.getCPU();
  const bus = m.getBus();

  // Capture stack context when writing to PSG
  const contextEvents: any[] = [];

  const targetPc = 0x447d; // Main PSG write location
  let inTargetCode = false;
  let stackBefore: number[] = [];

  // Tiny disasm to understand instructions
  const disasm = (pc: number, maxLines: number = 10): { pc: number; instr: string }[] => {
    const result = [];
    let addr = pc & 0xffff;
    for (let i = 0; i < maxLines; i++) {
      const b0 = bus.read8(addr) & 0xff;
      let instr = '';
      let len = 1;

      // Minimal disassembly for common instructions
      if (b0 === 0xc9) instr = 'RET';
      else if (b0 === 0xcd) {
        const lo = bus.read8((addr + 1) & 0xffff) & 0xff;
        const hi = bus.read8((addr + 2) & 0xffff) & 0xff;
        instr = `CALL 0x${((hi << 8) | lo).toString(16).padStart(4, '0')}`;
        len = 3;
      } else if (b0 === 0xe5) instr = 'PUSH HL';
      else if (b0 === 0xd5) instr = 'PUSH DE';
      else if (b0 === 0xc5) instr = 'PUSH BC';
      else if (b0 === 0xf5) instr = 'PUSH AF';
      else if (b0 === 0xe1) instr = 'POP HL';
      else if (b0 === 0xd1) instr = 'POP DE';
      else if (b0 === 0xc1) instr = 'POP BC';
      else if (b0 === 0xf1) instr = 'POP AF';
      else if (b0 === 0xd3) {
        const port = bus.read8((addr + 1) & 0xffff) & 0xff;
        instr = `OUT (0x${port.toString(16).padStart(2, '0')}),A`;
        len = 2;
      } else instr = `0x${b0.toString(16).padStart(2, '0')}`;

      result.push({ pc: addr, instr });
      addr = (addr + len) & 0xffff;
    }
    return result;
  };

  const originalWrite = bus.writeIO8.bind(bus);
  bus.writeIO8 = (port: number, val: number) => {
    if ((port & 0xff) === 0x7f || (port & 0xff) === 0xff) {
      const state = cpu.getState();
      const pc = state.pc & 0xffff;

      if (pc === targetPc) {
        if (!inTargetCode) {
          inTargetCode = true;
          // Record stack contents
          const sp = state.sp & 0xffff;
          stackBefore = [];
          for (let i = 0; i < 4; i++) {
            const addr = (sp + i * 2) & 0xffff;
            const lo = bus.read8(addr) & 0xff;
            const hi = bus.read8((addr + 1) & 0xffff) & 0xff;
            stackBefore.push((hi << 8) | lo);
          }

          contextEvents.push({
            type: 'PSG_WRITE_CONTEXT',
            pc,
            sp,
            stack: [...stackBefore],
            val: val & 0xff,
          });
        }
      } else if (inTargetCode && pc !== targetPc) {
        inTargetCode = false;
      }
    }
    return originalWrite(port, val);
  };

  // Trace to first PSG write
  console.log('Tracing to first PSG write at 0x447d...\n');

  const FRAME_CYCLES = 228 * 262;
  let cyclesExecuted = 0;
  const targetFrames = 5;

  while (cyclesExecuted < FRAME_CYCLES * targetFrames) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;
  }

  console.log(`Found ${contextEvents.length} PSG writes\n`);

  // Analyze first few PSG writes
  for (let i = 0; i < Math.min(3, contextEvents.length); i++) {
    const evt = contextEvents[i];
    console.log(`PSG Write #${i + 1}:`);
    console.log(`  PC=0x${evt.pc.toString(16).padStart(4, '0')}`);
    console.log(`  SP=0x${evt.sp.toString(16).padStart(4, '0')}`);
    console.log(`  Value=0x${evt.val.toString(16).padStart(2, '0')}`);
    console.log(`  Return addresses on stack:`);
    for (let j = 0; j < Math.min(2, evt.stack.length); j++) {
      const retAddr = evt.stack[j];
      console.log(`    [${j}] 0x${retAddr.toString(16).padStart(4, '0')}`);
      // Show code around return address
      const nearby = disasm(retAddr - 4, 8);
      for (const line of nearby) {
        const marker = line.pc === retAddr ? ' → ' : '   ';
        console.log(`      ${marker}0x${line.pc.toString(16).padStart(4, '0')}: ${line.instr}`);
      }
    }
    console.log();
  }

  console.log('\n=== CALL FLOW ANALYSIS ===');
  console.log('PSG tone/volume updates originate from:');
  console.log('- PC=0x447d (tone updates, every frame)');
  console.log('- PC=0x448f (data byte writes)');
  console.log('- PC=0x44b1 (noise channel, every frame)');
  console.log('\nThis appears to be running from VBlank ISR (called 28 times in 30 frames)');
  console.log('But ISR never writes unmute commands (no VOL writes with vol<15)');
  console.log('\nNext: Check if Sonic waits for START button or other condition to unmute');
};

main().catch(console.error);
