import React from 'react';

interface ControlsProps {
  onReset: () => void;
  onPause: () => void;
  onMute: () => void;
  isPaused: boolean;
  isMuted: boolean;
  isRomLoaded: boolean;
  onToggleOverlay: () => void;
  overlayEnabled: boolean;
  onToggleIgnorePriority: () => void;
  ignorePriorityEnabled: boolean;
  onToggleIgnoreSpriteLimit: () => void;
  ignoreSpriteLimitEnabled: boolean;
  onToggleBiosOnly: () => void;
  biosOnlyEnabled: boolean;
}

export const Controls: React.FC<ControlsProps> = ({
  onReset,
  onPause,
  onMute,
  isPaused,
  isMuted,
  isRomLoaded,
  onToggleOverlay,
  overlayEnabled,
  onToggleIgnorePriority,
  ignorePriorityEnabled,
  onToggleIgnoreSpriteLimit,
  ignoreSpriteLimitEnabled,
  onToggleBiosOnly,
  biosOnlyEnabled,
}) => {
  return (
    <div className="controls">
      <button onClick={onPause} disabled={!isRomLoaded}>
        {isPaused ? 'Resume' : 'Pause'}
      </button>
      <button onClick={onReset} disabled={!isRomLoaded}>
        Reset
      </button>
      <button onClick={onMute} disabled={!isRomLoaded}>
        {isMuted ? 'Unmute' : 'Mute'}
      </button>
      <button onClick={onToggleOverlay} disabled={!isRomLoaded}>
        {overlayEnabled ? 'Hide Overlay' : 'Show Overlay'}
      </button>
      <button onClick={onToggleIgnorePriority} disabled={!isRomLoaded}>
        {ignorePriorityEnabled ? 'BG Priority: OFF' : 'BG Priority: ON'}
      </button>
      <button onClick={onToggleIgnoreSpriteLimit} disabled={!isRomLoaded}>
        {ignoreSpriteLimitEnabled ? 'Sprite Limit: OFF' : 'Sprite Limit: ON'}
      </button>
      <button onClick={onToggleBiosOnly}>
        {biosOnlyEnabled ? 'BIOS-only: ON' : 'BIOS-only: OFF'}
      </button>
    </div>
  );
};
