import sys
p = sys.argv[1]
s = open(p, encoding="utf-8", newline="").read()
for tag in ("cut=%d",):
    for nl in ("\r\n", "\n"):
        s = s.replace(tag + nl + '", (unsigned', tag + chr(92) + 'n", (unsigned')
open(p, "w", encoding="utf-8", newline="").write(s)
print("fixed", s.count('cut=%d\n"'))
