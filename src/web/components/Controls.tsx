import React from 'react';

interface ControlsProps {
  onReset: () => void;
  onPause: () => void;
  onMute: () => void;
  isPaused: boolean;
  isMuted: boolean;
  isRomLoaded: boolean;
}

export const Controls: React.FC<ControlsProps> = ({
  onReset,
  onPause,
  onMute,
  isPaused,
  isMuted,
  isRomLoaded,
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
    </div>
  );
};
