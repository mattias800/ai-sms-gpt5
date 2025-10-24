import { readFileSync } from 'fs';
import { createMachine } from './src/machine/machine.js';
import { createController } from './src/io/controller.js';

const rom = new Uint8Array(readFileSync('./sonic.sms'));
const cart = { rom };

const controller1 = createController();
const controller2 = createController();

const m = createMachine({ cart, controller1, controller2, wait: { smsModel: true, includeWaitInCycles: false, vdpPenalty: 4 }, bus: { allowCartRam: false } });

const cyclesPerFrame = 228 * 262;

// Let boot for 3s
for (let i=0;i<3*60;i++) m.runCycles(cyclesPerFrame);

// Press Start (Button1) for 30 frames
controller1.setState({ button1: true });
for (let i=0;i<30;i++) m.runCycles(cyclesPerFrame);
controller1.setState({ button1: false });

// Run for 15 seconds into gameplay
for (let i=0;i<15*60;i++) m.runCycles(cyclesPerFrame);

const vdp = m.getVDP();
const st = vdp.getState?.();
if (!st) throw new Error('No VDP state');

const nameTableBase = (((st.regs[2] ?? 0) >> 1) & 0x07) << 11;
const spriteAttrBase = ((st.regs[5] ?? 0) & 0x7e) << 7;
const spritePatternBase = (st.regs[6] & 0x04) ? 0x2000 : 0x0000;
const hScroll = st.regs[8] ?? 0;
const vScroll = st.regs[9] ?? 0;

let visibleSprites = 0;
for (let i=0;i<64;i++){
  const y = st.vram[spriteAttrBase + i] ?? 0;
  if (y !== 0xd0 && y < 0xe0) visibleSprites++;
}

console.log(JSON.stringify({
  regs: st.regs.slice(0,16),
  nameTableBase: '0x'+nameTableBase.toString(16),
  spriteAttrBase: '0x'+spriteAttrBase.toString(16),
  spritePatternBase: '0x'+spritePatternBase.toString(16),
  hScroll, vScroll, visibleSprites,
}, null, 2));
