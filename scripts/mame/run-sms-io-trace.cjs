#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const projectRoot = process.cwd();
const runnerPath = path.resolve(projectRoot, 'scripts/mame/run-with-timeout.cjs');

const ensureDir = (p) => fs.mkdirSync(p, { recursive: true });

const romPath = process.env.SMS_ROM ? path.resolve(process.env.SMS_ROM) : path.resolve(projectRoot, 'out', 'dummy.sms');
const tracesDir = path.resolve(projectRoot, 'traces');
ensureDir(tracesDir);

const romAbs = romPath;
const rompathArg = `${path.resolve(projectRoot, 'third_party/mame/roms')}`;
const seconds = process.env.MAME_SECONDS ? parseInt(process.env.MAME_SECONDS, 10) : 3;

// Ensure BIOS is available to MAME rompath
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

const luaScript = path.resolve(projectRoot, 'scripts/mame/trace.lua');
const outLuaLog = path.resolve(projectRoot, 'traces', 'sms_lua.log');
try { fs.unlinkSync(outLuaLog); } catch {}

const mameArgs = [
  system,
  '-cart', romAbs,
  '-cfg_directory', path.resolve(projectRoot, 'cfg'),
  '-rompath', rompathArg,
  '-autoboot_script', luaScript,
  '-debug',
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
if (!env.KILL_AFTER_MS) env.KILL_AFTER_MS = String(seconds * 1000 + 2000);

const child = spawn('node', [runnerPath, 'mame', ...mameArgs], { stdio: 'inherit', env });
child.on('error', (err) => { console.error('Failed:', err.message); process.exit(1); });
child.on('exit', (code) => {
  if (!fs.existsSync(outLuaLog)) {
    console.error(`Lua log not found: ${outLuaLog}`);
    process.exit(code || 1);
  }
  const st = fs.statSync(outLuaLog);
  if (!st || st.size <= 0) {
    console.error(`Lua log is empty: ${outLuaLog}`);
    process.exit(code || 1);
  }
  console.log(outLuaLog);
  process.exit(0);
});