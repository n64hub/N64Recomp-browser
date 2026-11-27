# RT lines carry the workload id, and every workload the rect loop sees gets an RTW line saying whether it was cut.
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8", newline="").read()
crlf = chr(13) + chr(10) in s
s = s.replace(chr(13) + chr(10), chr(10))
old = '(unsigned long long)traceFrame, r, curRects.size()'
assert s.count(old) == 1
s = s.replace(old, '(unsigned long long)curWorkload.workloadId, r, curRects.size()')
old = """            if (frameMap.workloads[drawnPair.first].cameraCut) {
                continue;"""
assert s.count(old) == 1
s = s.replace(old, """            if (getenv("RT64_TRACE_RECTS") != nullptr) {
                fprintf(stderr, "RTW %llu cut=%d""" + chr(92) + """n", (unsigned long long)workloadQueue.workloads[drawnPair.first].workloadId, int(frameMap.workloads[drawnPair.first].cameraCut));
            }
""" + old)
open(p, "w", encoding="utf-8", newline="").write(s.replace(chr(10), chr(13) + chr(10)) if crlf else s)
print("wtrace applied")
