import React from 'react';

interface EmulatorScreenProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
}

export const EmulatorScreen: React.FC<EmulatorScreenProps> = ({ canvasRef }) => {
  return (
    <div className="emulator-screen">
      <canvas
        ref={canvasRef}
        width={256}
        height={192}
        style={{
          width: '512px',
          height: '384px',
          imageRendering: 'pixelated',
          backgroundColor: '#000',
        }}
      />
    </div>
  );
};
