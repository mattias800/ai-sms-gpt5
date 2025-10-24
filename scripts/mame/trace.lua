-- scripts/mame/trace.lua
-- Lua autoboot script to trace maincpu PC/opcode and CPU registers to traces/sms_lua.log for N seconds, then exit.
-- Usage: mame sms1 -cart <rom> -autoboot_script scripts/mame/trace.lua -seconds_to_run 10 -video none -sound none -nothrottle -skip_gameinfo -bios bios13

local outdir = '/Users/mattias800/temp/ai-sms-gpt5/traces'
local outfile = outdir .. '/sms_lua.log'

local f = io.open(outfile, 'w')
if not f then
  emu.print_error('Failed to open '..outfile)
  return
end

local cpu = manager.machine.devices[':maincpu']
if not cpu then
  f:write('No :maincpu found\n')
  f:close()
  return
end

-- Write a simple header
f:write(string.format('# MAME Lua trace for %s\n', emu.romname()))
f:write('# fields: frame=<n> cycle=<n> PC=<hhhh> OPC=<hh> AF=<hhhh> BC=<hhhh> DE=<hhhh> HL=<hhhh> IX=<hhhh> IY=<hhhh> SP=<hhhh> I=<hh> R=<hh> IFF1=<0|1> IFF2=<0|1> IM=<hh> HALT=<0|1>\n')

local frame = 0
local function on_frame()
  frame = frame + 1
  -- Sample once per frame. For deeper traces, add instruction-level hook.
  local s = cpu.state
  local function gv(name)
    local e = s[name]
    if e == nil then return 0 end
    local v = e.value
    if v == nil then return 0 end
    return v
  end

  local pc = gv('PC')
  local opcode = 0
  pcall(function() opcode = cpu.spaces['program']:read_u8(pc) end)

  -- 16-bit regs
  local af = gv('AF') & 0xFFFF
  local bc = gv('BC') & 0xFFFF
  local de = gv('DE') & 0xFFFF
  local hl = gv('HL') & 0xFFFF
  local ix = gv('IX') & 0xFFFF
  local iy = gv('IY') & 0xFFFF
  local sp = gv('SP') & 0xFFFF
  -- 8-bit regs / flags
  local ireg = gv('I') & 0xFF
  local rreg = gv('R') & 0xFF
  local iff1 = (gv('IFF1') ~= 0) and 1 or 0
  local iff2 = (gv('IFF2') ~= 0) and 1 or 0
  local im = gv('IM') & 0xFF
  local halt = (gv('HALT') ~= 0) and 1 or 0

  f:write(string.format('frame=%d cycle=%d PC=%04X OPC=%02X AF=%04X BC=%04X DE=%04X HL=%04X IX=%04X IY=%04X SP=%04X I=%02X R=%02X IFF1=%d IFF2=%d IM=%02X HALT=%d\n',
    frame, 0,
    pc & 0xFFFF, opcode & 0xFF,
    af, bc, de, hl, ix, iy, sp,
    ireg, rreg, iff1, iff2, im, halt))
  f:flush()
end

-- Helper to detect and log PSG IO writes (OUT (n),A with n=0x7F/0x7D or OUT (C),A with C=0x7F/0x7D)
local function maybe_log_psg_io(pc, opcode)
  local s = cpu.state
  local function gv(name)
    local e = s[name]; if e==nil then return 0 end; local v = e.value; if v==nil then return 0 end; return v end
  local a = gv('A') & 0xFF
  local c = gv('C') & 0xFF
  local function is_psg_port(p)
    p = p & 0xFF
    if p == 0x7F or p == 0x7D then return true end
    if (p & 0x01) == 0x01 and p ~= 0xBF and p ~= 0xF1 and p ~= 0x3F then return true end
    return false
  end

  if opcode == 0xD3 then
    local op2 = 0
    pcall(function() op2 = cpu.spaces['program']:read_u8((pc + 1) & 0xFFFF) end)
    -- Log all OUT (n),A for debugging, then classify PSG
    f:write(string.format('OUT_IMM pc=%04X port=%02X A=%02X\n', pc & 0xFFFF, op2 & 0xFF, a & 0xFF))
    if is_psg_port(op2) then
      f:write(string.format('PSG OUT_IMM pc=%04X port=%02X A=%02X\n', pc & 0xFFFF, op2 & 0xFF, a & 0xFF))
    end
  elseif opcode == 0xED then
    local sub = 0
    pcall(function() sub = cpu.spaces['program']:read_u8((pc + 1) & 0xFFFF) end)
    -- ED 79 is OUT (C),A on Z80
    if sub == 0x79 then
      f:write(string.format('OUT_C pc=%04X port=%02X A=%02X\n', pc & 0xFFFF, c & 0xFF, a & 0xFF))
      if is_psg_port(c) then
        f:write(string.format('PSG OUT_C pc=%04X port=%02X A=%02X\n', pc & 0xFFFF, c & 0xFF, a & 0xFF))
      end
    end
  end
end

-- Prefer per-instruction tracing if available; otherwise fall back to per-frame
local hooked = false

-- Try to install an instruction hook on :maincpu
local ok, err = pcall(function()
  if cpu and cpu.debug and cpu.debug.set_instruction_hook then
    cpu.debug:set_instruction_hook(function()
      -- reuse on_frame body but without incrementing frame
      local s = cpu.state
      local function gv(name)
        local e = s[name]
        if e == nil then return 0 end
        local v = e.value
        if v == nil then return 0 end
        return v
      end
      local pc = gv('PC')
      local opcode = 0
      pcall(function() opcode = cpu.spaces['program']:read_u8(pc) end)
      local af = gv('AF') & 0xFFFF
      local bc = gv('BC') & 0xFFFF
      local de = gv('DE') & 0xFFFF
      local hl = gv('HL') & 0xFFFF
      local ix = gv('IX') & 0xFFFF
      local iy = gv('IY') & 0xFFFF
      local sp = gv('SP') & 0xFFFF
      local ireg = gv('I') & 0xFF
      local rreg = gv('R') & 0xFF
      local iff1 = (gv('IFF1') ~= 0) and 1 or 0
      local iff2 = (gv('IFF2') ~= 0) and 1 or 0
      local im = gv('IM') & 0xFF
      local halt = (gv('HALT') ~= 0) and 1 or 0
      f:write(string.format('frame=%d cycle=%d PC=%04X OPC=%02X AF=%04X BC=%04X DE=%04X HL=%04X IX=%04X IY=%04X SP=%04X I=%02X R=%02X IFF1=%d IFF2=%d IM=%02X HALT=%d\n',
        frame, 0, pc & 0xFFFF, opcode & 0xFF, af, bc, de, hl, ix, iy, sp, ireg, rreg, iff1, iff2, im, halt))
      maybe_log_psg_io(pc, opcode)
      f:flush()
    end)
    hooked = true
  end
end)

if not hooked then
  -- Fall back to one line per frame
  emu.register_frame_done(on_frame)
end

emu.register_stop(function()
  f:flush()
  f:close()
end)

