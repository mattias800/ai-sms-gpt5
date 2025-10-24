import { createMachine } from '../src/machine/machine.js';
import * as fs from 'fs';
import * as readline from 'readline';

const runControllerDemo = async () => {
  // Check for ROM path
  const romPath = process.argv[2];
  if (!romPath || !fs.existsSync(romPath)) {
    console.error('Usage: npx tsx tools/controller_demo.ts <path-to-rom>');
    console.error('Example: npx tsx tools/controller_demo.ts /path/to/sonic.sms');
    process.exit(1);
  }

  console.log(`Loading ROM: ${romPath}`);
  const romData = fs.readFileSync(romPath);
  const cartridge = { rom: new Uint8Array(romData) };

  const machine = createMachine({ cart: cartridge });
  const controller1 = machine.getController1();
  const controller2 = machine.getController2();

  // Set up keyboard input
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  console.log('\n=== SMS Controller Demo ===');
  console.log('Controls:');
  console.log('  Arrow Keys: D-Pad');
  console.log('  Z: Button 1');
  console.log('  X: Button 2');
  console.log('  Q: Quit');
  console.log('\nPress keys to test controller input...\n');

  // Track key states
  const keyStates = new Map<string, boolean>();

  // Update controller based on key states
  const updateController = () => {
    controller1.setState({
      up: keyStates.get('up') || false,
      down: keyStates.get('down') || false,
      left: keyStates.get('left') || false,
      right: keyStates.get('right') || false,
      button1: keyStates.get('z') || false,
      button2: keyStates.get('x') || false,
    });

    // Show current state
    const state = controller1.getState();
    const port = controller1.readPort();
    process.stdout.write('\r');
    process.stdout.write(`Controller: `);
    process.stdout.write(state.up ? '↑' : ' ');
    process.stdout.write(state.down ? '↓' : ' ');
    process.stdout.write(state.left ? '←' : ' ');
    process.stdout.write(state.right ? '→' : ' ');
    process.stdout.write(state.button1 ? '[1]' : '[ ]');
    process.stdout.write(state.button2 ? '[2]' : '[ ]');
    process.stdout.write(`  Port: 0x${port.toString(16).padStart(2, '0').toUpperCase()}  `);
  };

  // Handle keypress events
  process.stdin.on('keypress', (str, key) => {
    if (!key) return;

    if (key.name === 'q') {
      console.log('\n\nExiting...');
      process.exit(0);
    }

    // Map keys to controller buttons
    const mapping: { [key: string]: string } = {
      up: 'up',
      down: 'down',
      left: 'left',
      right: 'right',
      z: 'z',
      x: 'x',
    };

    const mappedKey = mapping[key.name || ''];
    if (mappedKey) {
      // Toggle key state
      keyStates.set(mappedKey, !keyStates.get(mappedKey));
      updateController();
    }
  });

  // Run emulation in background
  const running = true;
  const runEmulation = () => {
    if (!running) return;

    // Run one frame
    machine.runCycles(59736); // ~228 cycles/line * 262 lines

    // Read controller port to verify it's working
    const bus = machine.getBus();
    const portValue = bus.readIO8(0xdc); // Port A (Player 1)

    // Continue running
    setTimeout(runEmulation, 16); // ~60 FPS
  };

  // Initial display
  updateController();

  // Start emulation
  runEmulation();
};

runControllerDemo().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
