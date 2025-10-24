import { createMachine } from './src/machine/machine';
import { writeFileSync, readFileSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Debugging sprite rendering for Spy vs Spy title screen');

const run = async () => {
  // Load ROM and BIOS files
  const romData = readFileSync('./third_party/mame/roms/sms1/spyvsspy.sms');
  const biosData = readFileSync('./third_party/mame/roms/sms1/mpr-10052.rom');
  
  const machine = createMachine({
    cart: {
      rom: romData,
    },
    bus: {
      bios: biosData,
    },
  });

  // Run for 1300 frames (optimal title screen frame for Spy vs Spy)
  const cyclesPerFrame = 60000; // NTSC
  const totalCycles = 1300 * cyclesPerFrame;
  machine.runCycles(totalCycles);

  const vdp = machine.getVDP();
  const vdpState = vdp.getState();
  const cpuState = machine.getCPU().getState();

  console.log(`\n=== Frame 1300 VDP State ===`);
  console.log(`CPU PC: 0x${cpuState.pc.toString(16)}`);
  console.log(`Display enabled: ${vdpState.regs[1] & 0x40 ? '✅' : '❌'}`);
  console.log(`Background color (R7): 0x${vdpState.regs[7].toString(16)}`);
  
  // Check sprite-related registers
  console.log(`\n=== Sprite Registers ===`);
  console.log(`R1 (Display Control): 0x${vdpState.regs[1].toString(16)}`);
  console.log(`  - Display enable: ${vdpState.regs[1] & 0x40 ? 'ON' : 'OFF'}`);
  console.log(`  - Sprite enable: ${vdpState.regs[1] & 0x02 ? 'ON' : 'OFF'}`);
  console.log(`  - Sprite size: ${vdpState.regs[1] & 0x01 ? '8x16' : '8x8'}`);
  
  console.log(`R6 (Sprite Pattern Table): 0x${vdpState.regs[6].toString(16)}`);
  console.log(`R8 (Sprite Attribute Table): 0x${vdpState.regs[8].toString(16)}`);
  
  // Calculate sprite table addresses
  const spritePatternTableAddr = (vdpState.regs[6] & 0x07) << 11;
  const spriteAttributeTableAddr = (vdpState.regs[8] & 0x7F) << 7;
  
  console.log(`\n=== Sprite Table Addresses ===`);
  console.log(`Sprite Pattern Table: 0x${spritePatternTableAddr.toString(16)}`);
  console.log(`Sprite Attribute Table: 0x${spriteAttributeTableAddr.toString(16)}`);
  
  // Get VRAM data
  const vram = (vdp as any).vram;
  if (!vram) {
    console.log(`❌ VRAM not accessible`);
    return;
  }
  
  console.log(`\n=== Sprite Attribute Table Analysis ===`);
  console.log(`Reading sprite attributes from 0x${spriteAttributeTableAddr.toString(16)}:`);
  
  // Read sprite attribute table (64 sprites max)
  for (let i = 0; i < 64; i++) {
    const addr = spriteAttributeTableAddr + i * 4;
    if (addr + 3 >= vram.length) break;
    
    const y = vram[addr];
    const x = vram[addr + 1];
    const pattern = vram[addr + 2];
    const flags = vram[addr + 3];
    
    // Check if sprite is active (y != 0xD0)
    if (y !== 0xD0) {
      const visible = y >= 0 && y < 192 && x >= 0 && x < 256;
      const priority = flags & 0x80 ? 'High' : 'Low';
      const palette = flags & 0x08 ? 'Palette 1' : 'Palette 0';
      const flipX = flags & 0x02 ? 'Yes' : 'No';
      const flipY = flags & 0x04 ? 'Yes' : 'No';
      
      console.log(`  Sprite ${i}: y=${y}, x=${x}, pattern=${pattern}, flags=0x${flags.toString(16)}`);
      console.log(`    Visible: ${visible ? '✅' : '❌'}, Priority: ${priority}, Palette: ${palette}`);
      console.log(`    FlipX: ${flipX}, FlipY: ${flipY}`);
      
      // Check if this could be Sonic's hands
      if (visible && (x >= 100 && x <= 200) && (y >= 80 && y <= 120)) {
        console.log(`    🎯 POTENTIAL SONIC HAND: Position suggests title screen area`);
      }
    }
  }
  
  console.log(`\n=== Sprite Pattern Table Analysis ===`);
  console.log(`Reading sprite patterns from 0x${spritePatternTableAddr.toString(16)}:`);
  
  // Check first few sprite patterns for non-zero data
  for (let i = 0; i < 16; i++) {
    const addr = spritePatternTableAddr + i * 32; // 8x8 sprite = 32 bytes
    if (addr + 31 >= vram.length) break;
    
    let hasData = false;
    for (let j = 0; j < 32; j++) {
      if (vram[addr + j] !== 0) {
        hasData = true;
        break;
      }
    }
    
    if (hasData) {
      console.log(`  Pattern ${i}: Has data at 0x${addr.toString(16)}`);
      
      // Show first few bytes
      const bytes = [];
      for (let j = 0; j < 8; j++) {
        bytes.push(`0x${vram[addr + j].toString(16).padStart(2, '0')}`);
      }
      console.log(`    First 8 bytes: ${bytes.join(', ')}`);
    }
  }
  
  // Check if sprites are enabled
  const spritesEnabled = vdpState.regs[1] & 0x02;
  console.log(`\n=== Sprite Status ===`);
  console.log(`Sprites enabled: ${spritesEnabled ? '✅' : '❌'}`);
  
  if (!spritesEnabled) {
    console.log(`❌ PROBLEM: Sprites are disabled in R1!`);
    console.log(`   This explains why Sonic's hands are missing.`);
    console.log(`   R1 should have bit 1 set (0x02) to enable sprites.`);
  } else {
    console.log(`✅ Sprites are enabled, checking other issues...`);
  }
  
  // Check display enable
  const displayEnabled = vdpState.regs[1] & 0x40;
  console.log(`Display enabled: ${displayEnabled ? '✅' : '❌'}`);
  
  if (!displayEnabled) {
    console.log(`❌ PROBLEM: Display is disabled in R1!`);
    console.log(`   This would prevent all rendering.`);
  }
  
  // Check sprite size
  const spriteSize = vdpState.regs[1] & 0x01;
  console.log(`Sprite size: ${spriteSize ? '8x16' : '8x8'}`);
  
  // Check sprite table addresses
  console.log(`\n=== Sprite Table Validation ===`);
  if (spritePatternTableAddr >= vram.length) {
    console.log(`❌ PROBLEM: Sprite pattern table address (0x${spritePatternTableAddr.toString(16)}) is beyond VRAM (0x${vram.length.toString(16)})`);
  } else {
    console.log(`✅ Sprite pattern table address is valid`);
  }
  
  if (spriteAttributeTableAddr >= vram.length) {
    console.log(`❌ PROBLEM: Sprite attribute table address (0x${spriteAttributeTableAddr.toString(16)}) is beyond VRAM (0x${vram.length.toString(16)})`);
  } else {
    console.log(`✅ Sprite attribute table address is valid`);
  }
  
  // Check for sprite data in VRAM
  console.log(`\n=== VRAM Sprite Data Check ===`);
  let spriteDataFound = false;
  for (let i = 0; i < vram.length - 32; i++) {
    let hasSpriteData = false;
    for (let j = 0; j < 32; j++) {
      if (vram[i + j] !== 0) {
        hasSpriteData = true;
        break;
      }
    }
    if (hasSpriteData) {
      spriteDataFound = true;
      console.log(`✅ Found sprite data at VRAM address 0x${i.toString(16)}`);
      break;
    }
  }
  
  if (!spriteDataFound) {
    console.log(`❌ No sprite data found in VRAM`);
  }
  
  // Generate debug screenshot
  const frameBuffer = vdp.getFrameBuffer();
  const width = 256;
  const height = 192;
  const png = new PNG({ width, height });

  for (let i = 0; i < width * height; i++) {
    const srcIdx = i * 3;
    const dstIdx = i * 4;
    png.data[dstIdx] = frameBuffer[srcIdx] ?? 0;
    png.data[dstIdx + 1] = frameBuffer[srcIdx + 1] ?? 0;
    png.data[dstIdx + 2] = frameBuffer[srcIdx + 2] ?? 0;
    png.data[dstIdx + 3] = 255;
  }

  writeFileSync('traces/spy_vs_spy_sprite_debug.png', PNG.sync.write(png));
  console.log(`\n📸 Debug screenshot saved: traces/spy_vs_spy_sprite_debug.png`);
  
  // Summary
  console.log(`\n=== Summary ===`);
  if (!spritesEnabled) {
    console.log(`❌ MAIN ISSUE: Sprites are disabled in VDP register R1`);
    console.log(`   Fix: Set bit 1 (0x02) in R1 to enable sprites`);
  } else if (!displayEnabled) {
    console.log(`❌ MAIN ISSUE: Display is disabled in VDP register R1`);
    console.log(`   Fix: Set bit 6 (0x40) in R1 to enable display`);
  } else {
    console.log(`✅ Sprites and display are enabled`);
    console.log(`   Issue might be in sprite data, positioning, or rendering logic`);
  }
};

run();
