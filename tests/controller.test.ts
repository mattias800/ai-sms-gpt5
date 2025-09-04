import { describe, it, expect } from 'vitest';
import { createController } from '../src/io/controller.js';

describe('SMS Controller', () => {
  it('should return 0xFF when no buttons are pressed', () => {
    const controller = createController();
    expect(controller.readPort()).toBe(0xff);
  });

  it('should set correct bit when up is pressed', () => {
    const controller = createController();
    controller.setState({ up: true });
    // Bit 0 should be low (0) when up is pressed
    expect(controller.readPort() & 0x01).toBe(0);
  });

  it('should set correct bit when down is pressed', () => {
    const controller = createController();
    controller.setState({ down: true });
    // Bit 1 should be low (0) when down is pressed
    expect(controller.readPort() & 0x02).toBe(0);
  });

  it('should set correct bit when left is pressed', () => {
    const controller = createController();
    controller.setState({ left: true });
    // Bit 2 should be low (0) when left is pressed
    expect(controller.readPort() & 0x04).toBe(0);
  });

  it('should set correct bit when right is pressed', () => {
    const controller = createController();
    controller.setState({ right: true });
    // Bit 3 should be low (0) when right is pressed
    expect(controller.readPort() & 0x08).toBe(0);
  });

  it('should set correct bit when button 1 is pressed', () => {
    const controller = createController();
    controller.setState({ button1: true });
    // Bit 4 should be low (0) when button1 is pressed
    expect(controller.readPort() & 0x10).toBe(0);
  });

  it('should set correct bit when button 2 is pressed', () => {
    const controller = createController();
    controller.setState({ button2: true });
    // Bit 5 should be low (0) when button2 is pressed
    expect(controller.readPort() & 0x20).toBe(0);
  });

  it('should handle multiple buttons pressed simultaneously', () => {
    const controller = createController();
    controller.setState({
      up: true,
      button1: true,
      button2: true,
    });
    const port = controller.readPort();
    // Up (bit 0), Button1 (bit 4), and Button2 (bit 5) should be low
    expect(port & 0x01).toBe(0); // Up pressed
    expect(port & 0x10).toBe(0); // Button 1 pressed
    expect(port & 0x20).toBe(0); // Button 2 pressed
    // Others should be high
    expect(port & 0x02).not.toBe(0); // Down not pressed
    expect(port & 0x04).not.toBe(0); // Left not pressed
    expect(port & 0x08).not.toBe(0); // Right not pressed
  });

  it('should clear all buttons when reset', () => {
    const controller = createController();
    controller.setState({
      up: true,
      down: true,
      left: true,
      right: true,
      button1: true,
      button2: true,
    });

    controller.reset();
    expect(controller.readPort()).toBe(0xff);
  });

  it('should preserve state when getting state', () => {
    const controller = createController();
    controller.setState({
      up: true,
      button1: true,
    });

    const state = controller.getState();
    expect(state.up).toBe(true);
    expect(state.down).toBe(false);
    expect(state.button1).toBe(true);
    expect(state.button2).toBe(false);
  });
});
