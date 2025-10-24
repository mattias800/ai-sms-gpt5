#!/bin/bash

echo "Capturing MAME reference screenshot for Spy vs Spy"

# Set up paths
MAME_PATH="./third_party/mame/mame"
BIOS_PATH="./third_party/mame/roms/sms1/mpr-10052.rom"
ROM_PATH="./spyvsspy.sms"

# Check if files exist
if [ ! -f "$MAME_PATH" ]; then
    echo "❌ MAME executable not found at $MAME_PATH"
    exit 1
fi

if [ ! -f "$BIOS_PATH" ]; then
    echo "❌ BIOS not found at $BIOS_PATH"
    exit 1
fi

if [ ! -f "$ROM_PATH" ]; then
    echo "❌ ROM not found at $ROM_PATH"
    exit 1
fi

echo "✅ All files found"

# Create output directory
mkdir -p traces

# Run MAME with Spy vs Spy
echo "Running MAME with Spy vs Spy..."
echo "Instructions:"
echo "1. Wait for the title screen to appear"
echo "2. Press F12 to take a screenshot"
echo "3. Press ESC to exit"

# Run MAME in windowed mode
"$MAME_PATH" sms1 -bios mpr-10052.rom -cart "$ROM_PATH" -window -nomouse

echo "MAME session ended"
echo "Check the snapshots directory for the screenshot"
