import { readFileSync } from 'fs';
import { createMachine } from './src/machine/machine.js';
import { createController } from './src/io/controller.js';

const rom = new Uint8Array(readFileSync('./sonic.sms'));
const m = createMachine({ cart: { rom }, wait: { smsModel: true, includeWaitInCycles: false, vdpPenalty: 4 }, bus: { allowCartRam: false }, controller1: createController(), controller2: createController() });

const cyclesPerFrame = 228*262;
for (let i=0;i<60*3;i++) m.runCycles(cyclesPerFrame);
// press start briefly
const c1 = createController();
m.runCycles(cyclesPerFrame*30);
for (let i=0;i<60*12;i++) m.runCycles(cyclesPerFrame);

const vdp = m.getVDP();
const st = vdp.getState?.();
if (!st) throw new Error('no vdp state');

function countRange(base:number, len:number){
  let nz=0; for (let i=0;i<len;i++){ if ((st.vram[base+i]??0)!==0) nz++; }
  return nz;
}

const ranges = [
  {name:'pat0-4K', base:0x0000, len:0x1000},
  {name:'pat4K-8K', base:0x1000, len:0x1000},
  {name:'pat8K-12K', base:0x2000, len:0x1000},
  {name:'pat12K-16K', base:0x3000, len:0x1000},
  {name:'name-0x3800-0x3C00', base:0x3800, len:0x400},
  {name:'sat-0x3F00-0x3F80', base:0x3f00, len:0x80},
  {name:'satx-0x3F80-0x4000', base:0x3f80, len:0x80},
];

const result:any = { regs: st.regs.slice(0,16), ranges: {} };
for (const r of ranges){
  result.ranges[r.name] = countRange(r.base, r.len);
}
console.log(JSON.stringify(result,null,2));
