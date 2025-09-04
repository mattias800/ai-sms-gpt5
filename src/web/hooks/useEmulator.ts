import { useEffect, useRef, useState, useCallback } from 'react';
import { createMachine, type IMachine } from '../../machine/machine';
import { type IController } from '../../io/controller';

interface UseEmulatorProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  romData: Uint8Array | null;
  isPaused: boolean;
  isMuted: boolean;
  onFpsUpdate: (fps: number) => void;
  onStatusUpdate: (status: string) => void;
}

interface EmulatorInstance {
  reset: () => void;
}

export const useEmulator = ({
  canvasRef,
  romData,
  isPaused,
  isMuted,
  onFpsUpdate,
  onStatusUpdate,
}: UseEmulatorProps): EmulatorInstance | null => {
  const machineRef = useRef<IMachine | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sampleBufferRef = useRef<number[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const fpsInfoRef = useRef({ frameCount: 0, lastTime: performance.now() });
  const keyStateRef = useRef({
    up: false,
    down: false,
    left: false,
    right: false,
    button1: false,
    button2: false,
    start: false,
  });

  // Initialize machine when ROM is loaded
  useEffect(() => {
    if (!romData) return;

    try {
      const cartridge = { rom: romData };
      const machine = createMachine({ cart: cartridge });
      machineRef.current = machine;

      // Initialize audio context
      if (!audioContextRef.current) {
        type AudioContextCtor = new (contextOptions?: AudioContextOptions) => AudioContext;
        const getAudioContextCtor = (): AudioContextCtor => {
          const w = window as Window & {
            webkitAudioContext?: AudioContextCtor;
            AudioContext?: AudioContextCtor;
          };
          if (w.AudioContext) return w.AudioContext;
          if (w.webkitAudioContext) return w.webkitAudioContext;
          throw new Error('Web Audio API not supported');
        };
        audioContextRef.current = new (getAudioContextCtor())({
          sampleRate: 44100,
        });

        const bufferSize = 2048;
        audioProcessorRef.current = audioContextRef.current.createScriptProcessor(bufferSize, 0, 1);

        audioProcessorRef.current.onaudioprocess = (e) => {
          const output = e.outputBuffer.getChannelData(0);
          const buffer = sampleBufferRef.current;

          for (let i = 0; i < output.length; i++) {
            if (buffer.length > 0) {
              output[i] = buffer.shift()! / 32768;
            } else {
              output[i] = 0;
            }
          }
        };
      }

      // Connect audio if not muted
      if (!isMuted && audioProcessorRef.current) {
        audioProcessorRef.current.connect(audioContextRef.current.destination);
      }
    } catch (error) {
      console.error('Error initializing machine:', error);
      onStatusUpdate(`Error: ${(error as Error).message}`);
    }
  }, [romData, onStatusUpdate]);

  // Handle mute/unmute
  useEffect(() => {
    if (!audioProcessorRef.current || !audioContextRef.current) return;

    if (isMuted) {
      audioProcessorRef.current.disconnect();
    } else {
      audioProcessorRef.current.connect(audioContextRef.current.destination);
    }
  }, [isMuted]);

  // Update controller state
  const updateController = useCallback(() => {
    if (!machineRef.current) return;

    const controller = machineRef.current.getController1();
    controller.setState(keyStateRef.current);
  }, []);

  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      let handled = true;
      const state = keyStateRef.current;

      switch (e.key) {
        case 'ArrowUp':
          state.up = true;
          break;
        case 'ArrowDown':
          state.down = true;
          break;
        case 'ArrowLeft':
          state.left = true;
          break;
        case 'ArrowRight':
          state.right = true;
          break;
        case 'z':
        case 'Z':
          state.button1 = true;
          break;
        case 'x':
        case 'X':
          state.button2 = true;
          break;
        case 'Enter':
          state.start = true;
          break;
        default:
          handled = false;
      }

      if (handled) {
        e.preventDefault();
        updateController();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      let handled = true;
      const state = keyStateRef.current;

      switch (e.key) {
        case 'ArrowUp':
          state.up = false;
          break;
        case 'ArrowDown':
          state.down = false;
          break;
        case 'ArrowLeft':
          state.left = false;
          break;
        case 'ArrowRight':
          state.right = false;
          break;
        case 'z':
        case 'Z':
          state.button1 = false;
          break;
        case 'x':
        case 'X':
          state.button2 = false;
          break;
        case 'Enter':
          state.start = false;
          break;
        default:
          handled = false;
      }

      if (handled) {
        e.preventDefault();
        updateController();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [updateController]);

  // Main emulation loop
  useEffect(() => {
    if (!machineRef.current || !canvasRef.current || isPaused) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.createImageData(256, 192);
    let running = true;

    const runFrame = () => {
      if (!running || !machineRef.current) return;

      animationFrameRef.current = requestAnimationFrame(runFrame);

      try {
        const machine = machineRef.current;

        // Run one frame of emulation
        const cyclesPerFrame = 59736; // 228 * 262
        machine.runCycles(cyclesPerFrame);

        // Render frame
        const vdp = machine.getVDP();
        if (vdp.renderFrame) {
          const frameBuffer = vdp.renderFrame();
          const data = imageData.data;

          // Copy RGB data to canvas
          for (let i = 0; i < 256 * 192; i++) {
            const srcIdx = i * 3;
            const dstIdx = i * 4;
            data[dstIdx] = frameBuffer[srcIdx] ?? 0;
            data[dstIdx + 1] = frameBuffer[srcIdx + 1] ?? 0;
            data[dstIdx + 2] = frameBuffer[srcIdx + 2] ?? 0;
            data[dstIdx + 3] = 255;
          }

          ctx.putImageData(imageData, 0, 0);
        }

        // Generate audio samples
        if (audioContextRef.current && !isMuted) {
          const psg = machine.getPSG();
          const samplesPerFrame = Math.floor(44100 / 60);
          const buffer = sampleBufferRef.current;

          // Limit buffer size to prevent lag
          if (buffer.length < 4410) { // 100ms of audio
            for (let i = 0; i < samplesPerFrame; i++) {
              const sample = psg.getSample();
              buffer.push(sample);
            }
          }
        }

        // Update FPS
        const fpsInfo = fpsInfoRef.current;
        fpsInfo.frameCount++;
        const now = performance.now();
        const elapsed = now - fpsInfo.lastTime;

        if (elapsed >= 1000) {
          const fps = Math.round(fpsInfo.frameCount * 1000 / elapsed);
          onFpsUpdate(fps);
          fpsInfo.frameCount = 0;
          fpsInfo.lastTime = now;
        }
      } catch (error) {
        console.error('Emulation error:', error);
        onStatusUpdate(`Error: ${(error as Error).message}`);
        running = false;
      }
    };

    runFrame();

    return () => {
      running = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [romData, isPaused, isMuted, canvasRef, onFpsUpdate, onStatusUpdate]);

  const reset = useCallback(() => {
    if (machineRef.current) {
      const cpu = machineRef.current.getCPU();
      cpu.reset();

      // Also reset VDP and PSG
      const vdp = machineRef.current.getVDP();
      const psg = machineRef.current.getPSG();
      if (psg.reset) psg.reset();

      // Clear controller state
      keyStateRef.current = {
        up: false,
        down: false,
        left: false,
        right: false,
        button1: false,
        button2: false,
        start: false,
      };
      updateController();
    }
  }, [updateController]);

  return romData ? { reset } : null;
};
