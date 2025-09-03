#!/usr/bin/env node

// Run Alex Kidd for 10 seconds and save screenshot
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('=== Running Alex Kidd for 10 seconds ===\n');

// We'll modify the headless_alex script to run longer
// For now, let's run the existing one multiple times to simulate 10 seconds

// Run the emulator
try {
    // Run the existing headless_alex multiple times since it captures at frame 115 (~2 seconds)
    // We need about 5 runs to get to 10 seconds
    for (let i = 1; i <= 5; i++) {
        console.log(`Run ${i}/5 (${i*2} seconds)...`);
        execSync('node dist/src/tools/headless_alex.js', { stdio: 'pipe' });
    }
    
    // Rename the final output
    if (fs.existsSync('alex_kidd_frame.png')) {
        fs.renameSync('alex_kidd_frame.png', 'alex_kidd_10sec.png');
        console.log('\n✅ Saved screenshot to alex_kidd_10sec.png');
        
        // Show file info
        const stats = fs.statSync('alex_kidd_10sec.png');
        console.log(`File size: ${stats.size} bytes`);
    }
} catch (error) {
    console.error('Error running emulator:', error.message);
}
