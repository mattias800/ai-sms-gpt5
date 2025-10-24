import { readFileSync, createWriteStream, mkdirSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Pixel-perfect comparison tool for Spy vs Spy');

// Helper function to load PNG and extract pixel data
const loadPNG = (filename: string): {width: number, height: number, pixels: Uint8Array} | null => {
  try {
    const data = readFileSync(filename);
    const png = PNG.sync.read(data);
    
    // Convert RGBA to RGB
    const pixels = new Uint8Array(png.width * png.height * 3);
    for (let i = 0; i < png.width * png.height; i++) {
      pixels[i * 3] = png.data[i * 4];     // R
      pixels[i * 3 + 1] = png.data[i * 4 + 1]; // G
      pixels[i * 3 + 2] = png.data[i * 4 + 2]; // B
    }
    
    return {
      width: png.width,
      height: png.height,
      pixels
    };
  } catch (error) {
    console.log(`Failed to load ${filename}: ${(error as Error).message}`);
    return null;
  }
};

// Helper function to save difference image
const saveDifferenceImage = (ourPixels: Uint8Array, mamePixels: Uint8Array, width: number, height: number, filename: string): void => {
  try {
    mkdirSync('traces', { recursive: true });
    
    const png = new PNG({ width, height });
    
    for (let i = 0; i < width * height; i++) {
      const ourIdx = i * 3;
      const mameIdx = i * 3;
      const pngIdx = i * 4;
      
      const ourR = ourPixels[ourIdx] ?? 0;
      const ourG = ourPixels[ourIdx + 1] ?? 0;
      const ourB = ourPixels[ourIdx + 2] ?? 0;
      
      const mameR = mamePixels[mameIdx] ?? 0;
      const mameG = mamePixels[mameIdx + 1] ?? 0;
      const mameB = mamePixels[mameIdx + 2] ?? 0;
      
      // Calculate difference
      const diffR = Math.abs(ourR - mameR);
      const diffG = Math.abs(ourG - mameG);
      const diffB = Math.abs(ourB - mameB);
      
      // Highlight differences in red
      if (diffR > 0 || diffG > 0 || diffB > 0) {
        png.data[pngIdx] = 255;     // R
        png.data[pngIdx + 1] = 0;   // G
        png.data[pngIdx + 2] = 0;   // B
        png.data[pngIdx + 3] = 255; // A
      } else {
        // Same pixel - show as grayscale
        const gray = Math.floor((ourR + ourG + ourB) / 3);
        png.data[pngIdx] = gray;
        png.data[pngIdx + 1] = gray;
        png.data[pngIdx + 2] = gray;
        png.data[pngIdx + 3] = 255;
      }
    }
    
    png.pack().pipe(createWriteStream(filename));
    console.log(`📸 Saved difference image: ${filename}`);
  } catch (error) {
    console.log(`Failed to save difference image: ${(error as Error).message}`);
  }
};

// Main comparison function
const compareImages = (ourFile: string, mameFile: string): void => {
  console.log(`Comparing ${ourFile} with ${mameFile}`);
  
  const ourImage = loadPNG(ourFile);
  const mameImage = loadPNG(mameFile);
  
  if (!ourImage || !mameImage) {
    console.log('❌ Failed to load one or both images');
    return;
  }
  
  // Check dimensions
  if (ourImage.width !== mameImage.width || ourImage.height !== mameImage.height) {
    console.log(`❌ Dimension mismatch: Our ${ourImage.width}x${ourImage.height} vs MAME ${mameImage.width}x${mameImage.height}`);
    return;
  }
  
  const width = ourImage.width;
  const height = ourImage.height;
  const totalPixels = width * height;
  
  console.log(`✅ Images loaded: ${width}x${height} pixels`);
  
  // Pixel-by-pixel comparison
  let identicalPixels = 0;
  let differentPixels = 0;
  const differences: Array<{x: number, y: number, our: [number, number, number], mame: [number, number, number]}> = [];
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      
      const ourR = ourImage.pixels[idx] ?? 0;
      const ourG = ourImage.pixels[idx + 1] ?? 0;
      const ourB = ourImage.pixels[idx + 2] ?? 0;
      
      const mameR = mameImage.pixels[idx] ?? 0;
      const mameG = mameImage.pixels[idx + 1] ?? 0;
      const mameB = mameImage.pixels[idx + 2] ?? 0;
      
      if (ourR === mameR && ourG === mameG && ourB === mameB) {
        identicalPixels++;
      } else {
        differentPixels++;
        differences.push({
          x, y,
          our: [ourR, ourG, ourB],
          mame: [mameR, mameG, mameB]
        });
      }
    }
  }
  
  const accuracy = (identicalPixels / totalPixels * 100).toFixed(2);
  
  console.log(`\n=== Pixel-Perfect Comparison Results ===`);
  console.log(`Total pixels: ${totalPixels.toLocaleString()}`);
  console.log(`Identical pixels: ${identicalPixels.toLocaleString()} (${accuracy}%)`);
  console.log(`Different pixels: ${differentPixels.toLocaleString()} (${(100 - parseFloat(accuracy)).toFixed(2)}%)`);
  
  if (differentPixels === 0) {
    console.log(`🎉 PERFECT MATCH! Our emulation is pixel-perfect!`);
  } else if (parseFloat(accuracy) >= 99.9) {
    console.log(`✅ EXCELLENT: ${accuracy}% accuracy - virtually perfect!`);
  } else if (parseFloat(accuracy) >= 99.0) {
    console.log(`✅ VERY GOOD: ${accuracy}% accuracy - minor differences`);
  } else if (parseFloat(accuracy) >= 95.0) {
    console.log(`⚠️ GOOD: ${accuracy}% accuracy - some differences`);
  } else {
    console.log(`❌ NEEDS WORK: ${accuracy}% accuracy - significant differences`);
  }
  
  // Analyze differences
  if (differences.length > 0) {
    console.log(`\n=== Difference Analysis ===`);
    
    // Group differences by color
    const colorDifferences = new Map<string, number>();
    differences.forEach(diff => {
      const ourColor = `${diff.our[0]},${diff.our[1]},${diff.our[2]}`;
      const mameColor = `${diff.mame[0]},${diff.mame[1]},${diff.mame[2]}`;
      const key = `${ourColor} → ${mameColor}`;
      colorDifferences.set(key, (colorDifferences.get(key) ?? 0) + 1);
    });
    
    console.log(`Most common color differences:`);
    const sortedDifferences = Array.from(colorDifferences.entries()).sort((a, b) => b[1] - a[1]);
    sortedDifferences.slice(0, 10).forEach(([change, count], i) => {
      const percentage = (count / differences.length * 100).toFixed(2);
      console.log(`  ${(i+1).toString().padStart(2, ' ')}: ${change} (${count} pixels, ${percentage}%)`);
    });
    
    // Check for systematic differences
    const systematicDifferences = sortedDifferences.filter(([change, count]) => count > differences.length * 0.1);
    if (systematicDifferences.length > 0) {
      console.log(`\nSystematic differences (>10% of differences):`);
      systematicDifferences.forEach(([change, count]) => {
        const percentage = (count / differences.length * 100).toFixed(2);
        console.log(`  ${change}: ${count} pixels (${percentage}%)`);
      });
    }
    
    // Save difference image
    saveDifferenceImage(ourImage.pixels, mameImage.pixels, width, height, 'traces/spy_vs_spy_differences.png');
  }
  
  // Color palette comparison
  console.log(`\n=== Color Palette Comparison ===`);
  
  const ourColors = new Set<string>();
  const mameColors = new Set<string>();
  
  for (let i = 0; i < totalPixels; i++) {
    const ourIdx = i * 3;
    const mameIdx = i * 3;
    
    const ourColor = `${ourImage.pixels[ourIdx]},${ourImage.pixels[ourIdx + 1]},${ourImage.pixels[ourIdx + 2]}`;
    const mameColor = `${mameImage.pixels[mameIdx]},${mameImage.pixels[mameIdx + 1]},${mameImage.pixels[mameIdx + 2]}`;
    
    ourColors.add(ourColor);
    mameColors.add(mameColor);
  }
  
  console.log(`Our colors: ${ourColors.size}`);
  console.log(`MAME colors: ${mameColors.size}`);
  
  const commonColors = new Set([...ourColors].filter(color => mameColors.has(color)));
  const ourOnlyColors = new Set([...ourColors].filter(color => !mameColors.has(color)));
  const mameOnlyColors = new Set([...mameColors].filter(color => !ourColors.has(color)));
  
  console.log(`Common colors: ${commonColors.size}`);
  console.log(`Our only colors: ${ourOnlyColors.size}`);
  console.log(`MAME only colors: ${mameOnlyColors.size}`);
  
  if (ourOnlyColors.size > 0) {
    console.log(`\nColors only in our emulation:`);
    Array.from(ourOnlyColors).slice(0, 5).forEach(color => {
      console.log(`  RGB(${color})`);
    });
  }
  
  if (mameOnlyColors.size > 0) {
    console.log(`\nColors only in MAME:`);
    Array.from(mameOnlyColors).slice(0, 5).forEach(color => {
      console.log(`  RGB(${color})`);
    });
  }
};

// Check if we have both images
const ourFile = 'traces/spy_vs_spy_optimal_frame_700.png';
const mameFile = 'traces/spy_vs_spy_mame_reference.png';

console.log('Checking for comparison files...');

try {
  let ourExists = false;
  let mameExists = false;
  
  try {
    readFileSync(ourFile);
    ourExists = true;
  } catch {
    ourExists = false;
  }
  
  try {
    readFileSync(mameFile);
    mameExists = true;
  } catch {
    mameExists = false;
  }
  
  console.log(`Our emulation: ${ourExists ? '✅' : '❌'} ${ourFile}`);
  console.log(`MAME reference: ${mameExists ? '✅' : '❌'} ${mameFile}`);
  
  if (ourExists && mameExists) {
    compareImages(ourFile, mameFile);
  } else {
    console.log('\n=== Instructions ===');
    console.log('To perform pixel-perfect comparison:');
    console.log('1. Our emulation screenshot: ✅ Available');
    console.log('2. MAME reference screenshot: ❌ Missing');
    console.log('');
    console.log('To capture MAME reference:');
    console.log('1. Run: ./capture_mame_reference.sh');
    console.log('2. Wait for title screen');
    console.log('3. Press F12 to take screenshot');
    console.log('4. Press ESC to exit');
    console.log('5. Copy screenshot to: traces/spy_vs_spy_mame_reference.png');
    console.log('');
    console.log('Then run this script again for comparison.');
  }
} catch (error) {
  console.log('Error checking files:', (error as Error).message);
}
