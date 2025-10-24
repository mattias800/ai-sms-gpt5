import { createMachine } from './src/machine/machine.js';
import { readFileSync, createWriteStream, mkdirSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Debugging Spy vs Spy text positioning and readability');

// Load BIOS
const biosPath = process.env.SMS_BIOS || './third_party/mame/roms/sms1/mpr-10052.rom';
const biosData = readFileSync(biosPath);

// Test Spy vs Spy
const spyVsSpyPath = './spyvsspy.sms';
const spyVsSpyData = readFileSync(spyVsSpyPath);

const spyVsSpyCart = { rom: spyVsSpyData };
const machine = createMachine({ cart: spyVsSpyCart, useManualInit: false, bus: { bios: biosData } });
const vdp = machine.getVDP();

// Run to optimal frame (700)
for (let frame = 0; frame < 700; frame++) {
  machine.runCycles(228 * 262);
}

// Generate screenshot
try {
  mkdirSync('traces', { recursive: true });
  
  const frameBuffer = vdp.renderFrame();
  if (!frameBuffer) {
    console.log('❌ Failed to render frame');
    process.exit(1);
  }

  const png = new PNG({ width: 256, height: 192 });
  for (let i = 0; i < 256 * 192; i++) {
    const srcIdx = i * 3;
    const dstIdx = i * 4;
    png.data[dstIdx] = frameBuffer[srcIdx] ?? 0;
    png.data[dstIdx + 1] = frameBuffer[srcIdx + 1] ?? 0;
    png.data[dstIdx + 2] = frameBuffer[srcIdx + 2] ?? 0;
    png.data[dstIdx + 3] = 255;
  }
  
  const filename = 'traces/spy_vs_spy_text_debug.png';
  png.pack().pipe(createWriteStream(filename));
  console.log(`📸 Generated debug screenshot: ${filename}`);
  
  // Analyze white pixel distribution
  const whitePixels: Array<{x: number, y: number}> = [];
  
  for (let y = 0; y < 192; y++) {
    for (let x = 0; x < 256; x++) {
      const idx = (y * 256 + x) * 3;
      const r = frameBuffer[idx] ?? 0;
      const g = frameBuffer[idx + 1] ?? 0;
      const b = frameBuffer[idx + 2] ?? 0;
      
      if (r === 255 && g === 255 && b === 255) {
        whitePixels.push({ x, y });
      }
    }
  }
  
  console.log(`\n=== White Pixel Analysis ===`);
  console.log(`Total white pixels: ${whitePixels.length}`);
  
  if (whitePixels.length > 0) {
    // Find bounding box of white pixels
    const minX = Math.min(...whitePixels.map(p => p.x));
    const maxX = Math.max(...whitePixels.map(p => p.x));
    const minY = Math.min(...whitePixels.map(p => p.y));
    const maxY = Math.max(...whitePixels.map(p => p.y));
    
    console.log(`White pixel bounding box:`);
    console.log(`  X: ${minX} to ${maxX} (width: ${maxX - minX + 1})`);
    console.log(`  Y: ${minY} to ${maxY} (height: ${maxY - minY + 1})`);
    
    // Check if text is centered
    const centerX = 128; // 256/2
    const centerY = 96;  // 192/2
    
    const textCenterX = (minX + maxX) / 2;
    const textCenterY = (minY + maxY) / 2;
    
    console.log(`\nText positioning:`);
    console.log(`  Screen center: (${centerX}, ${centerY})`);
    console.log(`  Text center: (${textCenterX.toFixed(1)}, ${textCenterY.toFixed(1)})`);
    console.log(`  X offset: ${(textCenterX - centerX).toFixed(1)} pixels`);
    console.log(`  Y offset: ${(textCenterY - centerY).toFixed(1)} pixels`);
    
    // Analyze different regions
    const regions = [
      { name: 'Top-Third', yMin: 0, yMax: 63 },
      { name: 'Middle-Third', yMin: 64, yMax: 127 },
      { name: 'Bottom-Third', yMin: 128, yMax: 191 },
      { name: 'Left-Third', xMin: 0, xMax: 85 },
      { name: 'Center-Third', xMin: 86, xMax: 170 },
      { name: 'Right-Third', xMin: 171, xMax: 255 }
    ];
    
    console.log(`\nRegional white pixel distribution:`);
    regions.forEach(region => {
      const count = whitePixels.filter(p => {
        const inX = 'xMin' in region ? (p.x >= region.xMin && p.x <= region.xMax) : true;
        const inY = 'yMin' in region ? (p.y >= region.yMin && p.y <= region.yMax) : true;
        return inX && inY;
      }).length;
      
      const regionSize = 'xMin' in region ? 
        (region.xMax - region.xMin + 1) * 192 : 
        (region.yMax - region.yMin + 1) * 256;
      
      const percentage = (count / regionSize * 100).toFixed(1);
      console.log(`  ${region.name}: ${count} pixels (${percentage}%)`);
    });
    
    // Check for text patterns
    console.log(`\n=== Text Pattern Analysis ===`);
    
    // Look for horizontal text lines
    const lineGroups = new Map<number, number>();
    whitePixels.forEach(p => {
      const count = lineGroups.get(p.y) ?? 0;
      lineGroups.set(p.y, count + 1);
    });
    
    const linesWithText = Array.from(lineGroups.entries())
      .filter(([y, count]) => count > 5) // Lines with more than 5 white pixels
      .sort((a, b) => a[0] - b[0]);
    
    console.log(`Text lines detected: ${linesWithText.length}`);
    linesWithText.forEach(([y, count]) => {
      console.log(`  Line ${y}: ${count} white pixels`);
    });
    
    // Check for vertical text columns
    const columnGroups = new Map<number, number>();
    whitePixels.forEach(p => {
      const count = columnGroups.get(p.x) ?? 0;
      columnGroups.set(p.x, count + 1);
    });
    
    const columnsWithText = Array.from(columnGroups.entries())
      .filter(([x, count]) => count > 5) // Columns with more than 5 white pixels
      .sort((a, b) => a[0] - b[0]);
    
    console.log(`Text columns detected: ${columnsWithText.length}`);
    if (columnsWithText.length > 0) {
      console.log(`  Column range: ${columnsWithText[0][0]} to ${columnsWithText[columnsWithText.length - 1][0]}`);
    }
    
    // Analyze text density
    const textArea = (maxX - minX + 1) * (maxY - minY + 1);
    const textDensity = (whitePixels.length / textArea * 100).toFixed(1);
    console.log(`\nText density: ${whitePixels.length}/${textArea} pixels (${textDensity}%)`);
    
    if (textDensity < 10) {
      console.log(`⚠️ Low text density - text might be sparse or small`);
    } else if (textDensity > 50) {
      console.log(`⚠️ High text density - text might be too dense`);
    } else {
      console.log(`✅ Good text density`);
    }
    
  } else {
    console.log(`❌ No white pixels found - text rendering issue`);
  }
  
  // Check VDP state for text-related settings
  const vdpState = vdp.getState?.() ?? {};
  const regs = vdpState.regs ?? [];
  
  console.log(`\n=== VDP Text Settings ===`);
  console.log(`R0 (Mode): 0x${(regs[0] ?? 0).toString(16).padStart(2, '0')}`);
  console.log(`R1 (Display): 0x${(regs[1] ?? 0).toString(16).padStart(2, '0')}`);
  console.log(`R2 (Name Table): 0x${(regs[2] ?? 0).toString(16).padStart(2, '0')}`);
  console.log(`R3 (Color Table): 0x${(regs[3] ?? 0).toString(16).padStart(2, '0')}`);
  console.log(`R4 (Pattern Table): 0x${(regs[4] ?? 0).toString(16).padStart(2, '0')}`);
  
  // Check if display is enabled
  const displayEnabled = ((regs[1] ?? 0) & 0x40) !== 0;
  console.log(`Display enabled: ${displayEnabled ? '✅' : '❌'}`);
  
  // Check if we're in the right mode
  const mode = (regs[0] ?? 0) & 0x0F;
  console.log(`VDP Mode: ${mode} (should be 4 for SMS)`);
  
} catch (error) {
  console.log(`❌ Debug failed: ${(error as Error).message}`);
}
