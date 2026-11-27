import sys
p = sys.argv[1]
s = open(p, encoding="utf-8", newline="").read()
crlf = chr(13) + chr(10) in s
s = s.replace(chr(13) + chr(10), chr(10))


def rep(old, new, need=False):
    global s
    if s.count(old) != 1:
        assert not need, (old, s.count(old))
        print("trace: skipped a pass marker", old.strip().splitlines()[0][:60])
        return
    s = s.replace(old, new)


rep("""        curFound.assign(curRects.size(), prevRects.size());
""", """        curFound.assign(curRects.size(), prevRects.size());
        thread_local std::vector<char> tracePass;
        tracePass.assign(curRects.size(), '-');
""", True)
rep("""                if (!prevUsed[own] && sameRect(*curRects[r].call, ownCall)) {
                    curFound[r] = own;""", """                if (!prevUsed[own] && sameRect(*curRects[r].call, ownCall)) {
                    curFound[r] = own; tracePass[r] = 'O';""")
rep("""                if (!prevUsed[j] && sameRect(*curRects[r].call, *prevRects[j].call)) {
                    curFound[r] = j;""", """                if (!prevUsed[j] && sameRect(*curRects[r].call, *prevRects[j].call)) {
                    curFound[r] = j; tracePass[r] = 'P';""")
rep("""                if (!prevUsed[own] && ((movedLess(curCall, ownCall) && sameTextures(curCall, ownCall)) || onlyOneFar(curRects[r], own))) {
                    curFound[r] = own;""", """                if (!prevUsed[own] && ((movedLess(curCall, ownCall) && sameTextures(curCall, ownCall)) || onlyOneFar(curRects[r], own))) {
                    curFound[r] = own; tracePass[r] = 'M';""")
rep("""                if (distance < nearest) {
                    nearest = distance;
                    curFound[r] = j;
                }
            }

            // None near""", """                if (distance < nearest) {
                    nearest = distance;
                    curFound[r] = j; tracePass[r] = 'N';
                }
            }

            // None near""")
rep("""                if (!prevUsed[j] && onlyOneFar(curRects[r], j)) {
                    curFound[r] = j;""", """                if (!prevUsed[j] && onlyOneFar(curRects[r], j)) {
                    curFound[r] = j; tracePass[r] = 'F';""")
rep("""                            curFound[r] = prevRects.size();
                            break;""", """                            curFound[r] = prevRects.size(); tracePass[r] = 's';
                            break;""")
rep("""            if (curFound[r] < prevRects.size()) {
                prevUsed[curFound[r]] = true;
            }
        }

        thread_local std::vector<bool> curScaled;""", """            if (curFound[r] < prevRects.size()) {
                prevUsed[curFound[r]] = true;
                if (tracePass[r] == '-') tracePass[r] = 'E';
            }
        }

        thread_local std::vector<bool> curScaled;""")
rep("""            if (curFound[r] < prevRects.size()) {
                prevUsed[curFound[r]] = true;
                curScaled[r] = true;""", """            if (curFound[r] < prevRects.size()) {
                prevUsed[curFound[r]] = true;
                curScaled[r] = true; tracePass[r] = 'C';""")
rep("""                            if (strays(r)) {
                                curFound[r] = prevRects.size();""", """                            if (strays(r)) {
                                curFound[r] = prevRects.size(); tracePass[r] = 'r';""")
rep("""                if (curAlone[r]) {
                    prevUsed[curFound[r]] = false;
                    curFound[r] = prevRects.size();""", """                if (curAlone[r]) {
                    prevUsed[curFound[r]] = false;
                    curFound[r] = prevRects.size(); tracePass[r] = 'l';""")
rep("""        // By a rect's index, the texcoords its upper left moved by from the frame before when its texture slides by""", need=True, new="""        static const bool traceRects = (getenv("RT64_TRACE_RECTS") != nullptr);
        if (traceRects && !untextured) {
            static uint64_t traceFrame = 0;
            traceFrame++;
            for (size_t r = 0; r < curRects.size(); r++) {
                const DrawCall &c = *curRects[r].call;
                const DrawCallTile &ct = curData.callTiles[c.tileIndex];
                const float *tc = &curData.triTcFloats[curRects[r].rawVertex * 2];
                fprintf(stderr, "RT %llu %zu/%zu own=%d %c rect=%d,%d,%d,%d sc=%d,%d,%d,%d d=%d,%d tiles=%u sh=%016llx th=%016llx tc=%.1f,%.1f",
                    (unsigned long long)traceFrame, r, curRects.size(), (curOwn[r] < prevRects.size()) ? int(curOwn[r]) : -1, tracePass[r],
                    c.gameRect.ulx, c.gameRect.uly, c.gameRect.lrx, c.gameRect.lry, c.scissorRect.ulx, c.scissorRect.uly, c.scissorRect.lrx, c.scissorRect.lry,
                    int(c.rectDsdx), int(c.rectDtdy), c.tileCount, (unsigned long long)ct.sampledHash, (unsigned long long)ct.tmemHashOrID, tc[0], tc[1]);
                if (curFound[r] < prevRects.size()) {
                    const DrawCall &p = *prevRects[curFound[r]].call;
                    fprintf(stderr, " -> %zu %d,%d,%d,%d\\n", curFound[r], p.gameRect.ulx, p.gameRect.uly, p.gameRect.lrx, p.gameRect.lry);
                }
                else {
                    int32_t best = INT32_MAX;
                    size_t bj = prevRects.size();
                    for (size_t j = 0; j < prevRects.size(); j++) {
                        if (!sameTiles(c, *prevRects[j].call)) continue;
                        const DrawCall &p = *prevRects[j].call;
                        const int32_t d = abs(p.gameRect.ulx - c.gameRect.ulx) + abs(p.gameRect.uly - c.gameRect.uly);
                        if (d < best) { best = d; bj = j; }
                    }
                    if (bj < prevRects.size()) {
                        const DrawCall &p = *prevRects[bj].call;
                        fprintf(stderr, " X near=%zu %d,%d,%d,%d used=%d size=%d look=%d moved=%d\\n", bj, p.gameRect.ulx, p.gameRect.uly, p.gameRect.lrx, p.gameRect.lry,
                            int(prevUsed[bj]), int(sameSize(c, p)), int(sameLook(c, p)), int(movedLess(c, p)));
                    }
                    else {
                        fprintf(stderr, " X none\\n");
                    }
                }
            }
        }

        // By a rect's index, the texcoords its upper left moved by from the frame before when its texture slides by""")
if '#include <cstdio>' not in s:
    s = s.replace('#include <cfloat>\n', '#include <cfloat>\n#include <cstdio>\n#include <cstdlib>\n', 1)
open(p, "w", encoding="utf-8", newline="").write(s.replace(chr(10), chr(13) + chr(10)) if crlf else s)
