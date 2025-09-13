import React from 'react';

interface EmulatorScreenProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
}

export const EmulatorScreen: React.FC<EmulatorScreenProps> = ({ canvasRef }) => {
  return (
    <div className="emulator-screen" style={{ position: 'relative', width: '512px', height: '384px' }}>
      <canvas
        ref={canvasRef}
        width={256}
        height={192}
        style={{
          width: '512px',
          height: '384px',
          imageRendering: 'pixelated',
          backgroundColor: '#000',
          position: 'absolute',
          left: 0,
          top: 0,
          zIndex: 0,
        }}
      />
      <canvas
        id="overlay-canvas"
        width={256}
        height={192}
        style={{
          width: '512px',
          height: '384px',
          imageRendering: 'pixelated',
          position: 'absolute',
          left: 0,
          top: 0,
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
