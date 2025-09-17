#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';

const main = () => {
  const mame = readFileSync('./traces/sms_lua.log', 'utf-8').trim().split(/\r?\n/)
    .filter(l => l.length > 0 && !l.startsWith('#'))
    .map(l => {
      const [frame, , pcHex] = l.split(/\s+/);
      return { frame: parseInt(frame, 10), pc: parseInt(pcHex, 16) & 0xffff };
    });

  const ours = readFileSync(0, 'utf-8').trim().split(/\r?\n/)
    .filter(l => l.length > 0)
    .map(l => {
      const [frame, , pcHex] = l.split(/\s+/);
      return { frame: parseInt(frame, 10), pc: parseInt(pcHex, 16) & 0xffff };
    });

  const maxFrames = Math.min(mame.length, ours.length);
  let firstDiff = -1;
  for (let i = 0; i < maxFrames; i++) {
    if (mame[i].pc !== ours[i].pc) { firstDiff = i; break; }
  }

  console.log(`Compared ${maxFrames} frames.`);
  if (firstDiff === -1) {
    console.log('No PC diffs in first window.');
  } else {
    console.log(`First PC diff at frame ${firstDiff+1}: MAME=0x${mame[firstDiff].pc.toString(16).padStart(4,'0')} ours=0x${ours[firstDiff].pc.toString(16).padStart(4,'0')}`);
    const start = Math.max(0, firstDiff - 10);
    const end = Math.min(maxFrames, firstDiff + 10);
    for (let i = start; i < end; i++) {
      const tag = i === firstDiff ? '<<' : '  ';
      console.log(`${tag} f=${i+1} MAME=0x${mame[i].pc.toString(16).padStart(4,'0')} ours=0x${ours[i].pc.toString(16).padStart(4,'0')}`);
    }
  }
};

main();
