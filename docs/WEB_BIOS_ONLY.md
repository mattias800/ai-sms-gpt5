# BIOS-Only Mode in Web Harness

## Overview

The web emulator now supports running the SMS BIOS without any ROM cartridge loaded. This allows you to:
- Test the BIOS splash screen and boot sequence
- Verify audio output during BIOS initialization (PSG jingle)
- Debug VDP initialization behavior
- Measure emulator performance with BIOS alone

## Usage

### Running the Web Harness

```bash
npm run web
```

Or with a custom port:
```bash
npx http-server dist-web -p 8080
```

### Enabling BIOS-Only Mode

1. **Build the web app first:**
   ```bash
   npm run build:web
   ```
   The build automatically copies `mpr-10052.rom` and `bios13fx.sms` to `dist-web/`

2. **Open the web interface** and click the **"BIOS-only: OFF"** button to toggle it ON

3. **The emulator will start immediately** without needing to load a ROM

### What Happens in BIOS-Only Mode

When BIOS-only mode is enabled:
- The emulator automatically fetches the BIOS (`mpr-10052.rom` → `bios13fx.sms`)
- The machine initializes with an empty ROM cartridge and the BIOS
- The system displays the SMS splash screen (blue background with SEGA logo)
- Audio plays the BIOS jingle (~1.5 seconds)
- The system enters idle/busy loop waiting for cartridge detection

## BIOS Files

The web harness automatically fetches BIOS files from the project root in this order:
1. `mpr-12808.ic2` (MAME sms romset BIOS - **preferred**, verified silent, matches hardware)
2. `mpr-10052.rom` (Samsung SMS1 BIOS - legacy, includes PSG commands)
3. `bios13fx.sms` (alternate BIOS)

### Serving BIOS Files

The build process copies these files to `dist-web/`:
```bash
npm run build:web
# Produces:
#   dist-web/mpr-12808.ic2
#   dist-web/mpr-10052.rom
#   dist-web/bios13fx.sms
```

When running locally, ensure the BIOS files are in the directory served by your HTTP server.

## Technical Details

### Machine Initialization

In BIOS-only mode:
- `createMachine()` is called with:
  - `cart: { rom: new Uint8Array(0) }` (empty ROM)
  - `useManualInit: false` (use BIOS, not manual)
  - `bus: { bios: loadedBiosData }`

### Component Changes

**App.tsx:**
- Added `biosOnly` state
- Added `handleToggleBiosOnly()` handler
- Pass `biosOnly` to `useEmulator`

**useEmulator.ts:**
- Accept `biosOnly` parameter
- Initialize machine when `romData || biosOnly`
- Auto-fetch BIOS when in BIOS-only mode
- Return emulator instance for BIOS-only runs

**Controls.tsx:**
- Added "BIOS-only: ON/OFF" toggle button
- Button works independently (doesn't require ROM loaded)

## Verification

To verify BIOS-only mode works:

1. Enable "BIOS-only: ON"
2. You should see:
   - Blue SMS splash screen on canvas
   - FPS counter updating (running ~60 FPS)
   - Status bar showing emulator stats
   - **Audio: the SMS BIOS is completely silent** - it never writes to PSG audio ports, so no sound output is expected or emitted

3. Expected status bar output:
   ```
   Sprites: drawn=0 masked=0 8/line=0 active=0 IRQs:N ...
   VDP: line=X VB=0 R1=C0 R0=00 ...
   ```

## Troubleshooting

**"Cannot initialize: no ROM and no BIOS"**
- BIOS fetch failed
- Ensure `mpr-10052.rom` or `bios13fx.sms` exists in the server directory
- Check browser console for fetch errors

**Audio during BIOS sequence**
- The MAME sms BIOS is **completely silent** - it does not write to PSG audio ports
- The emulator correctly produces 0 audio output (silence) during BIOS-only runs
- This matches real hardware behavior verified with MAME
- This is normal and expected behavior

**Canvas blank**
- BIOS is running (check FPS counter)
- VDP initialization may be delayed
- Try pressing "Reset" button

## Related Documentation

- [Development Guide](./EMULATOR_PLAN.md)
- [AGENTS.md](../AGENTS.md) - Rules for BIOS usage
- Audio testing with BIOS: See `tests/audio/sonic_audio_smoke.test.ts`
