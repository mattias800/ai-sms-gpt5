import { createMachine } from './src/machine/machine';
import { writeFileSync, readFileSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Debugging correct sprite flags reading');

const run = async () => {
  try {
    // Load ROM and BIOS files
    const romData = readFileSync('./sonic.sms');
    const biosData = readFileSync('./third_party/mame/roms/sms1/mpr-10052.rom');
    
    const machine = createMachine({
      cart: {
        rom: romData,
      },
      bus: {
        bios: biosData,
      },
    });

    // Run for 1000 frames (optimal title screen frame for Sonic)
    const cyclesPerFrame = 60000; // NTSC
    const totalCycles = 1000 * cyclesPerFrame;
    machine.runCycles(totalCycles);

    const vdp = machine.getVDP();
    const vdpState = vdp.getState();
    
    // Get VRAM data
    const vram = vdp.getVRAM?.();
    if (!vram) {
      console.log(`❌ VRAM not accessible`);
      return;
    }
    
    // Calculate sprite table addresses
    const spriteAttributeTableAddr = (vdpState.regs[8] & 0x7F) << 7;
    
    console.log(`\n=== SMS Sprite Attribute Table Structure ===`);
    console.log(`Sprite Attribute Table: 0x${spriteAttributeTableAddr.toString(16)}`);
    
    // Check the actual SMS sprite attribute table structure
    // SMS SAT: Y, X, Pattern, Flags (4 bytes per sprite)
    // Extended SAT: starts at SAT + 128, contains X, Pattern, Flags (3 bytes per sprite)
    
    console.log(`\n=== Sprite 10 Analysis (Potential Hand) ===`);
    const spriteNum = 10;
    
    // Read from basic SAT (first 4 bytes)
    const satAddr = spriteAttributeTableAddr + spriteNum * 4;
    const y = vram[satAddr] ?? 0;
    const x = vram[satAddr + 1] ?? 0;
    const pattern = vram[satAddr + 2] ?? 0;
    const flags = vram[satAddr + 3] ?? 0;
    
    console.log(`Basic SAT (4 bytes):`);
    console.log(`  Y: ${y}`);
    console.log(`  X: ${x}`);
    console.log(`  Pattern: ${pattern}`);
    console.log(`  Flags: 0x${flags.toString(16)}`);
    
    // Read from extended SAT (starts at SAT + 128)
    const extSatAddr = spriteAttributeTableAddr + 128 + spriteNum * 2;
    const extX = vram[extSatAddr] ?? 0;
    const extPattern = vram[extSatAddr + 1] ?? 0;
    const extFlags = vram[extSatAddr + 2] ?? 0;
    
    console.log(`Extended SAT (3 bytes):`);
    console.log(`  X: ${extX}`);
    console.log(`  Pattern: ${extPattern}`);
    console.log(`  Flags: 0x${extFlags.toString(16)}`);
    
    // Check which values are actually used
    console.log(`\n=== Which Values Are Used? ===`);
    console.log(`Current implementation uses:`);
    console.log(`  X: ${extX} (from extended SAT)`);
    console.log(`  Pattern: ${extPattern} (from extended SAT)`);
    console.log(`  Flags: ${extFlags} (from extended SAT + 2)`);
    
    // Check if the extended SAT + 2 is correct
    console.log(`\n=== Extended SAT + 2 Analysis ===`);
    console.log(`Extended SAT + 2 address: 0x${(extSatAddr + 2).toString(16)}`);
    console.log(`Value at that address: 0x${extFlags.toString(16)}`);
    
    // Check surrounding bytes
    for (let i = -2; i <= 2; i++) {
      const addr = extSatAddr + i;
      const value = vram[addr] ?? 0;
      console.log(`  Address 0x${addr.toString(16)}: 0x${value.toString(16)} ${i === 2 ? '<-- flags' : ''}`);
    }
    
    // Check if there's a different structure
    console.log(`\n=== Alternative Structure Check ===`);
    // Maybe the extended SAT is 4 bytes per sprite, not 2?
    const altExtSatAddr = spriteAttributeTableAddr + 128 + spriteNum * 4;
    const altX = vram[altExtSatAddr] ?? 0;
    const altPattern = vram[altExtSatAddr + 1] ?? 0;
    const altFlags = vram[altExtSatAddr + 2] ?? 0;
    const altExtra = vram[altExtSatAddr + 3] ?? 0;
    
    console.log(`Alternative Extended SAT (4 bytes):`);
    console.log(`  X: ${altX}`);
    console.log(`  Pattern: ${altPattern}`);
    console.log(`  Flags: 0x${altFlags.toString(16)}`);
    console.log(`  Extra: 0x${altExtra.toString(16)}`);
    
    // Check what the current VDP code is actually reading
    console.log(`\n=== Current VDP Implementation ===`);
    const currentSatXAddr = (spriteAttributeTableAddr + 128 + spriteNum * 2) & 0x3fff;
    const currentX = vram[currentSatXAddr] ?? 0;
    const currentPattern = vram[currentSatXAddr + 1] ?? 0;
    const currentFlags = vram[(currentSatXAddr + 2) & 0x3fff] ?? 0;
    
    console.log(`Current VDP reads:`);
    console.log(`  X: ${currentX}`);
    console.log(`  Pattern: ${currentPattern}`);
    console.log(`  Flags: 0x${currentFlags.toString(16)}`);
    
    // Analyze the flags
    console.log(`\n=== Flags Analysis ===`);
    console.log(`Flags 0x${currentFlags.toString(16)}:`);
    console.log(`  Bit 0 (flip X): ${(currentFlags & 0x01) ? 'Yes' : 'No'}`);
    console.log(`  Bit 1 (flip Y): ${(currentFlags & 0x02) ? 'Yes' : 'No'}`);
    console.log(`  Bit 2 (unused): ${(currentFlags & 0x04) ? 'Yes' : 'No'}`);
    console.log(`  Bit 3 (palette): ${(currentFlags & 0x08) ? 'Sprite palette (16-31)' : 'Background palette (0-15)'}`);
    console.log(`  Bit 4 (unused): ${(currentFlags & 0x10) ? 'Yes' : 'No'}`);
    console.log(`  Bit 5 (unused): ${(currentFlags & 0x20) ? 'Yes' : 'No'}`);
    console.log(`  Bit 6 (unused): ${(currentFlags & 0x40) ? 'Yes' : 'No'}`);
    console.log(`  Bit 7 (priority): ${(currentFlags & 0x80) ? 'High' : 'Low'}`);
    
  } catch (error) {
    console.log(`❌ Error: ${(error as Error).message}`);
  }
};

run();
