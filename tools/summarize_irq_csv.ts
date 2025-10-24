import { readFileSync } from 'fs';

interface Row {
  frame: number;
  line: number;
  hc: number;
  hasIRQ: number;
  status: string;
  pc: string;
  opcode: string;
  cycles: number;
  accepted: number;
}

const path = process.argv[2] || 'alex_irq_trace.csv';
const text = readFileSync(path, 'utf-8');
const [header, ...lines] = text.trim().split(/\r?\n/);

const rows: Row[] = lines.map((ln): Row => {
  const [frame, line, hc, hasIRQ, status, pc, opcode, cycles, accepted] = ln.split(',');
  return {
    frame: +frame,
    line: +line,
    hc: +hc,
    hasIRQ: +hasIRQ,
    status,
    pc,
    opcode: opcode || '',
    cycles: +(cycles || 0),
    accepted: +(accepted || 0),
  };
});

// Summarize per frame:
// 1) Find windows where hasIRQ rises (0->1) and the first subsequent row with accepted==1 (if any).
// 2) Also report assert duration until hasIRQ falls (1->0) even if acceptance never occurs.
// Report per frame, per assert:
//   - assert L/HCounter, optional accept L/HCounter, rows, ~cycles (sum cycles)
//   - if no accept, show duration until drop and mark (masked)

interface Window {
  frame: number;
  assertIndex: number;
  acceptIndex: number | null; // null if no acceptance in frame
  dropIndex: number | null; // first 1->0 after assert in frame (if any)
}

const windows: Window[] = [];
for (let i = 1; i < rows.length; i++) {
  const prev = rows[i - 1]!;
  const cur = rows[i]!;
  if (prev.frame !== cur.frame) continue;
  if (prev.hasIRQ === 0 && cur.hasIRQ === 1) {
    // Find acceptance and drop within same frame
    let j = i;
    let accept: number | null = null;
    let drop: number | null = null;
    while (j < rows.length && rows[j]!.frame === cur.frame) {
      const rj = rows[j]!;
      if (accept === null && rj.accepted === 1) accept = j;
      if (rows[j - 1] && rows[j - 1]!.hasIRQ === 1 && rj.hasIRQ === 0) { drop = j; break; }
      j++;
    }
    windows.push({ frame: cur.frame, assertIndex: i, acceptIndex: accept, dropIndex: drop });
  }
}

// Aggregate per frame and print summary
const byFrame = new Map<number, Window[]>();
for (const w of windows) {
  if (!byFrame.has(w.frame)) byFrame.set(w.frame, []);
  byFrame.get(w.frame)!.push(w);
}

const fmt = (r: Row): string => `L${r.line}@${r.hc.toString(16).toUpperCase().padStart(2,'0')}`;

for (const [frame, arr] of Array.from(byFrame.entries()).sort((a,b)=>a[0]-b[0])) {
  console.log(`Frame ${frame}: ${arr.length} VBlank IRQ assertions`);
  for (const w of arr) {
    const rA = rows[w.assertIndex]!;
    if (w.acceptIndex !== null) {
      const rB = rows[w.acceptIndex]!;
      let cyc = 0; for (let k = w.assertIndex; k < w.acceptIndex; k++) cyc += rows[k]!.cycles | 0;
      console.log(`  assert ${fmt(rA)} pc=${rA.pc} -> accept ${fmt(rB)} pc=${rB.pc} rows=${(w.acceptIndex - w.assertIndex)} ~cycles=${cyc}`);
    } else if (w.dropIndex !== null) {
      const rD = rows[w.dropIndex]!;
      let cyc = 0; for (let k = w.assertIndex; k < w.dropIndex; k++) cyc += rows[k]!.cycles | 0;
      console.log(`  assert ${fmt(rA)} pc=${rA.pc} -> drop ${fmt(rD)} rows=${(w.dropIndex - w.assertIndex)} ~cycles=${cyc} (masked)`);
    } else {
      console.log(`  assert ${fmt(rA)} pc=${rA.pc} -> (no accept/drop within frame)`);
    }
  }
}

