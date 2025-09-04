# SMS/Game Gear Web Emulator

A browser-based Sega Master System and Game Gear emulator with full graphics, sound, and controller support.

## Running the Emulator

1. Build the TypeScript code:
   ```bash
   npm run build
   ```

2. Start the web server:
   ```bash
   npm run web
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:8080/web/
   ```

## Features

- **Full SMS/Game Gear emulation** with accurate Z80 CPU
- **Graphics rendering** with sprites, backgrounds, and scrolling
- **PSG sound emulation** with 3 tone channels and 1 noise channel
- **Controller support** via keyboard input
- **Drag & drop ROM loading** or file picker
- **Real-time FPS counter**
- **Pause/Resume functionality**
- **Audio mute toggle**
- **System reset**

## Controls

| Key | Action |
|-----|--------|
| Arrow Keys | D-Pad |
| Z | Button 1 |
| X | Button 2 |
| Enter | Start (Game Gear) |

## Supported ROM Formats

- `.sms` - Sega Master System
- `.gg` - Game Gear
- `.sg` - SG-1000
- `.bin` - Generic binary

## Browser Requirements

- Modern browser with ES6 module support
- Web Audio API support
- Canvas 2D rendering

## Performance Tips

- The emulator runs at 60 FPS
- For best performance, use Chrome or Firefox
- Close other tabs to reduce CPU usage
- The emulator automatically pauses when the tab is hidden

## Troubleshooting

### No Sound
- Click anywhere on the page first (browsers require user interaction for audio)
- Check that audio is not muted (both in emulator and system)
- Try refreshing the page

### Poor Performance
- Ensure hardware acceleration is enabled in your browser
- Close other resource-intensive applications
- Try a different browser

### ROM Won't Load
- Ensure the ROM file is not corrupted
- Check the browser console for error messages
- Try a different ROM file

## Development

To run in development mode without rebuilding:
```bash
npm run web:dev
```

This will serve the files without rebuilding TypeScript, useful for quick HTML/CSS changes.
