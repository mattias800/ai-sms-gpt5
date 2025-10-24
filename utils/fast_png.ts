import { writeFileSync } from 'fs';
import { PNG } from 'pngjs';

/**
 * Fast PNG generation utility optimized for speed
 */
export function writePNGFast(
  frameBuffer: Uint8Array, 
  width: number, 
  height: number, 
  outputPath: string
): void {
  // Pre-allocate PNG with known size
  const png = new PNG({ width, height });
  
  // Use direct buffer access for faster copying
  const pngData = png.data;
  const rgbData = frameBuffer;
  
  // Copy RGB to RGBA in one pass with optimized loop
  for (let i = 0; i < width * height; i++) {
    const srcIdx = i * 3;
    const dstIdx = i * 4;
    
    pngData[dstIdx] = rgbData[srcIdx] ?? 0;     // R
    pngData[dstIdx + 1] = rgbData[srcIdx + 1] ?? 0; // G
    pngData[dstIdx + 2] = rgbData[srcIdx + 2] ?? 0; // B
    pngData[dstIdx + 3] = 255; // A (always opaque)
  }
  
  // Use sync write but with optimized PNG settings
  const buffer = PNG.sync.write(png, {
    colorType: 6, // RGBA
    bitDepth: 8,
    compressionLevel: 1, // Faster compression (less compression)
    filterType: 0 // No filtering for speed
  });
  
  writeFileSync(outputPath, buffer);
}

/**
 * Even faster PNG generation using minimal compression
 */
export function writePNGUltraFast(
  frameBuffer: Uint8Array, 
  width: number, 
  height: number, 
  outputPath: string
): void {
  // Pre-allocate PNG with known size
  const png = new PNG({ width, height });
  
  // Use direct buffer access for faster copying
  const pngData = png.data;
  const rgbData = frameBuffer;
  
  // Copy RGB to RGBA in one pass with optimized loop
  for (let i = 0; i < width * height; i++) {
    const srcIdx = i * 3;
    const dstIdx = i * 4;
    
    pngData[dstIdx] = rgbData[srcIdx] ?? 0;     // R
    pngData[dstIdx + 1] = rgbData[srcIdx + 1] ?? 0; // G
    pngData[dstIdx + 2] = rgbData[srcIdx + 2] ?? 0; // B
    pngData[dstIdx + 3] = 255; // A (always opaque)
  }
  
  // Use minimal compression for maximum speed
  const buffer = PNG.sync.write(png, {
    colorType: 6, // RGBA
    bitDepth: 8,
    compressionLevel: 0, // No compression for maximum speed
    filterType: 0 // No filtering for speed
  });
  
  writeFileSync(outputPath, buffer);
}
