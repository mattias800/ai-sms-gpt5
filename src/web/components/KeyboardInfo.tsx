import React from 'react';

export const KeyboardInfo: React.FC = () => {
  return (
    <div className="keyboard-info">
      <h3>Controls</h3>
      <ul>
        <li><strong>Arrow Keys:</strong> D-Pad</li>
        <li><strong>Z:</strong> Button 1</li>
        <li><strong>X:</strong> Button 2</li>
        <li><strong>Enter:</strong> Start</li>
      </ul>
    </div>
  );
};
