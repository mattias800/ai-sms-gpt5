# MAME debugger script for instruction-level tracing
# Writes to an absolute path and continues execution automatically

# Ensure any prior trace is off
trace off

# Start tracing :maincpu to the absolute output file
trace /Users/mattias800/temp/ai-sms-gpt5/traces/sms_instr.log,maincpu
traceflush

# Continue emulation
go
