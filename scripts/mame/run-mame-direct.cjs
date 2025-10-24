#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node scripts/mame/run-mame-direct.cjs <rom.sms> <seconds> [--no-bios]');
  process.exit(2);
}

const projectRoot = process.cwd();
const romAbs = path.resolve(args[0]);
const seconds = parseInt(args[1], 10) || 10;
const noBios = args.includes('--no-bios');

const tracesDir = path.resolve(projectRoot, 'traces');
fs.mkdirSync(tracesDir, { recursive: true });
const outPath = path.resolve(tracesDir, 'sms.log'); // stable name

const dbgPath = path.join(tracesDir, 'trace.cmd'); // stable name
const dbgScript = `trace ${outPath},maincpu\ntraceflush\ngo\n`;
try { fs.unlinkSync(outPath); } catch {}
try { fs.unlinkSync(dbgPath); } catch {}
fs.writeFileSync(dbgPath, dbgScript, 'utf8');

const rompathArg = path.resolve(projectRoot, 'third_party/mame/roms');
const argsMame = [
  'sms1',
  '-debug',
  '-debuglog', path.resolve(tracesDir, 'debug.log'),
  '-log',
  '-video', 'none',
  '-sound', 'none',
  '-nothrottle',
  '-skip_gameinfo',
  '-cart', romAbs,
  '-cfg_directory', path.resolve(projectRoot, 'cfg'),
  '-rompath', rompathArg,
  '-window',
  '-nomaximize',
  '-debugscript', dbgPath,
  '-seconds_to_run', String(seconds),
];
if (!noBios) argsMame.splice(argsMame.length - 2, 0, '-bios', 'bios13');

console.log('[run-mame-direct] mame ' + argsMame.map(a => (/\s/.test(a)?`"${a}"`:a)).join(' '));
const child = spawn('mame', argsMame, { stdio: 'inherit' });

child.on('exit', (code) => {
  try {
    const st = fs.statSync(outPath);
    if (!st || st.size === 0) {
      console.error('Trace empty or missing at', outPath);
      process.exit(code || 1);
    }
  } catch {
    console.error('Trace not found at', outPath);
    process.exit(code || 1);
  }
  console.log(outPath);
  process.exit(0);
});

