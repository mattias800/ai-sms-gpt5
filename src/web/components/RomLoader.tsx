import React, { useCallback } from 'react';

interface RomLoaderProps {
  onRomLoad: (data: Uint8Array, name: string) => void;
}

export const RomLoader: React.FC<RomLoaderProps> = ({ onRomLoad }) => {
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      const uint8Array = new Uint8Array(arrayBuffer);
      onRomLoad(uint8Array, file.name);
    };
    reader.readAsArrayBuffer(file);
  }, [onRomLoad]);

  return (
    <div className="rom-loader">
      <h3>Load ROM</h3>
      <input
        type="file"
        accept=".sms,.gg,.bin,.rom"
        onChange={handleFileSelect}
      />
      <p className="rom-info">
        Supported formats: .sms, .gg, .bin, .rom
      </p>
    </div>
  );
};
