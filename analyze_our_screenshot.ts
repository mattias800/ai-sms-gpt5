import { readFileSync, createWriteStream, mkdirSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Analyzing our Spy vs Spy screenshot for accuracy');

// Load our screenshot
const ourFile = 'traces/spy_vs_spy_optimal_frame_700.png';

try {
  const data = readFileSync(ourFile);
  const png = PNG.sync.read(data);
  
  console.log(`✅ Loaded screenshot: ${png.width}x${png.height} pixels`);
  
  // Extract pixel data
  const pixels = new Uint8Array(png.width * png.height * 3);
  for (let i = 0; i < png.width * png.height; i++) {
    pixels[i * 3] = png.data[i * 4];     // R
    pixels[i * 3 + 1] = png.data[i * 4 + 1]; // G
    pixels[i * 3 + 2] = png.data[i * 4 + 2]; // B
  }
  
  // Analyze colors
  const colorMap = new Map<string, number>();
  for (let i = 0; i < png.width * png.height; i++) {
    const idx = i * 3;
    const r = pixels[idx] ?? 0;
    const g = pixels[idx + 1] ?? 0;
    const b = pixels[idx + 2] ?? 0;
    
    const colorKey = `${r},${g},${b}`;
    colorMap.set(colorKey, (colorMap.get(colorKey) ?? 0) + 1);
  }
  
  console.log(`\n=== Color Analysis ===`);
  console.log(`Total unique colors: ${colorMap.size}`);
  
  // Sort colors by frequency
  const sortedColors = Array.from(colorMap.entries()).sort((a, b) => b[1] - a[1]);
  console.log(`\nColor palette (by frequency):`);
  sortedColors.forEach(([color, count], i) => {
    const [r, g, b] = color.split(',').map(Number);
    const percentage = (count / (png.width * png.height) * 100).toFixed(2);
    console.log(`  ${(i+1).toString().padStart(2, ' ')}: RGB(${r},${g},${b}) - ${count.toLocaleString()} pixels (${percentage}%)`);
  });
  
  // Check for expected Spy vs Spy colors
  console.log(`\n=== Expected Color Check ===`);
  const expectedColors = [
    { name: 'Background Blue', rgb: [0, 85, 255], description: 'Main background color' },
    { name: 'Text White', rgb: [255, 255, 255], description: 'Text and UI elements' },
    { name: 'Accent Yellow', rgb: [255, 255, 0], description: 'Highlighted elements' },
    { name: 'Black', rgb: [0, 0, 0], description: 'Shadows or borders' },
    { name: 'Gray', rgb: [170, 170, 170], description: 'Secondary elements' }
  ];
  
  expectedColors.forEach(expected => {
    const found = colorMap.has(`${expected.rgb[0]},${expected.rgb[1]},${expected.rgb[2]}`);
    const count = colorMap.get(`${expected.rgb[0]},${expected.rgb[1]},${expected.rgb[2]}`) ?? 0;
    const percentage = (count / (png.width * png.height) * 100).toFixed(2);
    
    if (found) {
      console.log(`  ✅ ${expected.name}: ${count.toLocaleString()} pixels (${percentage}%) - ${expected.description}`);
    } else {
      console.log(`  ❌ ${expected.name}: Not found - ${expected.description}`);
    }
  });
  
  // Analyze 4x4 corner areas
  console.log(`\n=== Corner Analysis ===`);
  const corners = [
    { name: 'top-left', x: 0, y: 0 },
    { name: 'top-right', x: png.width - 4, y: 0 },
    { name: 'bottom-left', x: 0, y: png.height - 4 },
    { name: 'bottom-right', x: png.width - 4, y: png.height - 4 }
  ];
  
  corners.forEach(corner => {
    const colorMap = new Map<string, number>();
    
    // Sample 4x4 area
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        const x = corner.x + dx;
        const y = corner.y + dy;
        const idx = (y * png.width + x) * 3;
        
        const r = pixels[idx] ?? 0;
        const g = pixels[idx + 1] ?? 0;
        const b = pixels[idx + 2] ?? 0;
        
        const colorKey = `${r},${g},${b}`;
        colorMap.set(colorKey, (colorMap.get(colorKey) ?? 0) + 1);
      }
    }
    
    // Find dominant color
    let dominantColor = '';
    let maxCount = 0;
    for (const [color, count] of colorMap.entries()) {
      if (count > maxCount) {
        maxCount = count;
        dominantColor = color;
      }
    }
    
    const [r, g, b] = dominantColor.split(',').map(Number);
    console.log(`  ${corner.name}: RGB(${r},${g},${b}) - ${maxCount}/16 pixels`);
  });
  
  // Check for text readability
  console.log(`\n=== Text Readability Analysis ===`);
  
  // Look for text areas (areas with white pixels)
  const whitePixels = colorMap.get('255,255,255') ?? 0;
  const whitePercentage = (whitePixels / (png.width * png.height) * 100).toFixed(2);
  
  if (whitePixels > 0) {
    console.log(`  ✅ Text detected: ${whitePixels.toLocaleString()} white pixels (${whitePercentage}%)`);
    
    if (parseFloat(whitePercentage) >= 5.0) {
      console.log(`  ✅ Good text coverage: ${whitePercentage}%`);
    } else if (parseFloat(whitePercentage) >= 2.0) {
      console.log(`  ⚠️ Moderate text coverage: ${whitePercentage}%`);
    } else {
      console.log(`  ❌ Low text coverage: ${whitePercentage}%`);
    }
  } else {
    console.log(`  ❌ No text detected (no white pixels)`);
  }
  
  // Check for color diversity
  console.log(`\n=== Color Diversity Analysis ===`);
  
  if (colorMap.size >= 8) {
    console.log(`  ✅ Excellent color diversity: ${colorMap.size} colors`);
  } else if (colorMap.size >= 5) {
    console.log(`  ✅ Good color diversity: ${colorMap.size} colors`);
  } else if (colorMap.size >= 3) {
    console.log(`  ⚠️ Moderate color diversity: ${colorMap.size} colors`);
  } else {
    console.log(`  ❌ Low color diversity: ${colorMap.size} colors`);
  }
  
  // Check for proper SMS palette usage
  console.log(`\n=== SMS Palette Compliance ===`);
  
  const smsCompliantColors = Array.from(colorMap.keys()).filter(color => {
    const [r, g, b] = color.split(',').map(Number);
    // SMS uses 2-bit per component, so values should be 0, 85, 170, or 255
    const rValid = [0, 85, 170, 255].includes(r);
    const gValid = [0, 85, 170, 255].includes(g);
    const bValid = [0, 85, 170, 255].includes(b);
    return rValid && gValid && bValid;
  });
  
  const compliancePercentage = (smsCompliantColors.length / colorMap.size * 100).toFixed(2);
  console.log(`  SMS palette compliance: ${smsCompliantColors.length}/${colorMap.size} colors (${compliancePercentage}%)`);
  
  if (parseFloat(compliancePercentage) >= 90) {
    console.log(`  ✅ Excellent SMS palette compliance`);
  } else if (parseFloat(compliancePercentage) >= 70) {
    console.log(`  ✅ Good SMS palette compliance`);
  } else {
    console.log(`  ⚠️ SMS palette compliance could be improved`);
  }
  
  // Overall assessment
  console.log(`\n=== Overall Assessment ===`);
  
  const hasBackgroundBlue = colorMap.has('0,85,255');
  const hasTextWhite = colorMap.has('255,255,255');
  const hasGoodColorDiversity = colorMap.size >= 5;
  const hasGoodTextCoverage = parseFloat(whitePercentage) >= 2.0;
  const hasGoodSMSCompliance = parseFloat(compliancePercentage) >= 70;
  
  const score = [hasBackgroundBlue, hasTextWhite, hasGoodColorDiversity, hasGoodTextCoverage, hasGoodSMSCompliance].filter(Boolean).length;
  
  console.log(`Quality score: ${score}/5`);
  
  if (score >= 5) {
    console.log(`🎉 EXCELLENT: Spy vs Spy title screen looks perfect!`);
  } else if (score >= 4) {
    console.log(`✅ VERY GOOD: Spy vs Spy title screen looks great!`);
  } else if (score >= 3) {
    console.log(`✅ GOOD: Spy vs Spy title screen looks good!`);
  } else if (score >= 2) {
    console.log(`⚠️ FAIR: Spy vs Spy title screen has some issues`);
  } else {
    console.log(`❌ POOR: Spy vs Spy title screen needs work`);
  }
  
  console.log(`\n✅ Analysis complete!`);
  
} catch (error) {
  console.log(`❌ Failed to analyze screenshot: ${(error as Error).message}`);
}
