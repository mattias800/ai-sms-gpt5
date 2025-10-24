import { readFileSync } from 'fs';
import { createMachine } from './src/machine/machine.js';
import { createController } from './src/io/controller.js';

const rom = new Uint8Array(readFileSync('./sonic.sms'));
const cart = { rom };

// Create controllers
const controller1 = createController();
const controller2 = createController();

const m = createMachine({
  cart,
  controller1,
  controller2,
  wait: { smsModel: true, includeWaitInCycles: false, vdpPenalty: 4 },
  bus: { allowCartRam: false }
});

console.log('Running Sonic with Start button press...\n');

const cyclesPerFrame = 228 * 262;

// Run for 5 seconds to get past initial boot
for (let frame = 0; frame < 60 * 5; frame++) {
  m.runCycles(cyclesPerFrame);
}

console.log('Pressing Start button (Button 1)...');
// Press Button 1 (which acts as Start in many SMS games)
controller1.setState({ button1: true });

// Run for a few frames with button pressed
for (let frame = 0; frame < 10; frame++) {
  m.runCycles(cyclesPerFrame);
}

// Release button
controller1.setState({ button1: false });

// Also try pressing button 2
console.log('Trying Button 2...');
controller1.setState({ button2: true });

for (let frame = 0; frame < 10; frame++) {
  m.runCycles(cyclesPerFrame);
}

controller1.setState({ button2: false });

// Run for another 10 seconds to see if we get to gameplay
console.log('Waiting for gameplay...\n');

for (let frame = 0; frame < 60 * 10; frame++) {
  m.runCycles(cyclesPerFrame);
  
  if (frame % 60 === 0) {
    const vdp = m.getVDP();
    const state = vdp.getState?.();
    
    if (state) {
      const spriteAttrBase = ((state.regs[5] ?? 0) & 0x7e) << 7;
      let visibleCount = 0;
      
      for (let i = 0; i < 64; i++) {
        const y = state.vram[spriteAttrBase + i] ?? 0;
        if (y < 0xd0 || (y > 0xd0 && y < 0xe0)) {
          visibleCount++;
        }
      }
      
      console.log(`Time: ${5 + frame/60}s - Visible sprites: ${visibleCount}, Display: ${state.displayEnabled ? 'ON' : 'OFF'}`);
      
      // If we have many visible sprites in gameplay range, check details
      if (visibleCount > 10) {
        console.log('  Likely in gameplay! Checking sprite positions...');
        let gameplaySprites = 0;
        for (let i = 0; i < Math.min(10, visibleCount); i++) {
          const y = state.vram[spriteAttrBase + i] ?? 0;
          if (y >= 80 && y < 180) gameplaySprites++;
        }
        console.log(`  ${gameplaySprites} sprites in gameplay Y range (80-180)`);
      }
    }
  }
}

// Final render to see what we have
const vdp = m.getVDP();
if (vdp.renderFrame) {
  const frame = vdp.renderFrame();
  let nonBlack = 0;
  for (let i = 0; i < frame.length; i += 3) {
    if (frame[i] !== 0 || frame[i+1] !== 0 || frame[i+2] !== 0) {
      nonBlack++;
    }
  }
  console.log(`\nFinal rendered frame: ${nonBlack} non-black pixels out of ${256*192}`);
  
  // Write PNG to see what we have
  import('fs').then(fs => {
    import('zlib').then(zlib => {
      function encodePNG(width: number, height: number, rgb: Uint8Array): Uint8Array {
        const sig = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
        const ihdr = new Uint8Array(13);
        const dv = new DataView(ihdr.buffer);
        dv.setUint32(0, width, false);
        dv.setUint32(4, height, false);
        ihdr[8] = 8;
        ihdr[9] = 2;
        const ihdrChunk = writeChunk('IHDR', ihdr);
        
        const stride = width * 3;
        const raw = new Uint8Array((stride + 1) * height);
        for (let y = 0; y < height; y++) {
          raw[y * (stride + 1)] = 0;
          raw.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
        }
        const compressed = zlib.default.deflateSync(raw);
        const idatChunk = writeChunk('IDAT', compressed);
        const iendChunk = writeChunk('IEND', new Uint8Array(0));
        
        const out = new Uint8Array(sig.length + ihdrChunk.length + idatChunk.length + iendChunk.length);
        out.set(sig, 0);
        out.set(ihdrChunk, sig.length);
        out.set(idatChunk, sig.length + ihdrChunk.length);
        out.set(iendChunk, sig.length + ihdrChunk.length + idatChunk.length);
        return out;
      }
      
      function writeChunk(type: string, data: Uint8Array): Uint8Array {
        const len = data.length;
        const out = new Uint8Array(8 + len + 4);
        const dv = new DataView(out.buffer);
        dv.setUint32(0, len, false);
        out[4] = type.charCodeAt(0);
        out[5] = type.charCodeAt(1);
        out[6] = type.charCodeAt(2);
        out[7] = type.charCodeAt(3);
        out.set(data, 8);
        
        // Simple CRC32 (simplified for brevity)
        let crc = ~0 >>> 0;
        const crcBuf = new Uint8Array(4 + len);
        crcBuf[0] = out[4];
        crcBuf[1] = out[5];
        crcBuf[2] = out[6];
        crcBuf[3] = out[7];
        crcBuf.set(data, 4);
        
        for (let i = 0; i < crcBuf.length; i++) {
          crc ^= crcBuf[i];
          for (let k = 0; k < 8; k++) {
            crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
          }
        }
        dv.setUint32(8 + len, ~crc >>> 0, false);
        return out;
      }
      
      const png = encodePNG(256, 192, frame);
      fs.writeFileSync('sonic_after_buttons.png', png);
      console.log('Saved screenshot to sonic_after_buttons.png');
      
      if (nonBlack > 24576) {
        console.log('Likely showing actual game content!');
      } else {
        console.log('Screen is mostly black - might still be on title/menu');
      }
    });
  });
}
