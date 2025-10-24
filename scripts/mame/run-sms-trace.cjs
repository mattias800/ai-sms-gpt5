#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const projectRoot = process.cwd();
const runnerPath = path.resolve(projectRoot, 'scripts/mame/run-with-timeout.cjs');

const resolveRomPath = () => {
  const envRom = process.env.SMS_ROM;
  if (envRom && envRom.trim()) return path.resolve(envRom);
  return path.resolve(projectRoot, 'Alex Kidd - The Lost Stars (UE) [!].sms');
};

const ensureDir = (p) => fs.mkdirSync(p, { recursive: true });
const pad2 = (n) => String(n).padStart(2, '0');
const timestamp = () => {
  const d = new Date();
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
};

const romPath = resolveRomPath();
if (!fs.existsSync(romPath)) {
  console.error('ROM not found. Set SMS_ROM=/absolute/path/to/rom.sms or place "Alex Kidd - The Lost Stars (UE) [!].sms" at project root.');
  process.exit(1);
}

const tracesDir = path.resolve(projectRoot, 'traces');
ensureDir(tracesDir);
const outPath = path.resolve(tracesDir, 'sms.log'); // stable name

const dbgScriptPath = path.join(tracesDir, 'trace.cmd'); // stable name
const dbgScript = `trace ${outPath},maincpu\ntraceflush\ngo\n`;
try { fs.unlinkSync(outPath); } catch {}
try { fs.unlinkSync(dbgScriptPath); } catch {}
fs.writeFileSync(dbgScriptPath, dbgScript, 'utf8');

const cfgDir = path.resolve(projectRoot, 'cfg');
ensureDir(cfgDir);

// Build MAME args
const romAbs = romPath;
const rompathArg = `${path.resolve(projectRoot, 'third_party/mame/roms')}`;

const seconds = process.env.TRACE_SECONDS ? parseInt(process.env.TRACE_SECONDS, 10) : 5;
// If a BIOS file is provided via SMS_BIOS, ensure MAME can find it by copying into third_party/mame/roms/sms1
const smsBiosPath = process.env.SMS_BIOS ? path.resolve(process.env.SMS_BIOS) : null;
if (smsBiosPath && fs.existsSync(smsBiosPath)) {
  const biosDir = path.join(projectRoot, 'third_party', 'mame', 'roms', 'sms1');
  ensureDir(biosDir);
  const dest = path.join(biosDir, 'mpr-10052.rom');
  try {
    const srcStat = fs.statSync(smsBiosPath);
    let needCopy = true;
    if (fs.existsSync(dest)) {
      const dstStat = fs.statSync(dest);
      if (dstStat.size === srcStat.size) needCopy = false;
    }
    if (needCopy) fs.copyFileSync(smsBiosPath, dest);
  } catch {}
}

const system = process.env.MAME_SYSTEM || 'sms1';

const mameArgs = [
  system,
  '-cart', romAbs,
  '-cfg_directory', cfgDir,
  '-rompath', rompathArg,
  '-debug',
  '-debugscript', dbgScriptPath,
  '-debuglog', path.resolve(tracesDir, 'debug.log'),
  '-nothrottle',
  '-sound', 'none',
  '-video', 'none',
  '-window',
  '-nomaximize',
  '-skip_gameinfo',
  ...(system === 'sms1' ? ['-bios', 'bios13'] : []),
  '-seconds_to_run', String(seconds),
];

const env = { ...process.env };
if (!env.KILL_AFTER_MS) env.KILL_AFTER_MS = String(seconds * 1000 + 2000); // give MAME time to flush trace
const child = spawn('node', [runnerPath, 'mame', ...mameArgs], { stdio: 'inherit', env });

child.on('error', (err) => {
  console.error('Failed to run timeout wrapper:', err.message);
  console.error(`Debug script left at: ${dbgScriptPath}`);
  console.error(`Traces dir: ${tracesDir}`);
  process.exit(1);
});

child.on('exit', (code) => {
  // Keep debug script directory for inspection
  console.error(`Debug script was: ${dbgScriptPath}`);
  try { console.error(`Traces dir listing:`); console.error(fs.readdirSync(tracesDir).join('\n')); } catch {}

  if (!fs.existsSync(outPath)) {
    console.error(`Trace file not found: ${outPath}`);
    process.exit(code || 1);
  }
  const st = fs.statSync(outPath);
  if (!st || st.size <= 0) {
    console.error(`Trace file is empty: ${outPath}`);
    process.exit(code || 1);
  }

  // Print absolute trace path
  console.log(outPath);
  process.exit(0);
});

