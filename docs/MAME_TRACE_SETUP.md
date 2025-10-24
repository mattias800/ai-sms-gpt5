# MAME CPU Trace Setup Guide

This guide explains how to extract CPU register traces from MAME for comparison with our emulator in Phase 3 validation.

## Prerequisites

- MAME emulator installed (0.217 or newer)
- Sega Master System ROMs (Alex Kidd, Sonic the Hedgehog, Wonder Boy)
- MAME compiled with debug support

## Installation

### macOS

```bash
# Install MAME via Homebrew
brew install mame

# Verify installation
mame -version
```

### Linux (Ubuntu/Debian)

```bash
# Install MAME
sudo apt-get install mame

# Verify installation
mame -version
```

### Windows

Download from [mamedev.org](https://mamedev.org/) and add to PATH.

## MAME Trace Capture Method

### Method 1: Using Debugger (Recommended)

MAME has a built-in debugger that can output CPU state at each instruction.

```bash
# Start MAME with debugger
mame sms -debug -rompath ./roms -nowindow

# In MAME debugger console, type:
trace trace_output.txt
# This will trace all instructions to trace_output.txt

# To stop tracing, type:
trace
```

### Method 2: Using -trace Option

Some MAME builds support direct trace output:

```bash
mame sms -trace trace_output.txt -rompath ./roms -nowindow
```

### Method 3: Scripting with Lua

MAME supports Lua scripting for programmatic trace capture:

```lua
-- trace.lua
function trace_instruction()
  local cpu = manager:machine():devices()[":maincpu"]
  local pc = cpu.state["PC"].value
  local af = (cpu.state["A"].value << 8) | cpu.state["F"].value
  local bc = (cpu.state["B"].value << 8) | cpu.state["C"].value
  -- ... capture other registers
  print(string.format("PC=%04X AF=%04X BC=%04X", pc, af, bc))
end

-- Run in MAME:
-- mame sms -lua trace.lua ...
```

## Expected MAME Trace Format

MAME debugger output typically looks like:

```
171F96: 3e ff                ld   a,ff
171F98: 32 00 80             ld   (8000),a
171F9B: 3e 00                ld   a,00
171F9D: 32 01 80             ld   (8001),a
```

More detailed format with registers:

```
171F96: 00000000 PC=171F96 SP=1000 AF=0000 BC=0000 DE=0000 HL=0000 IX=0000 IY=0000
```

## Trace Parsing Script

If MAME outputs a text format, convert it to our JSON format using:

```bash
npm run trace:parse-mame -- <mame-trace.txt> <output.json>
```

Create `tools/parse_mame_trace.ts` (see below) to parse MAME output:

```typescript
/**
 * Parse MAME trace output to JSON
 * Converts MAME text traces to our standard JSON format
 */

interface MameTraceLine {
  cycle: number;
  pc: number;
  registers: Record<string, number>;
}

const parseMAMETrace = (content: string): MameTraceLine[] => {
  const lines = content.split('\n');
  const entries: MameTraceLine[] = [];
  let cycle = 0;

  for (const line of lines) {
    // Match pattern: PC=XXXX AF=XXXX BC=XXXX ...
    const match = line.match(/PC=([0-9A-Fa-f]+)\s+AF=([0-9A-Fa-f]+)\s+BC=([0-9A-Fa-f]+)/);
    if (match) {
      const pc = parseInt(match[1], 16);
      const af = parseInt(match[2], 16);
      const bc = parseInt(match[3], 16);
      
      entries.push({
        cycle,
        pc,
        registers: {
          a: (af >> 8) & 0xff,
          f: af & 0xff,
          b: (bc >> 8) & 0xff,
          c: bc & 0xff,
        },
      });
      cycle++;
    }
  }

  return entries;
};
```

## Capturing Specific Game Sequences

### Alex Kidd (Simple Boot)

```bash
mame sms -debug -rompath ./roms -nowindow -video none

# In debugger:
trace trace_alex_kidd.txt
# Let it run for ~60 frames (~3500 cycles)
# Press pause or use bpset command
```

### Sonic the Hedgehog (Interrupt-Heavy)

```bash
mame sms -debug -rompath ./roms -nowindow -video none

# Trace interrupt sequences:
trace trace_sonic.txt
# Let it run ~100 frames to capture multiple interrupt cycles
```

### Wonder Boy (Complex Sequences)

```bash
mame sms -debug -rompath ./roms -nowindow -video none

trace trace_wonder_boy.txt
# Capture boot and early gameplay
```

## Automating Trace Capture

Create a script to automate MAME trace extraction:

```bash
#!/bin/bash
# scripts/capture_mame_traces.sh

MAME_PATH="$(which mame)"
ROMS_PATH="./third_party/mame/roms/sms"
OUTPUT_PATH="./artifacts/mame_traces"

mkdir -p "$OUTPUT_PATH"

# Function to capture trace
capture_trace() {
  local rom_name=$1
  local output_file=$2
  local frames=${3:-60}
  
  echo "Capturing MAME trace: $rom_name"
  
  # Use MAME with debugging to capture trace
  # Note: This requires interactive debugger or Lua scripting
  $MAME_PATH sms -rompath "$ROMS_PATH" \
    -nowindow -video none \
    -lua scripts/trace.lua \
    "$rom_name" > "$output_file"
}

# Capture traces for each game
capture_trace "alexkidd" "$OUTPUT_PATH/alexkidd_mame.txt" 50
capture_trace "sonic1" "$OUTPUT_PATH/sonic_mame.txt" 100
capture_trace "wonderboy" "$OUTPUT_PATH/wonderboy_mame.txt" 50

echo "Traces captured to $OUTPUT_PATH"
```

## Verifying Trace Quality

1. Check file size (should be significant, not just a few KB)
2. Verify register values are reasonable (PC should advance, registers change)
3. Look for patterns (interrupts, loops, memory access)

```bash
# Check trace file
head -50 trace_output.txt
wc -l trace_output.txt  # Should have hundreds or thousands of lines
```

## Converting to JSON

Once you have MAME traces, convert them to our JSON format:

```bash
npm run trace:parse-mame -- ./trace_output.txt ./artifacts/mame_reference.json
```

## Integration with Phase 3 Tools

After conversion to JSON:

```bash
# Capture our emulator's trace
npm run trace:capture -- ./path/to/rom.sms --frames 50 \
  --output ./artifacts/trace_ours.json

# Parse MAME trace (if needed)
npm run trace:parse-mame -- ./trace_mame.txt ./artifacts/trace_mame.json

# Compare traces
npm run trace:compare -- ./artifacts/trace_ours.json ./artifacts/trace_mame.json \
  --output ./artifacts/comparison_report.md
```

## Troubleshooting

### MAME Won't Start in Debug Mode

```bash
# Verify MAME supports your system
mame -listclones sms
# Should show SMS clones

# Try without debug
mame sms -rompath ./roms -nowindow -video none
```

### Trace Output Empty

- Ensure ROM path is correct
- Check MAME console for errors
- Verify debug build of MAME is installed
- Try running a few frames first to see output

### Register Values Seem Wrong

- Verify MAME version (older versions may have different trace format)
- Check that CPU is executing (should see PC changes)
- Compare against known working emulator traces

## References

- [MAME Documentation](https://docs.mamedev.org/)
- [MAME Debugger Commands](https://docs.mamedev.org/debugger/)
- [Lua Scripting in MAME](https://docs.mamedev.org/plugins/lua/)
- [Z80 CPU Documentation](https://www.z80.info/)

## Next Steps

After capturing MAME traces:

1. Store reference traces in `artifacts/mame_traces/`
2. Run Phase 3 trace comparison
3. Analyze divergences if any
4. Document findings in Phase 3 report
