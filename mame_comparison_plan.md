# MAME Pixel-Perfect Comparison Plan

## Current Status
- ✅ Our emulation screenshot: `traces/spy_vs_spy_optimal_frame_700.png`
- ✅ Quality score: 5/5 (EXCELLENT)
- ✅ 10 colors, 100% SMS palette compliance
- ❌ MAME reference screenshot: Missing

## MAME Setup Instructions

### Option 1: Install MAME
```bash
# macOS
brew install mame

# Linux
sudo apt-get install mame

# Windows
# Download from https://www.mamedev.org/
```

### Option 2: Use Online MAME
- Visit: https://www.retrogames.cz/play_138-SMS.php
- Load Spy vs Spy ROM
- Take screenshot at title screen

## Capture Process

### Automated (if MAME installed):
```bash
./capture_mame_headless.sh
```

### Manual:
1. Run MAME with Spy vs Spy
2. Wait for title screen (~10-15 seconds)
3. Press F12 to take screenshot
4. Copy screenshot to `traces/spy_vs_spy_mame_reference.png`

## Comparison Process

### Run pixel-perfect comparison:
```bash
npx tsx pixel_perfect_comparison.ts
```

### Expected Results:
- **Target**: >99% pixel accuracy
- **Current**: Our emulation scores 5/5 quality
- **Focus**: Color accuracy, text rendering, graphics detail

## Analysis Categories

### 1. Color Accuracy
- RGB value comparison
- SMS palette compliance
- Color distribution

### 2. Text Rendering
- Font clarity
- Text positioning
- Readability

### 3. Graphics Quality
- Sprite rendering
- Background details
- Color transitions

### 4. Technical Accuracy
- VDP register compliance
- Timing accuracy
- Memory mapping

## Success Criteria

- **Perfect Match**: 100% pixel accuracy
- **Excellent**: >99.9% pixel accuracy
- **Very Good**: >99% pixel accuracy
- **Good**: >95% pixel accuracy
- **Needs Work**: <95% pixel accuracy

## Current Assessment

Our emulation is already performing excellently:
- ✅ Perfect SMS palette compliance
- ✅ Rich color diversity (10 colors)
- ✅ Excellent text coverage (7.88%)
- ✅ Consistent corner colors
- ✅ Proper background rendering

The MAME comparison will validate our technical accuracy and identify any remaining improvements needed.
