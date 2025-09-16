import { describe, it, expect } from 'vitest';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

describe('Memory Banking Tests', () => {
  describe('ROM Banking', () => {
    it('should switch ROM banks correctly', () => {
      // Create a 256KB ROM with identifiable patterns in each bank
      const rom = new Uint8Array(256 * 1024);
      for (let bank = 0; bank < 16; bank++) {
        const bankStart = bank * 0x4000;
        // Mark each bank with its number
        rom[bankStart] = bank;
        rom[bankStart + 1] = 0xBA;
        rom[bankStart + 2] = 0xBE;
      }
      
      const cart: Cartridge = { rom };
      const m = createMachine({ cart,  });
      const bus = m.getBus();
      
      // Test initial banks (0, 1, 2)
      expect(bus.read8(0x0000)).toBe(0); // Bank 0
      expect(bus.read8(0x4000)).toBe(1); // Bank 1
      expect(bus.read8(0x8000)).toBe(2); // Bank 2
      
      // Switch bank 1 to bank 5
      bus.write8(0xFFFD, 5);
      expect(bus.read8(0x4000)).toBe(5);
      expect(bus.read8(0x4001)).toBe(0xBA);
      
      // Switch bank 2 to bank 10
      bus.write8(0xFFFE, 10);
      expect(bus.read8(0x8000)).toBe(10);
      expect(bus.read8(0x8001)).toBe(0xBA);
      
      // First 1KB should always be bank 0
      expect(bus.read8(0x0000)).toBe(0);
      expect(bus.read8(0x03FF)).toBe(rom[0x03FF]);
    });

    it('should handle bank number wrap-around', () => {
      const rom = new Uint8Array(64 * 1024); // 4 banks
      for (let bank = 0; bank < 4; bank++) {
        rom[bank * 0x4000] = bank;
      }
      
      const cart: Cartridge = { rom };
      const m = createMachine({ cart,  });
      const bus = m.getBus();
      
      // Bank 5 should wrap to bank 1 (5 % 4 = 1)
      bus.write8(0xFFFD, 5);
      expect(bus.read8(0x4000)).toBe(1);
      
      // Bank 10 should wrap to bank 2 (10 % 4 = 2)
      bus.write8(0xFFFE, 10);
      expect(bus.read8(0x8000)).toBe(2);
    });
  });

  describe('RAM Mirroring', () => {
    it('should mirror RAM correctly', () => {
      const cart: Cartridge = { rom: new Uint8Array(0x4000) };
      const m = createMachine({ cart,  });
      const bus = m.getBus();
      
      // Write to main RAM
      bus.write8(0xC000, 0x42);
      
      // Should be mirrored at 0xE000
      expect(bus.read8(0xE000)).toBe(0x42);
      
      // Write to mirror should affect main
      bus.write8(0xE123, 0x99);
      expect(bus.read8(0xC123)).toBe(0x99);
      
      // Test wrap around
      bus.write8(0xDFFF, 0xAA);
      expect(bus.read8(0xFFFF)).toBe(0xAA);
    });
  });

  describe('RAM in Slot 0', () => {
    it('should map RAM to slot 0 when enabled', () => {
      const cart: Cartridge = { rom: new Uint8Array(0x8000) };
      const m = createMachine({ cart,  });
      const bus = m.getBus();
      
      // Initially, slot 0 should be ROM
      const romValue = bus.read8(0x0000);
      
      // Enable RAM in slot 0 (bit 3 of 0xFFFC)
      bus.write8(0xFFFC, 0x08);
      
      // Now slot 0 should mirror system RAM
      bus.write8(0xC000, 0x55);
      expect(bus.read8(0x0000)).toBe(0x55);
      
      // Writing to slot 0 should affect system RAM
      bus.write8(0x0100, 0x77);
      expect(bus.read8(0xC100)).toBe(0x77);
      
      // Disable RAM in slot 0
      bus.write8(0xFFFC, 0x00);
      
      // Should be back to ROM
      expect(bus.read8(0x0000)).toBe(romValue);
    });
  });

  describe('Cartridge RAM', () => {
    it('should support cartridge RAM when enabled', () => {
      const cart: Cartridge = { rom: new Uint8Array(0x10000) };
      const m = createMachine({ cart,  });
      const bus = m.getBus();
      
      // Initially, 0x8000-0xBFFF should be ROM
      const romValue = bus.read8(0x8000);
      
      // Enable cartridge RAM (implementation specific)
      // This would typically be done via port 0x3E
      // For now, test that the infrastructure exists
      expect(() => bus.write8(0x8000, 0x42)).not.toThrow();
    });
  });
});
