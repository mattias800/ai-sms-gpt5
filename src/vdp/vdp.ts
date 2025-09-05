export interface VdpPublicState {
  regs: number[];
  status: number;
  line: number;
  cyclesPerLine: number; // CPU cycles per scanline
  linesPerFrame: number; // total scanlines per frame
  vblankIrqEnabled: boolean;
  displayEnabled: boolean;
  nameTableBase: number;
  bgPatternBase: number;
  spriteAttrBase: number;
  spritePatternBase: number;
  borderColor: number;
  hScroll: number; // Horizontal scroll
  vScroll: number; // Vertical scroll
  curAddr: number;
  curCode: number;
  lastHcRaw: number;
  cram: number[];
  vram: number[]; // Expose VRAM snapshot for debug/rendering tools
  vramWrites: number;
  cramWrites: number;
  lastCramIndex: number;
  lastCramValue: number;
  nonZeroVramWrites: number;
  lastNonZeroVramAddr: number;
}

export interface IVDP {
  readPort: (port: number) => number;
  writePort: (port: number, val: number) => void;
  tickCycles: (cpuCycles: number) => void;
  hasIRQ: () => boolean;
  getState?: () => VdpPublicState;
  renderFrame?: () => Uint8Array;
  getVRAM?: () => Uint8Array;
  getCRAM?: () => Uint8Array;
  getRegister?: (idx: number) => number;
}

export interface VdpTimingConfig {
  cyclesPerLine: number;
  linesPerFrame: number;
  vblankStartLine: number; // first line of VBlank (inclusive)
  frontPorchCycles: number; // cycles returning 0x00 at start of line
  hblankWidthCycles: number; // cycles returning 0xB0 at end of line
  hcQuantStep: number; // quantization step for HCounter buckets
  snapB0Window: number; // proximity window to snap to 0xB0
  snap03Window: number; // proximity window to snap to 0x03 (early line safe point)
}

interface VdpState {
  vram: Uint8Array; // 16KB
  cram: Uint8Array; // 32 bytes (SMS palette)
  addr: number;
  code: number;
  latch: number | null;
  readBuffer: number;
  status: number;
  autoInc: number;
  regs: Uint8Array; // VDP registers (we model up to 32, only a few used here)
  // timing
  cycleAcc: number;
  line: number;
  linesPerFrame: number;
  cyclesPerLine: number;
  vblankStartLine: number;
  frontPorchCycles: number;
  hblankWidthCycles: number;
  hcQuantStep: number;
  snapB0Window: number;
  snap03Window: number;
  irqVLine: boolean; // vblank IRQ wire state
  // H/V counter helpers
  hcScaled: number; // fixed-point accumulator: cycles*256 within the current line (0..cyclesPerLine*256-1)
  lastHcRaw: number; // last raw HCounter value computed for 0x7E (0..255)
  lastHcLine: number; // line number when last HCounter was read
  // per-scanline scroll capture (approximation of mid-frame writes)
  hScrollLine: Uint8Array; // length = linesPerFrame; value used for that scanline
  // stats
  vramWrites: number;
  cramWrites: number;
  lastCramIndex: number;
  lastCramValue: number;
  // extra debug
  nonZeroVramWrites: number;
  lastNonZeroVramAddr: number;
}

export const createVDP = (timing?: Partial<VdpTimingConfig>): IVDP => {
  const defaults: VdpTimingConfig = {
    cyclesPerLine: 228,
    linesPerFrame: 262,
    vblankStartLine: 192,
    frontPorchCycles: 16, // Start of line returns 0x00 for ~16 cycles
    // Widen hblank plateau to stabilize 0xB0 reads in busy-wait loops
    hblankWidthCycles: 40,
    // Keep raw HCounter (no quantization) so precise equality gates like 0x03 can be met
    hcQuantStep: 0x01,
    // Snap more aggressively around 0xB0 to satisfy equality loops
    snapB0Window: 20,
    // Also snap near 0x03 to satisfy early-line gating loops
    snap03Window: 8,
  };
  const cfg: VdpTimingConfig = { ...defaults, ...(timing ?? {}) };

  const s: VdpState = {
    vram: new Uint8Array(0x4000),
    cram: new Uint8Array(0x20),
    addr: 0,
    code: 0,
    latch: null,
    readBuffer: 0,
    status: 0,
    autoInc: 1,
    regs: new Uint8Array(32),
    cycleAcc: 0,
    line: 0,
    linesPerFrame: cfg.linesPerFrame | 0,
    cyclesPerLine: cfg.cyclesPerLine | 0, // Z80 cycles per scanline (approx. deterministic choice)
    vblankStartLine: cfg.vblankStartLine | 0,
    frontPorchCycles: cfg.frontPorchCycles | 0,
    hblankWidthCycles: cfg.hblankWidthCycles | 0,
    hcQuantStep: cfg.hcQuantStep | 0,
    snapB0Window: cfg.snapB0Window | 0,
    snap03Window: cfg.snap03Window | 0,
    irqVLine: false,
    hcScaled: 0,
    lastHcRaw: 0,
    lastHcLine: 0,
    hScrollLine: new Uint8Array(cfg.linesPerFrame | 0),
    vramWrites: 0,
    cramWrites: 0,
    lastCramIndex: -1,
    lastCramValue: 0,
    nonZeroVramWrites: 0,
    lastNonZeroVramAddr: -1,
  };
  // Some titles rely on autoincrement register; default to 1
  s.regs[15] = 1;

  const writeControl = (v: number): void => {
    if (s.latch === null) {
      s.latch = v & 0xff;
    } else {
      const low = s.latch;
      const high = v & 0xff;
      s.latch = null;
      const code = (high >>> 6) & 0x03;
      if (code === 0x02) {
        // Register write: index in low 4 bits, value is low byte
        const reg = high & 0x0f;
        let value = low;

        // Handle register 0 special case: M3 and M4 mode bits conflict
        if (reg === 0) {
          // Check if both M3 (bit 1) and M4 (bit 2) are set
          const m3 = (value & 0x02) !== 0;
          const m4 = (value & 0x04) !== 0;
          if (m3 && m4) {
            // Mode 4 takes precedence - clear M3 bit
            value = value & ~0x02; // Clear bit 1 (M3)
          }
        }

        s.regs[reg] = value;
        if (reg === 1) {
          // VBlank IRQ enable is bit 5 of reg1. If enabling during active VBlank, assert immediately.
          const irqEnabled = (value & 0x20) !== 0;
          if (!irqEnabled) {
            s.irqVLine = false;
          } else {
            // If we are in vblank now OR the vblank flag is already set, assert immediately
            if (s.line >= s.vblankStartLine || (s.status & 0x80) !== 0) s.irqVLine = true;
          }
        } else if (reg === 8) {
          // Capture per-line H scroll value (approximate) at the current line
          const ln = s.line;
          if (ln >= 0 && ln < s.linesPerFrame) s.hScrollLine[ln] = value & 0xff;
        } else if (reg === 15) {
          // Guard against 0 auto-increment to avoid infinite loops in stub
          s.autoInc = value || 1;
          s.regs[15] = s.autoInc;
        }
      } else {
        // Address setup and operation code: code 0=VRAM read, 1=VRAM write, 3=CRAM write (SMS)
        s.addr = ((high & 0x3f) << 8) | low; // 14-bit addr
        s.code = code & 0x03;
      }
    }
  };

  const readPort = (port: number): number => {
    const p = port & 0xff;
    // H/V counters are readable via ports 0x7E/0x7F on SMS
    if (p === 0x7e) {
      // Approximate SMS HCounter behavior.
      // - 0..cyclesPerLine-1 maps to 0..255 (raw).
      // - Hold 0x00 briefly at start of line (front porch), and 0xB0 near end (hblank).
      // - Quantize a bit to reduce jitter and match common polling sequences.
      const cyclesInLine = s.cycleAcc | 0;
      // Map cycles to 0-255 range more accurately
      const scaledPos = (cyclesInLine * 256) / s.cyclesPerLine;
      const raw = Math.floor(scaledPos) & 0xff;
      let hc = raw & 0xff;
      // Front porch: small window at start of line returns 0x00 consistently.
      if (cyclesInLine < s.frontPorchCycles) {
        hc = 0x00;
      } else if (cyclesInLine >= s.cyclesPerLine - s.hblankWidthCycles) {
        // HBlank plateau near end of line maps to ~0xB0 consistently
        hc = 0xb0;
      } else {
        // Quantize to coarse steps to better match real read cadence (~0x21/0x22 deltas observed)
        if (hc !== 0x00 && hc !== 0xb0) {
          const step = s.hcQuantStep & 0xff;
          hc = Math.min(0xaf, Math.floor(hc / step) * step) & 0xff;
        }
        // Snap to 0xB0 within proximity window to satisfy equality loops
        const diffB0 = (raw - 0xb0) & 0xff;
        const adiffB0 = diffB0 > 0x7f ? 0x100 - diffB0 : diffB0;
        if (adiffB0 <= (s.snapB0Window & 0xff)) hc = 0xb0;
        // Snap to 0x03 within proximity window to satisfy early-line equality loops
        const diff03 = (raw - 0x03) & 0xff;
        const adiff03 = diff03 > 0x7f ? 0x100 - diff03 : diff03;
        if (adiff03 <= (s.snap03Window & 0xff)) hc = 0x03;
      }
      s.lastHcRaw = raw;
      s.lastHcLine = s.line;
      return hc & 0xff;
    }
    if (p === 0x7f) {
      // Approximate SMS VCounter: 0..(vblankStartLine-1) -> 0x00.., VBlank region -> 0xC0.. up
      const inVBlank = s.line >= s.vblankStartLine;
      const v = inVBlank ? 0xc0 + (s.line - s.vblankStartLine) : s.line;
      return v & 0xff;
    }
    if (p === 0xbf) {
      // Status read: return and clear VBlank/line irq flags
      const v = s.status & 0xff;
      // Clear VBlank flag (bit 7) and wire
      s.status &= ~0x80;
      s.irqVLine = false;
      s.latch = null; // reading status clears latch on real hardware
      return v;
    }
    // 0xbe data port read: buffered VRAM read
    const v = s.readBuffer;
    s.readBuffer = s.vram[s.addr & 0x3fff]!;
    s.addr = (s.addr + s.autoInc) & 0x3fff;
    return v;
  };

  const writePort = (port: number, val: number): void => {
    const p = port & 0xff;
    const v = val & 0xff;
    if (p === 0xbf) {
      writeControl(v);
      return;
    }
    // 0xbe data port write: handle VRAM or CRAM writes depending on code
    if (p === 0xbe) {
      // Data port writes: treat code 3 as CRAM; otherwise VRAM.
      // This matches test expectations and common VDP behavior where data writes go to VRAM
      // regardless of the read/write address setup code, except when explicitly set to CRAM (code 3).
      if (s.code === 3) {
        // CRAM write (SMS)
        const idx = s.addr & 0x1f; // 32 entries
        s.cram[idx] = v & 0x3f; // 6-bit RGB on SMS
        s.cramWrites++;
        s.lastCramIndex = idx;
        s.lastCramValue = v & 0x3f;
      } else {
        // VRAM write (for code 0 or 1)
        const a = s.addr & 0x3fff;
        s.vram[a] = v;
        s.vramWrites++;
        if (v !== 0) {
          s.nonZeroVramWrites++;
          s.lastNonZeroVramAddr = a;
        }
      }
      s.addr = (s.addr + s.autoInc) & 0x3fff;
      return;
    }
  };

  const tickCycles = (cpuCycles: number): void => {
    // Advance fixed-point HCounter accumulator (scale by 256 per CPU cycle)
    s.hcScaled += cpuCycles << 8;

    s.cycleAcc += cpuCycles;
    while (s.cycleAcc >= s.cyclesPerLine) {
      s.cycleAcc -= s.cyclesPerLine;
      // Maintain hcScaled modulo one line in lockstep with line progression
      s.hcScaled -= s.cyclesPerLine << 8;
      s.line++;
      if (s.line === s.vblankStartLine) {
        // Enter VBlank
        s.status |= 0x80; // set VBlank flag
        // Gate IRQ on reg1 bit 5 (VBlank IRQ enable)
        if (((s.regs[1] ?? 0) & 0x20) !== 0) s.irqVLine = true; // raise IRQ line
      }
      if (s.line >= s.linesPerFrame) {
        // New frame
        s.line = 0;
        // Reset per-line scroll buffer to current global value
        s.hScrollLine.fill(s.regs[8] ?? 0);
        // Clear VBlank flag at start of new frame if it wasn't read
        s.status &= ~0x80;
        // Also clear IRQ if VBlank flag was cleared
        if (((s.regs[1] ?? 0) & 0x20) !== 0 && (s.status & 0x80) === 0) {
          s.irqVLine = false;
        }
      }
    }
    // Keep hcScaled within range even if cpuCycles were very large (avoid drift)
    const lineSpan = s.cyclesPerLine << 8;
    if (s.hcScaled >= lineSpan) s.hcScaled %= lineSpan;
    if (s.hcScaled < 0) s.hcScaled = ((s.hcScaled % lineSpan) + lineSpan) % lineSpan;
  };

  const hasIRQ = (): boolean => s.irqVLine;

  const getState = (): VdpPublicState => {
    const regs = Array.from(s.regs, x => x & 0xff);
    const r1 = regs[1] ?? 0;
    const vblankIrqEnabled = (r1 & 0x20) !== 0;
    const displayEnabled = (r1 & 0x40) !== 0;
    // Fix address calculations to match SMS hardware
    // Name table is at bits 3-1 of R2 (not 7-1) for Mode 4
    const nameTableBase = (((regs[2] ?? 0) >> 1) & 0x07) << 11; // R2[3:1] << 11 (0x0000, 0x0800, 0x1000...0x3800)
    const bgPatternBase = 0x0000;
    const spriteAttrBase = ((regs[5] ?? 0) & 0x7e) << 7; // R5[6:1] << 7
    const spritePatternBase = (regs[6] ?? 0) & 0x04 ? 0x2000 : 0x0000; // R6[2] selects 0x0000 or 0x2000
    const borderColor = (regs[7] ?? 0) & 0x0f;
    const hScroll = regs[8] ?? 0; // Horizontal scroll value
    const vScroll = regs[9] ?? 0; // Vertical scroll value
    return {
      regs,
      status: s.status & 0xff,
      line: s.line | 0,
      cyclesPerLine: s.cyclesPerLine | 0,
      linesPerFrame: s.linesPerFrame | 0,
      vblankIrqEnabled,
      displayEnabled,
      nameTableBase,
      bgPatternBase,
      spriteAttrBase,
      spritePatternBase,
      borderColor,
      hScroll,
      vScroll,
      curAddr: s.addr & 0x3fff,
      curCode: s.code & 0x03,
      lastHcRaw: s.lastHcRaw & 0xff,
      cram: Array.from(s.cram, x => x & 0xff),
      vram: Array.from(s.vram, x => x & 0xff),
      vramWrites: s.vramWrites | 0,
      cramWrites: s.cramWrites | 0,
      lastCramIndex: s.lastCramIndex | 0,
      lastCramValue: s.lastCramValue & 0x3f,
      nonZeroVramWrites: s.nonZeroVramWrites | 0,
      lastNonZeroVramAddr: s.lastNonZeroVramAddr | 0,
    };
  };

  const renderFrame = (): Uint8Array => {
    // Create RGB frame buffer (256x192 pixels, 3 bytes per pixel)
    const frameBuffer = new Uint8Array(256 * 192 * 3);
    // Priority mask: 1 where BG tile has priority set AND BG pixel color != 0
    const prioMask = new Uint8Array(256 * 192);

    // Check if display is enabled
    const displayEnabled = ((s.regs[1] ?? 0) & 0x40) !== 0;
    if (!displayEnabled) {
      // Return black screen
      return frameBuffer;
    }

    // Get base addresses from registers
    // SMS Mode 4 register mappings:
    // Name table: R2[3:1] selects one of 8 possible 2KB name tables (0x0000, 0x0800, 0x1000...0x3800)
    // Pattern table for BG: ALWAYS at 0x0000 in SMS Mode 4 (R4 is unused for BG patterns)
    // Sprite attribute table: R5[6:1] defines A13-A7 (shifted left 7)
    // Sprite pattern: 0x0000 if R6[2]=0, 0x2000 if R6[2]=1
    const nameTableBase = (((s.regs[2] ?? 0) >> 1) & 0x07) << 11; // R2[3:1] << 11
    const patternBase = 0x0000; // SMS Mode 4 BG pattern base fixed at 0x0000
    const spriteAttrBase = ((s.regs[5] ?? 0) & 0x7e) << 7; // Bits 6-1 of R5
    const spritePatternBase = (s.regs[6] ?? 0) & 0x04 ? 0x2000 : 0x0000; // Bit 2 of R6
    const bgColor = (s.regs[7] ?? 0) & 0x0f; // Background color index

    // Convert SMS palette entry to RGB
    const paletteToRGB = (palIdx: number): [number, number, number] => {
      const entry = (s.cram[palIdx & 0x1f] ?? 0) & 0x3f;
      // SMS palette: 00BBGGRR (2 bits per component)
      const r = ((entry & 0x03) * 85) & 0xff; // 0,85,170,255
      const g = (((entry >> 2) & 0x03) * 85) & 0xff;
      const b = (((entry >> 4) & 0x03) * 85) & 0xff;
      return [r, g, b];
    };

    // Fill with background color (using BG palette, first 16 colors)
    const [bgR, bgG, bgB] = paletteToRGB(bgColor); // Background color from BG palette
    for (let i = 0; i < 256 * 192; i++) {
      frameBuffer[i * 3] = bgR;
      frameBuffer[i * 3 + 1] = bgG;
      frameBuffer[i * 3 + 2] = bgB;
    }

    // Get scrolling values
    const hScrollGlobal = s.regs[8] ?? 0; // Horizontal scroll (0-255)
    const vScroll = s.regs[9] ?? 0; // Vertical scroll (0-223 typically)

    // Render background tiles (name table) with scrolling
    for (let screenY = 0; screenY < 192; screenY++) {
      for (let screenX = 0; screenX < 256; screenX++) {
        // Calculate the actual position in the tilemap after scrolling
        const scrolledY = (screenY + vScroll) & 0xff; // Wrap at 256
        // Use per-scanline captured HScroll if available, else global
        const hScrollLine = s.hScrollLine[screenY] ?? hScrollGlobal;
        const scrolledX = (screenX - hScrollLine) & 0xff; // SMS scrolls left (subtract)

        const tileY = scrolledY >> 3; // Divide by 8 to get tile row
        const tileX = scrolledX >> 3; // Divide by 8 to get tile column
        const pixelY = scrolledY & 7; // Y position within the tile
        const pixelX = scrolledX & 7; // X position within the tile

        // Calculate name table index (handle wrapping for extended tilemaps)
        const nameIdx = ((tileY & 0x1f) * 32 + (tileX & 0x1f)) & 0x7ff;
        const nameAddr = (nameTableBase + nameIdx * 2) & 0x3fff;

        // Each name table entry is 2 bytes
        const nameLow = s.vram[nameAddr] ?? 0;
        const nameHigh = s.vram[nameAddr + 1] ?? 0;

        // Extract tile number and attributes
        const tileNum = nameLow | ((nameHigh & 0x01) << 8); // tile number (high bit present but BG fetch uses banked 8-bit index)
        const hFlip = (nameHigh & 0x02) !== 0;
        const vFlip = (nameHigh & 0x04) !== 0;
        const palette = (nameHigh & 0x08) !== 0 ? 1 : 0; // 0=BG palette, 1=sprite palette (ignored for BG on SMS)
        const priority = (nameHigh & 0x10) !== 0;

        // Don't skip tile 0 for background - it's valid
        // Only sprites have transparent tile 0

        // Each tile is 32 bytes (8x8 pixels, 4 bits per pixel)
        // BG pattern fetch uses 10-bit tile index in SMS Mode 4 (0..511) at fixed base 0x0000
        const tileAddr = (patternBase + ((tileNum & 0x3ff) << 5)) & 0x3fff;

        // Get the specific pixel from the tile
        const sx = hFlip ? 7 - pixelX : pixelX;
        const sy = vFlip ? 7 - pixelY : pixelY;

        // SMS tiles are 32 bytes: 8 rows × 4 bytes per row
        // Each row has 4 bytes representing 4 bitplanes
        // Pixels are stored with MSB on the left
        const rowAddr = (tileAddr + sy * 4) & 0x3fff;
        const bit = 7 - sx; // MSB first

        // Read 4 bitplanes for this pixel
        const plane0 = ((s.vram[rowAddr] ?? 0) >> bit) & 1;
        const plane1 = ((s.vram[rowAddr + 1] ?? 0) >> bit) & 1;
        const plane2 = ((s.vram[rowAddr + 2] ?? 0) >> bit) & 1;
        const plane3 = ((s.vram[rowAddr + 3] ?? 0) >> bit) & 1;

        // Combine planes to get color index (0-15)
        const colorIdx = plane0 | (plane1 << 1) | (plane2 << 2) | (plane3 << 3);

        // For backgrounds, color 0 is not transparent - it uses palette color 0
        // We only skip if this is the BG fill color already there

        // Write to frame buffer
        const fbIdx = (screenY * 256 + screenX) * 3;
        // On Master System (Mode 4), BG tiles always use the background palette (0..15).
        // The palette select bit is only meaningful on Game Gear; ignore it here.
        const [r, g, b] = paletteToRGB(colorIdx & 0x0f);

        frameBuffer[fbIdx] = r;
        frameBuffer[fbIdx + 1] = g;
        frameBuffer[fbIdx + 2] = b;
        // Record priority mask only when non-zero BG pixel
        if (priority && colorIdx !== 0) prioMask[screenY * 256 + screenX] = 1;
      }
    }

    // Render sprites
    // SMS can display up to 64 sprites, with max 8 per scanline
    const spriteSize = ((s.regs[1] ?? 0) & 0x02) !== 0 ? 16 : 8; // 8x8 or 8x16 sprites
    const spriteMag = ((s.regs[1] ?? 0) & 0x01) !== 0; // Sprite magnification (zoom)
    const actualSpriteWidth = spriteMag ? 16 : 8;
    const actualSpriteHeight = spriteMag ? spriteSize * 2 : spriteSize;

    // Determine sprite terminator: first Y==0xD0 from index 0..63 disables subsequent entries
    let activeSprites = 64;
    for (let i = 0; i < 64; i++) {
      const y = s.vram[(spriteAttrBase + i) & 0x3fff] ?? 0;
      if (y === 0xd0) { activeSprites = i; break; }
    }

    // Precompute which sprites are allowed per scanline under 8-sprite-per-line limit.
    const perLineCount = new Uint16Array(192);
    const allowed: Uint8Array[] = Array.from({ length: 192 }, () => new Uint8Array(64));
    for (let i = 0; i < activeSprites; i++) {
      const y = s.vram[(spriteAttrBase + i) & 0x3fff] ?? 0;
      if (y >= 0xe0) continue; // off-screen
      const displayY = y + 1;
      const spriteSize = ((s.regs[1] ?? 0) & 0x02) !== 0 ? 16 : 8;
      const spriteMag = ((s.regs[1] ?? 0) & 0x01) !== 0;
      const actualSpriteHeight = spriteMag ? spriteSize * 2 : spriteSize;
      for (let sy = 0; sy < actualSpriteHeight; sy++) {
        const line = displayY + sy;
        if (line < 0 || line >= 192) continue;
        if (perLineCount[line] < 8) {
          allowed[line][i] = 1;
          perLineCount[line]++;
        }
      }
    }

    // Process sprites in reverse order (sprite 0 has highest priority)
    for (let spriteNum = activeSprites - 1; spriteNum >= 0; spriteNum--) {
      // Read sprite Y from sprite attribute table (SAT)
      const satYAddr = (spriteAttrBase + spriteNum) & 0x3fff;
      const spriteY = s.vram[satYAddr] ?? 0;

      // Y=0xD0 is the sprite list terminator
      if (spriteY === 0xd0) continue;

      // Sprites with Y >= 0xE0 are also treated as off-screen
      if (spriteY >= 0xe0) continue;

      // Read sprite X and pattern from extended SAT (starts at SAT + 128)
      const satXAddr = (spriteAttrBase + 128 + spriteNum * 2) & 0x3fff;
      const spriteX = s.vram[satXAddr] ?? 0;
      const spritePattern = s.vram[satXAddr + 1] ?? 0;

      // Adjust Y coordinate (Y+1 is the actual display line)
      // Note: Don't mask with 0xff yet - we need the full value for off-screen checks
      const displayY = spriteY + 1;

      // Skip if sprite is completely off-screen (top or bottom)
      // Sprites with Y=255 will have displayY=256 and should be off-screen
      if (displayY >= 192 + actualSpriteHeight || displayY + actualSpriteHeight <= 0) continue;

      // For 8x16 sprites, pattern number's LSB is ignored (patterns must be even)
      const patternNum = spriteSize === 16 ? spritePattern & 0xfe : spritePattern;

      // Render sprite pixels
      for (let sy = 0; sy < actualSpriteHeight; sy++) {
        const screenY = displayY + sy;
        if (screenY >= 192) break; // Off bottom of screen
        if (screenY < 0) continue; // Off top of screen

        // If this sprite is not allowed on this scanline (due to 8-sprite limit), skip this line for this sprite
        if (!allowed[screenY][spriteNum]) continue;
        // We no longer need to count here, it was done in the pre-pass
        let drewAnyPixelThisLine = false;

        for (let sx = 0; sx < actualSpriteWidth; sx++) {
          const screenX = spriteX + sx;
          if (screenX >= 256) continue; // Off right edge
          if (screenX < 0) continue; // Off left edge

          // Calculate which pixel of the pattern to use
          const patternX = spriteMag ? sx >> 1 : sx;
          const patternY = spriteMag ? sy >> 1 : sy;

          // For 8x16 sprites, determine which 8x8 tile we're in
          let tileOffset = 0;
          let tileY = patternY;
          if (spriteSize === 16) {
            if (patternY >= 8) {
              tileOffset = 1; // Second tile
              tileY = patternY - 8;
            }
          }

          // Calculate pattern address
          const tileNum = patternNum + tileOffset;
          const tileAddr = (spritePatternBase + tileNum * 32 + tileY * 4) & 0x3fff;
          const bit = 7 - patternX;

          // Read color from 4 bitplanes
          const plane0 = ((s.vram[tileAddr] ?? 0) >> bit) & 1;
          const plane1 = ((s.vram[tileAddr + 1] ?? 0) >> bit) & 1;
          const plane2 = ((s.vram[tileAddr + 2] ?? 0) >> bit) & 1;
          const plane3 = ((s.vram[tileAddr + 3] ?? 0) >> bit) & 1;

          const colorIdx = plane0 | (plane1 << 1) | (plane2 << 2) | (plane3 << 3);

          // Color 0 is transparent for sprites
          if (colorIdx === 0) continue;

          // We don't update counts here; pre-pass decided allowance. Just note we drew a pixel for this sprite/line.
          if (!drewAnyPixelThisLine) {
            drewAnyPixelThisLine = true;
          }

          // If BG priority mask is set here, skip drawing sprite pixel (BG in front)
          if (prioMask[screenY * 256 + screenX]) continue;

          // Sprites always use the sprite palette (colors 16-31)
          const fbIdx = (screenY * 256 + screenX) * 3;
          const [r, g, b] = paletteToRGB(16 + colorIdx);

          frameBuffer[fbIdx] = r;
          frameBuffer[fbIdx + 1] = g;
          frameBuffer[fbIdx + 2] = b;
          // Continue drawing remaining pixels; limit enforced per-scanline per-sprite
        }
      }
    }

    return frameBuffer;
  };

  const getVRAM = (): Uint8Array => s.vram;
  const getCRAM = (): Uint8Array => s.cram;
  const getRegister = (idx: number): number => s.regs[idx & 0x1f] ?? 0;

  return { readPort, writePort, tickCycles, hasIRQ, getState, renderFrame, getVRAM, getCRAM, getRegister };
};
