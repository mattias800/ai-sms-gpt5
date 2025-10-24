import { readFileSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Pixel-perfect comparison tool for Sonic');

// Check for comparison files
const ourScreenshot = 'traces/sonic_pixel_perfect_title_screen.png';
const mameReference = 'traces/sonic_mame_reference.png';

console.log('Checking for comparison files...');
console.log(`Our emulation: ${ourScreenshot}`);
console.log(`MAME reference: ${mameReference}`);

// Check if our screenshot exists
let ourScreenshotExists = false;
try {
  readFileSync(ourScreenshot);
  ourScreenshotExists = true;
  console.log(`✅ Our emulation screenshot: Available`);
} catch {
  console.log(`❌ Our emulation screenshot: Missing`);
}

// Check if MAME reference exists
let mameReferenceExists = false;
try {
  readFileSync(mameReference);
  mameReferenceExists = true;
  console.log(`✅ MAME reference screenshot: Available`);
} catch {
  console.log(`❌ MAME reference screenshot: Missing`);
}

if (!ourScreenshotExists) {
  console.log(`\n❌ Our emulation screenshot is missing!`);
  console.log(`Please run: npx tsx sonic_pixel_perfect_analysis.ts`);
  process.exit(1);
}

if (!mameReferenceExists) {
  console.log(`\n❌ MAME reference screenshot is missing!`);
  console.log(`\n=== Instructions ===`);
  console.log(`To capture MAME reference screenshot:`);
  console.log(`1. Run: mame sms1 -bios mpr-10052.rom -cart sonic.sms -window -nomouse`);
  console.log(`2. Wait for Sonic title screen to appear`);
  console.log(`3. Press F12 to take screenshot`);
  console.log(`4. Press ESC to exit MAME`);
  console.log(`5. Copy screenshot to: ${mameReference}`);
  console.log(`\nThen run this script again for comparison.`);
  process.exit(1);
}

// Both files exist, perform comparison
console.log(`\n=== Performing Pixel-Perfect Comparison ===`);

try {
  // Load our screenshot
  const ourPngData = readFileSync(ourScreenshot);
  const ourPng = PNG.sync.read(ourPngData);
  
  // Load MAME reference
  const mamePngData = readFileSync(mameReference);
  const mamePng = PNG.sync.read(mamePngData);
  
  console.log(`Our screenshot: ${ourPng.width}x${ourPng.height}`);
  console.log(`MAME reference: ${mamePng.width}x${mamePng.height}`);
  
  // Check dimensions match
  if (ourPng.width !== mamePng.width || ourPng.height !== mamePng.height) {
    console.log(`❌ Dimension mismatch!`);
    console.log(`Our: ${ourPng.width}x${ourPng.height}`);
    console.log(`MAME: ${mamePng.width}x${mamePng.height}`);
    process.exit(1);
  }
  
  // Compare pixels
  let identicalPixels = 0;
  let differentPixels = 0;
  const differences: Array<{x: number, y: number, our: string, mame: string}> = [];
  
  for (let y = 0; y < ourPng.height; y++) {
    for (let x = 0; x < ourPng.width; x++) {
      const ourIdx = (y * ourPng.width + x) * 4;
      const mameIdx = (y * mamePng.width + x) * 4;
      
      const ourR = ourPng.data[ourIdx] ?? 0;
      const ourG = ourPng.data[ourIdx + 1] ?? 0;
      const ourB = ourPng.data[ourIdx + 2] ?? 0;
      
      const mameR = mamePng.data[mameIdx] ?? 0;
      const mameG = mamePng.data[mameIdx + 1] ?? 0;
      const mameB = mamePng.data[mameIdx + 2] ?? 0;
      
      if (ourR === mameR && ourG === mameG && ourB === mameB) {
        identicalPixels++;
      } else {
        differentPixels++;
        if (differences.length < 100) { // Limit to first 100 differences
          differences.push({
            x,
            y,
            our: `RGB(${ourR},${ourG},${ourB})`,
            mame: `RGB(${mameR},${mameG},${mameB})`
          });
        }
      }
    }
  }
  
  const totalPixels = ourPng.width * ourPng.height;
  const accuracy = (identicalPixels / totalPixels * 100).toFixed(2);
  
  console.log(`\n=== Comparison Results ===`);
  console.log(`Total pixels: ${totalPixels.toLocaleString()}`);
  console.log(`Identical pixels: ${identicalPixels.toLocaleString()}`);
  console.log(`Different pixels: ${differentPixels.toLocaleString()}`);
  console.log(`Accuracy: ${accuracy}%`);
  
  if (parseFloat(accuracy) >= 99) {
    console.log(`🎉 EXCELLENT: Nearly pixel-perfect!`);
  } else if (parseFloat(accuracy) >= 95) {
    console.log(`✅ VERY GOOD: Very close to perfect!`);
  } else if (parseFloat(accuracy) >= 90) {
    console.log(`✅ GOOD: Mostly accurate`);
  } else if (parseFloat(accuracy) >= 80) {
    console.log(`⚠️ ACCEPTABLE: Some differences`);
  } else {
    console.log(`❌ POOR: Significant differences`);
  }
  
  // Show sample differences
  if (differences.length > 0) {
    console.log(`\n=== Sample Differences (first 10) ===`);
    differences.slice(0, 10).forEach((diff, i) => {
      console.log(`  ${i + 1}. (${diff.x},${diff.y}): Our ${diff.our} vs MAME ${diff.mame}`);
    });
    
    if (differences.length > 10) {
      console.log(`  ... and ${differences.length - 10} more differences`);
    }
  }
  
  // Analyze difference patterns
  if (differentPixels > 0) {
    console.log(`\n=== Difference Analysis ===`);
    
    // Count differences by color
    const ourColorCounts = new Map<string, number>();
    const mameColorCounts = new Map<string, number>();
    
    for (let y = 0; y < ourPng.height; y++) {
      for (let x = 0; x < ourPng.width; x++) {
        const ourIdx = (y * ourPng.width + x) * 4;
        const mameIdx = (y * mamePng.width + x) * 4;
        
        const ourR = ourPng.data[ourIdx] ?? 0;
        const ourG = ourPng.data[ourIdx + 1] ?? 0;
        const ourB = ourPng.data[ourIdx + 2] ?? 0;
        
        const mameR = mamePng.data[mameIdx] ?? 0;
        const mameG = mamePng.data[mameIdx + 1] ?? 0;
        const mameB = mamePng.data[mameIdx + 2] ?? 0;
        
        if (ourR !== mameR || ourG !== mameG || ourB !== mameB) {
          const ourColor = `${ourR},${ourG},${ourB}`;
          const mameColor = `${mameR},${mameG},${mameB}`;
          
          ourColorCounts.set(ourColor, (ourColorCounts.get(ourColor) ?? 0) + 1);
          mameColorCounts.set(mameColor, (mameColorCounts.get(mameColor) ?? 0) + 1);
        }
      }
    }
    
    console.log(`\nMost common different colors in our emulation:`);
    Array.from(ourColorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([color, count], i) => {
        const [r, g, b] = color.split(',').map(Number);
        console.log(`  ${i + 1}. RGB(${r},${g},${b}): ${count} pixels`);
      });
    
    console.log(`\nMost common different colors in MAME:`);
    Array.from(mameColorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([color, count], i) => {
        const [r, g, b] = color.split(',').map(Number);
        console.log(`  ${i + 1}. RGB(${r},${g},${b}): ${count} pixels`);
      });
  }
  
  // Recommendations
  console.log(`\n=== Recommendations ===`);
  if (parseFloat(accuracy) >= 95) {
    console.log(`🎉 Excellent accuracy! The emulation is very close to perfect.`);
    console.log(`   Minor differences might be due to:`);
    console.log(`   - Timing differences`);
    console.log(`   - Color palette variations`);
    console.log(`   - Rendering precision differences`);
  } else if (parseFloat(accuracy) >= 80) {
    console.log(`✅ Good accuracy with room for improvement.`);
    console.log(`   Focus on:`);
    console.log(`   - Color accuracy`);
    console.log(`   - Positioning precision`);
    console.log(`   - Timing adjustments`);
  } else {
    console.log(`⚠️ Significant differences found.`);
    console.log(`   Investigate:`);
    console.log(`   - VDP rendering logic`);
    console.log(`   - Color palette conversion`);
    console.log(`   - Timing and synchronization`);
  }
  
} catch (error) {
  console.log(`❌ Comparison failed: ${(error as Error).message}`);
}
