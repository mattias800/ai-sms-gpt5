import React, { useState, useRef, useEffect, useCallback } from 'react';
import { EmulatorScreen } from './components/EmulatorScreen';
import { Controls } from './components/Controls';
import { RomLoader } from './components/RomLoader';
import { KeyboardInfo } from './components/KeyboardInfo';
import { useEmulator } from './hooks/useEmulator';
import './App.css';

export const App: React.FC = () => {
  const [romData, setRomData] = useState<Uint8Array | null>(null);
  const [romName, setRomName] = useState<string>('');
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [fps, setFps] = useState(0);
  const [status, setStatus] = useState('Ready to load ROM...');
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [ignorePriorityEnabled, setIgnorePriorityEnabled] = useState(false);
  const [ignoreSpriteLimitEnabled, setIgnoreSpriteLimitEnabled] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const emulator = useEmulator({
    canvasRef,
    romData,
    isPaused,
    isMuted,
    overlayEnabled,
    onFpsUpdate: setFps,
    onStatusUpdate: setStatus,
  });

  const handleRomLoad = useCallback((data: Uint8Array, name: string) => {
    setRomData(data);
    setRomName(name);
    setStatus(`Loaded: ${name} (${(data.length / 1024).toFixed(1)} KB)`);
    setIsPaused(false);
  }, []);

  const handleReset = useCallback(() => {
    if (emulator) {
      emulator.reset();
      setStatus('System reset');
    }
  }, [emulator]);

  const handlePause = useCallback(() => {
    setIsPaused(prev => !prev);
  }, []);

  const handleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  const handleToggleOverlay = useCallback(() => {
    setOverlayEnabled(prev => !prev);
  }, []);

  const handleToggleIgnorePriority = useCallback(() => {
    setIgnorePriorityEnabled(prev => {
      const next = !prev;
      try {
        (globalThis as any).VDP_DEBUG_IGNORE_BG_PRIORITY = next;
      } catch {}
      return next;
    });
  }, []);

  const handleToggleIgnoreSpriteLimit = useCallback(() => {
    setIgnoreSpriteLimitEnabled(prev => {
      const next = !prev;
      try {
        (globalThis as any).VDP_DEBUG_IGNORE_SPRITE_LIMIT = next;
      } catch {}
      return next;
    });
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>SMS/Game Gear Emulator</h1>
        <div className="fps-counter">FPS: {fps}</div>
      </header>

      <main className="app-main">
        <div className="emulator-container">
          <EmulatorScreen canvasRef={canvasRef} />
          
          <Controls
            onReset={handleReset}
            onPause={handlePause}
            onMute={handleMute}
            isPaused={isPaused}
            isMuted={isMuted}
            isRomLoaded={!!romData}
            onToggleOverlay={handleToggleOverlay}
            overlayEnabled={overlayEnabled}
            onToggleIgnorePriority={handleToggleIgnorePriority}
            ignorePriorityEnabled={ignorePriorityEnabled}
            onToggleIgnoreSpriteLimit={handleToggleIgnoreSpriteLimit}
            ignoreSpriteLimitEnabled={ignoreSpriteLimitEnabled}
          />

          <div className="status-bar">{status}</div>
        </div>

        <aside className="app-sidebar">
          <RomLoader onRomLoad={handleRomLoad} />
          <KeyboardInfo />
        </aside>
      </main>
    </div>
  );
};
