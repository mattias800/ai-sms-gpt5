#!/bin/bash

echo "Starting MAME to capture Spy vs Spy reference screenshot..."

# Kill any existing MAME processes
pkill -f mame

# Start MAME in background
mame sms1 -bios mpr-10052.rom -cart spyvsspy.sms -window -nomouse -snapshot_directory traces -snapshot_name spy_vs_spy_mame_reference &

# Wait for MAME to start
sleep 5

# Check if MAME is running
if pgrep -f mame > /dev/null; then
    echo "MAME is running, waiting for game to boot..."
    
    # Wait for the game to reach the title screen (around frame 700)
    sleep 15
    
    # Try to take a screenshot
    echo "Attempting to take screenshot..."
    
    # Send F12 key to MAME to take screenshot
    osascript -e 'tell application "System Events" to keystroke "f12"'
    
    # Wait a bit for screenshot to be saved
    sleep 2
    
    # Check if screenshot was created
    if [ -f "traces/spy_vs_spy_mame_reference.png" ]; then
        echo "✅ MAME screenshot captured successfully!"
        ls -la traces/spy_vs_spy_mame_reference.png
    else
        echo "❌ Screenshot not found, checking traces directory..."
        ls -la traces/
    fi
    
    # Kill MAME
    pkill -f mame
else
    echo "❌ MAME failed to start"
fi
