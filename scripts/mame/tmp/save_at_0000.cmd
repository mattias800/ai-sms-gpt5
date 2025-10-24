bpset 0x0000
go
save memdump_post.bin,0xC000,0x2000
trace traces/sms-memtrace3.log,maincpu
go
