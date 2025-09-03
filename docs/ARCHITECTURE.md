# Architecture Overview

Modules

- cpu/z80: IZ80 with reset, stepOne -> cycles & IRQ/NMI info, get/set state, requestIRQ/NMI.
- bus: IBus with read8/write8 and readIO8/writeIO8; mapper plug-in interface.
- vdp: IVDP with readPort/writePort, tickCycles, getStatus/getFrameBuffer/getState.
- psg: IPSG with write, tickCycles, getAudioBuffer/getState.
- scheduler: drives CPU and advances devices; deterministic.
- machine: composes subsystems; runCycles/runFrames; serialize/deserialize.

Key Data Structures

- TypedArrays for memory (Uint8Array, etc.).
- Pure POJOs for state snapshots.

Timing Model

- NTSC baseline: 262 lines/frame, ~228 Z80 cycles/line; PAL later.
- Rational accumulators if finer ratios are needed.
