import { describe, it, expect } from 'vitest';
import { createVDP } from '../../src/vdp/vdp.js';

// Helper to write a VDP register via control port 0xBF
const writeReg = (vdp: ReturnType<typeof createVDP>, reg: number, val: number): void => {
  vdp.writePort(0xbf, val & 0xff);
  vdp.writePort(0xbf, 0x80 | (reg & 0x0f));
};

// Helper to set address/code for data port writes
// code: 0=VRAM read, 1=VRAM write, 3=CRAM write
const setAddr = (vdp: ReturnType<typeof createVDP>, addr: number, code: 0 | 1 | 3): void => {
  const a = addr & 0x3fff;
  vdp.writePort(0xbf, a & 0xff); // low
  const codeBits = (code & 0x03) << 6;
  vdp.writePort(0xbf, codeBits | ((a >>> 8) & 0x3f));
};

// Helper to write a byte via data port 0xBE
const writeData = (vdp: ReturnType<typeof createVDP>, val: number): void => {
  vdp.writePort(0xbe, val & 0xff);
};

describe('VDP IRQ/status branch coverage', (): void => {
  it('enabling VBlank IRQ during active VBlank asserts irq line immediately and status is cleared on read', (): void => {
    const vdp = createVDP();
    const st0 = vdp.getState!();
    const cpl = st0.cyclesPerLine | 0;
    const vblankStart = (st0 as any).vblankStartLine ?? 192; // public getter provided in getState

    // Advance to start of VBlank so status bit 7 is set
    vdp.tickCycles(cpl * vblankStart);
    const beforeStatus = vdp.getState!().status & 0xff;
    expect((beforeStatus & 0x80) !== 0).toBe(true);

    // Enable VBlank IRQ (R1 bit5). Since status has VBlank set, irqVLine should assert immediately.
    writeReg(vdp, 1, 0x20);
    expect(vdp.hasIRQ()).toBe(true);

    // Reading status should clear bit7 and drop irq line
    const sPrev = vdp.readPort(0xbf) & 0xff;
    expect((sPrev & 0x80) !== 0).toBe(true);
    const after = vdp.getState!();
    expect((after.status & 0x80) !== 0).toBe(false);
    expect(vdp.hasIRQ()).toBe(false);
  });

  it('line IRQ path asserts when R0 bit4 enabled and lineCounter underflows; status read clears bit5', (): void => {
    const vdp = createVDP();
    const st0 = vdp.getState!();
    const cpl = st0.cyclesPerLine | 0;

    // Enable line IRQs (R0 bit4) and initialize line counter to 1 so it underflows after one line
    writeReg(vdp, 0, 0x10);
    writeReg(vdp, 10, 0x01);

    // Advance two lines so the counter (1) decrements to 0 then asserts on the next line boundary
    vdp.tickCycles(cpl * 2);

    // IRQ line should assert; status should have bit5 set (we proxy line IRQ into status bit5)
    expect(vdp.hasIRQ()).toBe(true);
    const statusBefore = vdp.getState!().status & 0xff;
    expect((statusBefore & 0x20) !== 0).toBe(true);

    // Reading status should clear bit5 and drop irq line
    const prev = vdp.readPort(0xbf) & 0xff;
    expect((prev & 0x20) !== 0).toBe(true);
    const after = vdp.getState!();
    expect((after.status & 0x20) !== 0).toBe(false);
    expect(vdp.hasIRQ()).toBe(false);
  });

  it('CRAM write path via data port updates palette entry', (): void => {
    const vdp = createVDP();
    // Set CRAM address to index 3 and code=3 (CRAM write)
    setAddr(vdp, 0x0003, 3);
    writeData(vdp, 0x3f); // write white (max components)
    const st = vdp.getState!();
    expect(st.cram[3] & 0x3f).toBe(0x3f);
  });
});

