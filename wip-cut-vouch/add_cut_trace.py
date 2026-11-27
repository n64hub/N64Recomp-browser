import sys
p = sys.argv[1]
s = open(p, encoding="utf-8", newline="").read()
crlf = chr(13) + chr(10) in s
s = s.replace(chr(13) + chr(10), chr(10))


def rep(old, new):
    global s
    assert s.count(old) == 1, (old, s.count(old))
    s = s.replace(old, new)


rep("""                        if (measureCameraMove(curViewProj, prevViewProj, curView, curProjection, prevView, move)) {
                            viewProjMap.eyeStep = move.step;""", """                        if (measureCameraMove(curViewProj, prevViewProj, curView, curProjection, prevView, move)) {
                            viewProjMap.eyeStep = move.step;
                            if (getenv("RT64_TRACE_RECTS") != nullptr) {
                                fprintf(stderr, "CUT1 wid=%llu p=%u turn=%.5f step=%.4f prev=%.4f near=%.4f cut=%d\n", (unsigned long long)firstCurWorkload.workloadId, p,
                                    move.turnCosine, move.step, prevEyeStep, move.nearDistance, int(isCameraCut(move.turnCosine, move.step, prevEyeStep)));
                            }""")
rep("""            viewProjMap.eyeStep = worldEyeStep(matchCandidates, firstCurWorkload.drawData, firstPrevWorkload.drawData, worldStepCamera.rotation, worldStepCamera.nearDistance);""",
    """            viewProjMap.eyeStep = worldEyeStep(matchCandidates, firstCurWorkload.drawData, firstPrevWorkload.drawData, worldStepCamera.rotation, worldStepCamera.nearDistance);
            if (getenv("RT64_TRACE_RECTS") != nullptr) {
                fprintf(stderr, "CUT2 wid=%llu turn=%.5f step=%.4f prev=%.4f near=%.4f cands=%zu cut=%d\n", (unsigned long long)firstCurWorkload.workloadId,
                    worldStepCamera.turnCosine, viewProjMap.eyeStep, worldStepPrevEyeStep, worldStepCamera.nearDistance, matchCandidates.size(),
                    int((viewProjMap.eyeStep >= 0.0f) && isCameraCut(worldStepCamera.turnCosine, viewProjMap.eyeStep, worldStepPrevEyeStep)));
            }""")
open(p, "w", encoding="utf-8", newline="").write(s.replace(chr(10), chr(13) + chr(10)) if crlf else s)
