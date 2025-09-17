import { useEffect, useRef, useState, useCallback } from 'react';
import { createMachine, type IMachine } from '../../machine/machine';
import { type IController } from '../../io/controller';

interface UseEmulatorProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  romData: Uint8Array | null;
  isPaused: boolean;
  isMuted: boolean;
  overlayEnabled: boolean;
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
  overlayEnabled,
  onFpsUpdate,
  onStatusUpdate,
}: UseEmulatorProps): EmulatorInstance | null => {
  const machineRef = useRef<IMachine | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sampleBufferRef = useRef<number[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const fpsInfoRef = useRef({ frameCount: 0, lastTime: performance.now() });
  // Detect potential stalls: track the last-seen PC and time when it changed
  const stallRef = useRef<{ lastPc: number; lastChangeTs: number }>({ lastPc: -1, lastChangeTs: performance.now() });
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

    let cancelled = false;
    (async () => {
      try {
        const cartridge = { rom: romData };

        // Try to fetch a BIOS over HTTP: prefer mpr-10052.rom, then bios13fx.sms
        const tryUrls = ['mpr-10052.rom', 'bios13fx.sms'];
        let biosData: Uint8Array | null = null;
        for (const url of tryUrls) {
          try {
            console.log(`[web] Trying BIOS fetch: ${url}`);
            const res = await fetch(url, { cache: 'no-cache' });
            if (res.ok) {
              const ab = await res.arrayBuffer();
              const bytes = new Uint8Array(ab);
              if (bytes.length > 0) {
                biosData = bytes;
                console.log(`[web] BIOS fetch success: ${url} (${bytes.length} bytes)`);
                break;
              } else {
                console.warn(`[web] BIOS fetch empty body: ${url}`);
              }
            } else {
              console.warn(`[web] BIOS fetch HTTP ${res.status}: ${url}`);
            }
          } catch (e) {
            console.warn(`[web] BIOS fetch error: ${url} - ${(e as Error).message}`);
          }
        }

        if (!biosData) {
          console.info('[web] No BIOS found, falling back to manual init');
        } else {
          console.info(`[web] Using BIOS (${biosData.length} bytes)`);
        }

        const machine = biosData
          ? createMachine({ cart: cartridge, useManualInit: false, bus: { bios: biosData } })
          : createMachine({ cart: cartridge, useManualInit: true });
        if (cancelled) return;
        machineRef.current = machine;
        console.log(`[web] Boot mode: ${biosData ? 'BIOS' : 'ManualInit'}`);

        // Expose minimal debug helpers for web console
        try {
          (globalThis as any).EMULATOR = machine;
          (globalThis as any).EMU_PRESS_B1 = (): void => {
            const c = machine.getController1();
            c.setState({ button1: true });
            setTimeout(() => c.setState({ button1: false }), 200);
          };
          (globalThis as any).EMU_PRESS_START = (): void => {
            const c = machine.getController1();
            c.setState({ start: true });
            setTimeout(() => c.setState({ start: false }), 200);
          };
          // Install a lightweight in-browser cycle/window tracer
          (globalThis as any).EMU_TRACE_WINDOW = (ms = 500, pcMin = 0x8b00, pcMax = 0x8cff): Promise<string[]> => {
            const lines: string[] = [];
            const cpu = machine.getCPU();
            const vdp = machine.getVDP();
            const start = performance.now();
            machine.setCycleHook(() => {
              const st = cpu.getState();
              const pc = st.pc & 0xffff;
              if (pc >= (pcMin & 0xffff) && pc <= (pcMax & 0xffff)) {
                const irq = vdp.hasIRQ() ? 1 : 0;
                lines.push(`${pc.toString(16).padStart(4,'0')} IFF1=${st.iff1?1:0} IRQ=${irq}`);
              }
              if (performance.now() - start >= ms) {
                machine.setCycleHook(null);
              }
            });
            return new Promise(resolve => setTimeout(() => resolve(lines), ms + 50));
          };
        } catch {}

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
                // Buffer contains the mixed (DC-free) integer sample ~[-32764, +32764]
                output[i] = (buffer.shift()! / 32768);
              } else {
                // Underflow: output silence, avoid clicks
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
    })();

    return () => { cancelled = true; };
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

      // Attempt to unlock/resume audio on user gesture (browser autoplay policies)
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }

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
          // Map Enter to both Start (GG) and Button1 (SMS) to cover both ROM behaviors
          state.start = true;
          state.button1 = true;
          break;
        case ' ':
          // Space as alternate Button1
          state.button1 = true;
          break;
        case 's':
        case 'S':
          // Explicit Start key
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
          state.button1 = false;
          break;
        case ' ':
          state.button1 = false;
          break;
        case 's':
        case 'S':
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

    // Optional overlay canvas for debug drawing
    const overlayCanvas = document.getElementById('overlay-canvas') as HTMLCanvasElement | null;
    const overlayCtx = overlayCanvas?.getContext('2d') ?? null;

    const imageData = ctx.createImageData(256, 192);
    let running = true;

    // Time-based pacing to avoid tying emulation speed to display refresh rate (e.g., 120/144Hz)
    const timingRef = { accumMs: 0, lastTs: performance.now() };

    const runLoop = () => {
      if (!running || !machineRef.current) return;

      animationFrameRef.current = requestAnimationFrame(runLoop);

      try {
        const machine = machineRef.current;

        // Derive hardware timing
        const vdpState = machine.getVDP().getState ? machine.getVDP().getState?.() : undefined;
        const cyclesPerLine = vdpState?.cyclesPerLine ?? 228;
        const linesPerFrame = vdpState?.linesPerFrame ?? 262;
        const cyclesPerFrame = cyclesPerLine * linesPerFrame;

        // NTSC ≈60Hz (262 lines), PAL ≈50Hz (313 lines). Fallback to 60.
        const targetFps = linesPerFrame >= 300 ? 50 : 60;
        const msPerFrame = 1000 / targetFps;

        const now = performance.now();
        let dt = now - timingRef.lastTs;
        if (dt < 0) dt = 0;
        if (dt > 250) dt = 250; // clamp to avoid huge jumps after tab switches
        timingRef.lastTs = now;
        timingRef.accumMs += dt;

        // Produce audio at the device sample rate
        const sampleRate = audioContextRef.current?.sampleRate ?? 44100;
        const samplesPerFrame = Math.max(1, Math.floor(sampleRate / targetFps));
        const cyclesPerSample = Math.max(1, Math.floor(cyclesPerFrame / samplesPerFrame));
        const wantAudio = !!audioContextRef.current && !isMuted;
        const buffer = sampleBufferRef.current;
        const maxBufferedSamples = Math.floor(sampleRate * 0.1); // ~100ms cap

        // Run as many whole frames as the accumulated time allows, with a safety cap
        const maxFramesPerTick = 5;
        let framesRan = 0;
        while (timingRef.accumMs >= msPerFrame && framesRan < maxFramesPerTick) {
          // Interleave CPU cycles with audio sampling for this emulated frame
          for (let i = 0; i < samplesPerFrame; i++) {
            machine.runCycles(cyclesPerSample);
            if (wantAudio) {
              // Convert from internal sample (range ~[-8192,8191], silence=-8192)
              // to a mixed value centered around 0 by removing the DC offset.
              const s = machine.getPSG().getSample();
              const mixed = (s + 8192) | 0; // remove DC offset -> ~[-?, +32764]
              if (buffer.length < maxBufferedSamples) buffer.push(mixed);
            }
          }
          // Run leftover cycles to complete the frame exactly
          const leftover = cyclesPerFrame - cyclesPerSample * samplesPerFrame;
          if (leftover > 0) machine.runCycles(leftover);

          timingRef.accumMs -= msPerFrame;
          framesRan++;

          // FPS accounting per emulated frame
          const fpsInfo = fpsInfoRef.current;
          fpsInfo.frameCount++;
          const tNow = performance.now();
          const elapsed = tNow - fpsInfo.lastTime;
          if (elapsed >= 1000) {
            const fps = Math.round((fpsInfo.frameCount * 1000) / elapsed);
            onFpsUpdate(fps);
            // Also publish sprite stats into status bar for quick diagnostics
            try {
              const vs = machine.getVDP().getState?.();
              const dbg = machine.getDebugStats?.();
              if (vs) {
                const r1 = vs.regs?.[1] ?? 0;
                const r0 = vs.regs?.[0] ?? 0;
                const vblank = (vs.status & 0x80) !== 0 ? 1 : 0;
                // Update stall detector
                const pcNow = dbg ? (dbg.pc >>> 0) : 0;
                const pcPrev = stallRef.current.lastPc >>> 0;
                const nowMs = tNow;
                if (pcNow !== pcPrev) {
                  stallRef.current.lastPc = pcNow;
                  stallRef.current.lastChangeTs = nowMs;
                }
                const stagnantMs = Math.max(0, nowMs - stallRef.current.lastChangeTs) | 0;
                const stalled = stagnantMs >= 2000; // 2 seconds threshold

                onStatusUpdate(
                  `Sprites: drawn=${vs.spritePixelsDrawn ?? 0} masked=${vs.spritePixelsMaskedByPriority ?? 0} ` +
                  `8/line=${vs.perLineLimitHitLines ?? 0} active=${vs.activeSprites ?? 0} ` +
                  `IRQs:${dbg?.irqAccepted ?? 0} ` +
                  `VDP: line=${vs.line} VB=${vblank} R1=${(r1).toString(16).padStart(2,'0')} R0=${(r0).toString(16).padStart(2,'0')} ` +
                  (typeof vs.lineCounter === 'number' ? `R10=${vs.lineCounter} ` : '') +
                  (typeof (vs as any).vblankCount === 'number' ? `VBcnt=${(vs as any).vblankCount} ` : '') +
                  (typeof (vs as any).statusReadCount === 'number' ? `SR=${(vs as any).statusReadCount} ` : '') +
                  (typeof (vs as any).irqAssertCount === 'number' ? `IRQset=${(vs as any).irqAssertCount} ` : '') +
                  (dbg ? `CPU: IFF1=${dbg.iff1?1:0} IFF2=${dbg.iff2?1:0} IM=${dbg.im} HALT=${dbg.halted?1:0} PC=${(pcNow).toString(16).padStart(4,'0')} EI=${dbg.eiCount??0} DI=${dbg.diCount??0}` +
                    (dbg.lastEiPc ? ` lastEI=${(dbg.lastEiPc>>>0).toString(16).padStart(4,'0')}` : '') +
                    (dbg.lastDiPc ? ` lastDI=${(dbg.lastDiPc>>>0).toString(16).padStart(4,'0')}` : '') : '') +
                  (stalled ? ` [STALL ${Math.floor(stagnantMs/1000)}s]` : '')
                );
              }
            } catch {}
            fpsInfo.frameCount = 0;
            fpsInfo.lastTime = tNow;
          }
        }

        // Render latest frame once per RAF
        const vdp = machine.getVDP();
        if (vdp.renderFrame) {
          const frameBuffer = vdp.renderFrame();
          const data = imageData.data;
          for (let i = 0; i < 256 * 192; i++) {
            const srcIdx = i * 3;
            const dstIdx = i * 4;
            data[dstIdx] = frameBuffer[srcIdx] ?? 0;
            data[dstIdx + 1] = frameBuffer[srcIdx + 1] ?? 0;
            data[dstIdx + 2] = frameBuffer[srcIdx + 2] ?? 0;
            data[dstIdx + 3] = 255;
          }
          ctx.putImageData(imageData, 0, 0);

          // Draw overlay if present
          if (overlayCtx && typeof vdp.getState === 'function') {
            // Show/hide overlay canvas based on toggle
            overlayCtx.canvas.style.visibility = overlayEnabled ? 'visible' : 'hidden';
            overlayCtx.clearRect(0, 0, 256, 192);
            if (overlayEnabled) {
              const vs = vdp.getState();
              const dbg = vs.spriteDebug ?? [];
              // Style config base
              overlayCtx.lineWidth = 1;
              // Draw bounding boxes for all active SAT entries with classification colors
              for (const s of dbg) {
                if (!s) continue;
                // Choose color by state
                let color = 'rgba(255, 0, 0, 0.9)'; // red: drew pixels
                if (s.drawnPixels > 0) color = 'rgba(255, 0, 0, 0.9)';
                else if (s.maskedPixels > 0) color = 'rgba(255, 165, 0, 0.9)'; // orange: masked by BG priority
                else if (s.offscreen) color = 'rgba(0, 128, 255, 0.8)'; // blue: offscreen
                else if (s.terminated) color = 'rgba(128, 128, 128, 0.8)'; // gray: after terminator
                else color = 'rgba(255, 255, 0, 0.9)'; // yellow: present but drew nothing (e.g., limited by 8/line)
                overlayCtx.strokeStyle = color;
                // Clamp box to screen
                const x = Math.max(0, Math.min(255, s.x));
                const y = Math.max(0, Math.min(191, s.y));
                const w = Math.max(0, Math.min(256 - x, s.width));
                const h = Math.max(0, Math.min(192 - y, s.height));
                overlayCtx.strokeRect(x + 0.5, y + 0.5, w, h);
                // draw sprite index label
                overlayCtx.font = '10px monospace';
                overlayCtx.fillStyle = 'rgba(255,255,255,0.8)';
                overlayCtx.fillText(String(s.index), x + 1, y + 9);
              }
            }
          }
        }
      } catch (error) {
        console.error('Emulation error:', error);
        onStatusUpdate(`Error: ${(error as Error).message}`);
        running = false;
      }
    };

    runLoop();

    return () => {
      running = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [romData, isPaused, isMuted, overlayEnabled, canvasRef, onFpsUpdate, onStatusUpdate]);

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
