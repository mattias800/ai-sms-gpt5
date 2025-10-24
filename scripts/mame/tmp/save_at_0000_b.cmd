bp 0000
go
save memdump_post.bin,0xC000,0x2000
trace traces/sms-memtrace4.log,maincpu
go
