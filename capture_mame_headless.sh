#!/bin/bash

echo "Capturing MAME reference screenshot for Spy vs Spy (headless)"

# Set up paths
MAME_PATH="./third_party/mame/mame"
BIOS_PATH="./third_party/mame/roms/sms1/mpr-10052.rom"
ROM_PATH="./spyvsspy.sms"
OUTPUT_DIR="./traces"

# Check if MAME exists
if [ ! -f "$MAME_PATH" ]; then
    echo "❌ MAME not found. Please install MAME first."
    echo "You can download it from: https://www.mamedev.org/"
    exit 1
fi

# Check if files exist
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
mkdir -p "$OUTPUT_DIR"

# Run MAME headlessly
echo "Running MAME headlessly..."
echo "This will run for 10 seconds to capture the title screen"

# Run MAME with automatic screenshot
timeout 10s "$MAME_PATH" sms1 -bios mpr-10052.rom -cart "$ROM_PATH" -window -nomouse -snapshot_directory "$OUTPUT_DIR" -snapshot_name "spy_vs_spy_mame_reference" -snapname "%g/%i" -autosave || true

echo "MAME session ended"

# Check if screenshot was created
if [ -f "$OUTPUT_DIR/spy_vs_spy_mame_reference.png" ]; then
    echo "✅ Screenshot captured: $OUTPUT_DIR/spy_vs_spy_mame_reference.png"
else
    echo "❌ Screenshot not found. Trying alternative method..."
    
    # Try with different snapshot options
    timeout 15s "$MAME_PATH" sms1 -bios mpr-10052.rom -cart "$ROM_PATH" -window -nomouse -snapshot_directory "$OUTPUT_DIR" || true
    
    # Look for any PNG files created
    PNG_FILES=$(find "$OUTPUT_DIR" -name "*.png" -type f)
    if [ -n "$PNG_FILES" ]; then
        echo "✅ Found screenshot(s): $PNG_FILES"
        # Copy the first one to our expected name
        FIRST_PNG=$(echo "$PNG_FILES" | head -n1)
        cp "$FIRST_PNG" "$OUTPUT_DIR/spy_vs_spy_mame_reference.png"
        echo "✅ Copied to: $OUTPUT_DIR/spy_vs_spy_mame_reference.png"
    else
        echo "❌ No screenshots found. Manual capture required."
        echo ""
        echo "Manual instructions:"
        echo "1. Run: $MAME_PATH sms1 -bios mpr-10052.rom -cart $ROM_PATH"
        echo "2. Wait for title screen (about 10-15 seconds)"
        echo "3. Press F12 to take screenshot"
        echo "4. Press ESC to exit"
        echo "5. Copy the screenshot to: $OUTPUT_DIR/spy_vs_spy_mame_reference.png"
    fi
fi

echo "✅ MAME capture complete!"
