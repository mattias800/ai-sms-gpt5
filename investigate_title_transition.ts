#!/usr/bin/env tsx
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { createMachine } from './src/machine/machine.js';
import { PNG } from 'pngjs';

const main = async (): Promise<number> => {
  console.log('Deep investigation: Why doesn\'t Wonder Boy transition to title screen?\n');

  // Load ROM and BIOS
  const romPath = './wonderboy5.sms';
  const biosPath = './third_party/mame/roms/sms1/mpr-10052.rom';
  const romData = readFileSync(romPath);
  const biosData = readFileSync(biosPath);
  const cartridge = { rom: romData };

  const machine = createMachine({ cart: cartridge, useManualInit: false, bus: { bios: biosData } });
  const vdp = machine.getVDP();
  const cpu = machine.getCPU();
  const bus = machine.getBus();

  const st = vdp.getState?.();
  const cyclesPerLine = st?.cyclesPerLine ?? 228;
  const linesPerFrame = st?.linesPerFrame ?? 262;
  const cyclesPerFrame = cyclesPerLine * linesPerFrame;

  // Track detailed state changes
  let lastPC = 0;
  let lastR7 = 0;
  let lastDisplayState = false;
  let lastBiosState = false;
  let stateChanges: Array<{ frame: number, pc: number, r7: number, display: boolean, bios: boolean, description: string }> = [];

  console.log('=== Running 1000 frames with detailed state tracking ===');
  
  // Run for 1000 frames
  for (let f = 1; f <= 1000; f++) {
    machine.runCycles(cyclesPerFrame);
    
    const currentPC = cpu.getState().pc;
    const currentR7 = vdp.getState?.()?.regs?.[7] ?? 0;
    const currentDisplay = vdp.getState?.()?.displayEnabled ?? false;
    const busState = bus as any;
    const currentBios = busState.biosEnabled;
    
    // Track any state changes
    if (currentPC !== lastPC || currentR7 !== lastR7 || currentDisplay !== lastDisplayState || currentBios !== lastBiosState) {
      let description = '';
      if (currentPC !== lastPC) description += `PC: 0x${lastPC.toString(16).padStart(4,'0')} -> 0x${currentPC.toString(16).padStart(4,'0')} `;
      if (currentR7 !== lastR7) description += `R7: 0x${lastR7.toString(16).padStart(2,'0')} -> 0x${currentR7.toString(16).padStart(2,'0')} `;
      if (currentDisplay !== lastDisplayState) description += `Display: ${lastDisplayState ? 'ON' : 'OFF'} -> ${currentDisplay ? 'ON' : 'OFF'} `;
      if (currentBios !== lastBiosState) description += `BIOS: ${lastBiosState ? 'ON' : 'OFF'} -> ${currentBios ? 'ON' : 'OFF'} `;
      
      stateChanges.push({ frame: f, pc: currentPC, r7: currentR7, display: currentDisplay, bios: currentBios, description: description.trim() });
      
      lastPC = currentPC;
      lastR7 = currentR7;
      lastDisplayState = currentDisplay;
      lastBiosState = currentBios;
    }
    
    if (f % 100 === 0) {
      console.log(`Frame ${f}: PC=0x${currentPC.toString(16).padStart(4,'0')} Display=${currentDisplay ? 'ON' : 'OFF'} BIOS=${currentBios ? 'ON' : 'OFF'} R7=0x${currentR7.toString(16).padStart(2,'0')}`);
    }
  }

  console.log(`\n=== State Changes Summary ===`);
  console.log(`Total changes: ${stateChanges.length}`);
  stateChanges.forEach((change, i) => {
    console.log(`${i + 1}. Frame ${change.frame}: ${change.description}`);
  });

  // Analyze the pattern
  console.log(`\n=== Pattern Analysis ===`);
  const biosDisableFrame = stateChanges.find(change => change.description.includes('BIOS: ON -> OFF'));
  if (biosDisableFrame) {
    console.log(`BIOS disabled at frame ${biosDisableFrame.frame}`);
    console.log(`PC at BIOS disable: 0x${biosDisableFrame.pc.toString(16).padStart(4,'0')}`);
    console.log(`Display state at BIOS disable: ${biosDisableFrame.display ? 'ON' : 'OFF'}`);
    console.log(`R7 at BIOS disable: 0x${biosDisableFrame.r7.toString(16).padStart(2,'0')}`);
  } else {
    console.log('BIOS never disabled - Wonder Boy stuck in BIOS phase');
  }

  // Check if Wonder Boy is in a loop
  const pcValues = stateChanges.map(change => change.pc);
  const uniquePCs = [...new Set(pcValues)];
  console.log(`\nUnique PC values: ${uniquePCs.length}`);
  console.log(`PC range: 0x${Math.min(...uniquePCs).toString(16).padStart(4,'0')} - 0x${Math.max(...uniquePCs).toString(16).padStart(4,'0')}`);

  // Check if Wonder Boy is executing game ROM code
  const gameROMPCs = uniquePCs.filter(pc => pc >= 0x4000); // Game ROM typically starts at 0x4000
  console.log(`Game ROM PC values: ${gameROMPCs.length}`);
  if (gameROMPCs.length > 0) {
    console.log(`Game ROM PC range: 0x${Math.min(...gameROMPCs).toString(16).padStart(4,'0')} - 0x${Math.max(...gameROMPCs).toString(16).padStart(4,'0')}`);
  } else {
    console.log('Wonder Boy never executes game ROM code - stuck in BIOS');
  }

  return 0;
};

main().then(process.exit);
