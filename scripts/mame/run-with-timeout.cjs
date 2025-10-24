#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/mame/run-with-timeout.cjs <command> [args...]');
  process.exit(2);
}

const parseMs = (s) => {
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

const killAfterMs =
  parseMs(process.env.KILL_AFTER_MS) ??
  (process.env.TRACE_SECONDS ? Math.round(Number(process.env.TRACE_SECONDS) * 1000) : undefined) ??
  5000;

const [cmd, ...cmdArgs] = args;
const printable = [cmd, ...cmdArgs].map(x => (/\s/.test(x) ? `"${x}"` : x)).join(' ');

console.log(`[run-with-timeout] Spawning: ${printable}`);
console.log(`[run-with-timeout] Timeout: ${killAfterMs} ms`);

const child = spawn(cmd, cmdArgs, { stdio: 'inherit' });

const forward = (signal) => {
  if (!child.killed) {
    try { child.kill(signal); } catch {}
  }
};
process.on('SIGINT', () => forward('SIGINT'));
process.on('SIGTERM', () => forward('SIGTERM'));

let terminated = false;
const t1 = setTimeout(() => {
  if (!child.killed) {
    terminated = true;
    console.error(`[run-with-timeout] Sending SIGTERM to child (pid ${child.pid})`);
    try { child.kill('SIGTERM'); } catch {}
    setTimeout(() => {
      if (!child.killed) {
        console.error('[run-with-timeout] Escalating to SIGKILL');
        try { child.kill('SIGKILL'); } catch {}
      }
    }, 2000);
  }
}, killAfterMs);

child.on('error', (err) => {
  clearTimeout(t1);
  console.error('[run-with-timeout] Failed to spawn:', err.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  clearTimeout(t1);
  // Treat our enforced termination as success
  const okSignals = new Set(['SIGTERM', 'SIGKILL']);
  const exitCode = code === null && okSignals.has(signal) ? 0 : (code ?? 0);
  if (terminated) console.log('[run-with-timeout] Child terminated by timeout');
  process.exit(exitCode);
});


