export interface ControllerState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  button1: boolean; // A/1
  button2: boolean; // B/2
  start: boolean; // Game Gear only
}

export interface IController {
  getState: () => ControllerState;
  setState: (state: Partial<ControllerState>) => void;
  readPort: () => number;
  reset: () => void;
}

export const createController = (): IController => {
  const state: ControllerState = {
    up: false,
    down: false,
    left: false,
    right: false,
    button1: false,
    button2: false,
    start: false,
  };

  const getState = (): ControllerState => ({ ...state });

  const setState = (newState: Partial<ControllerState>): void => {
    Object.assign(state, newState);
  };

  const readPort = (): number => {
    // SMS/GG controller port format (active low - 0 = pressed, 1 = released):
    // Bit 0: Up
    // Bit 1: Down
    // Bit 2: Left
    // Bit 3: Right
    // Bit 4: Button 1 (TL)
    // Bit 5: Button 2 (TR)
    // Bit 6: Usually 1 (unused on SMS)
    // Bit 7: TH output (usually 1)

    let value = 0xff; // All bits high (nothing pressed)

    if (state.up) value &= ~0x01;
    if (state.down) value &= ~0x02;
    if (state.left) value &= ~0x04;
    if (state.right) value &= ~0x08;
    if (state.button1) value &= ~0x10;
    if (state.button2) value &= ~0x20;

    return value;
  };

  const reset = (): void => {
    state.up = false;
    state.down = false;
    state.left = false;
    state.right = false;
    state.button1 = false;
    state.button2 = false;
    state.start = false;
  };

  return {
    getState,
    setState,
    readPort,
    reset,
  };
};

// Game Gear specific - has additional Start button on port 0x00
export interface IGameGearPorts {
  readStartPort: () => number;
  setStartButton: (pressed: boolean) => void;
}

export const createGameGearPorts = (controller: IController): IGameGearPorts => {
  const readStartPort = (): number => {
    // Port 0x00 on Game Gear:
    // Bit 7: Start button (0 = pressed, 1 = released)
    // Other bits: various system flags
    const state = controller.getState();
    return state.start ? 0x7f : 0xff; // Bit 7 low when pressed
  };

  const setStartButton = (pressed: boolean): void => {
    controller.setState({ start: pressed });
  };

  return {
    readStartPort,
    setStartButton,
  };
};
