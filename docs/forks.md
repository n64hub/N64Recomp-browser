# The forks, one commit per change

Every web-support commit on the forks' `main`, by the label CLAUDE.md, the docs and the games' repos name it by: a
fork's Nth web commit (`plume-0003`) or its fork and short SHA (`rt64 c89ced0`). A line says what the commit does;
`git show <sha>` in the fork says why and what it measured. Where a row says more, the commit's message doesn't hold
it. CLAUDE.md, The forks, says how the forks are laid out; a change pushed to a fork gets its row here in the PR that
moves `forks.txt` onto it.


```
N64ModernRuntime-0003  Emscripten: no live recompiler (mods off), RDRAM without a guard region, SDL window handle,
                       thread names
N64Recomp-0001         wasm: the FPU rounding mode kept per thread and applied by cvt.w/cvt.l (fesetround is a no-op)
plume-0001             WebGPU backend; WGSL from HLSL with dxc and naga; the examples build for the browser
plume-0002             plume_device_thread: any backend run on one thread for every caller (WebGPU's device is one
                       thread's)
plume-0003             WebGPU: waiting READBACK maps, texel buffers, rect clears, paced presents, push constants,
                       webgpu_checks
plume-0004             WebGPU for RT64: declared overrides only, per-stage bindings, unfilterable depth, word copies,
                       16-byte rows
plume-0006             WebGPU: buildInBackground pipelines built with createRenderPipelineAsync once a draw has used
                       their layout
rt64-0006              no Idle thread on Emscripten
rt64-0007              without descriptor indexing (WebGPU), a texture set per draw and TMEM in one buffer
rt64-0008              the shaders compile to WGSL (RT64_WGSL, on with Emscripten); WebGPU.hlsli says how
rt64-0009              the RSP compute shaders read their inputs from one buffer (RT64_PACKED_RSP_INPUTS): 8 storage
                       buffers a stage
rt64-0010              RT64 on WebGPU: builds with Emscripten, draws on the page's canvas from the WGSL blobs,
                       ubershaders only
rt64-0011              specialized shaders on WebGPU, built in the background while the ubershader draws
RecompFrontend-0003    Emscripten: recompui's shaders as WGSL, the canvas as RT64's window, a file picker on the page
RecompFrontend-0004    render to RAM an option of the render context (set_render_to_ram), on by default as in RT64
RecompFrontend-0005    Emscripten: no Mods, Exit or Quit, dropped files aren't mods, rumble through the Gamepad API
plume 1988176          the swap chain and menus in the browser's preferred canvas format (bgra8unorm on Windows)
rt64 e46bf19
RecompFrontend e6da1be
rt64 f443403           src/contrib/hlslpp is hlslpp-web (568fbc2): its wasm SIMD backend's wrong movehl, dot4, load3,
                       shifts fixed
N64Recomp 025cab9      funcs.h declares every function the recompiled C calls (wasm traps an undeclared call)
N64Recomp 8eb7338      recomp_trigger_event declared for a patches library's own events
N64Recomp 9eb59c4      a patch's call to a reimplemented, ignored or renamed function goes to <name>_recomp
every fork             upstream merged in at the commits Zelda64Recomp's `recomp-frontend` branch pins: the runtime's
                       recomp::start takes a recomp::Configuration, with a MessageQueueControl (defaults as before)
plume ba97511          the display's rate timed from the browser's animation frames (displayTiming), so Display
rt64 d92a792           interpolates on a page
rt64 551f33e           the RSP's vertex Z test picks its multisampled shader only for a sample count above 1
plume 9c69058          backgroundPipelineBuilds, false in Firefox: there every draw uses the ubershader
rt64 fcc6fe4
rt64 0fa77cf           file_to_c, run in node at build time, linked at -O1 whatever the build's level
plume f6d48d3          backgroundPipelineBuilds false on an Intel adapter too, and no spec constant WGSL at setup
rt64 524a570           without it
N64Recomp 8038212      a tail call written RECOMP_TAIL_CALL, a forced return_call with -mtail-call (Conker overflowed
                       the stack)
rt64 9e37a5b           a pass's color and depth targets grown until every pair matches (WebGPU dropped mismatched
                       passes)
rt64 25a65b7           RasterPS on WebGPU without the slot switch around the texel's address or the linear samplers
rt64 0034023           prebuilt shaders: a game's RT64_PREBUILT_SHADER_LIST specialized at build time; ?record-shaders
plume 90bb27d          background pipeline builds on an Intel adapter after all (f6d48d3 reverted)
rt64 ada5231
N64Recomp 9aabea3      a jump table outside its function's section read from the section that holds it (GoldenEye)
N64Recomp ec0748e      a function the config renames is renamed in a patch's calls to it too (GoldenEye's strtol)
rt64 bfe07cb           the prebuilt shaders built in every browser and on every adapter, each also without dual-source
                       blending
rt64 e839610           the game waits only for prebuilt shaders above the list's "background" line; one thread builds
                       the rest
rt64 de43acc           prebuilt shaders the game waits for built largest first, one in flight a core, progress by WGSL
                       size
rt64 a01b00f           the prebuilt shaders run through spirv-opt -O between re-spirv and naga (a RasterPS ~45% smaller)
rt64 7910126           a shader rebuilt when an .hlsli or shared header it includes changes (dxc's depfile, with
                       Ninja and Makefiles): an incremental build kept the old WGSL, and Conker's page failed with it
rt64 657c222           the prebuilt list in sections, a shader it missed learned for the next visit, one build per
                       pipeline
plume 0ddac9b          at most 2 presents in flight on WebGPU (presentWait), RT64 skipping those the GPU falls behind on
rt64 b8bdd0d
rt64 b47ed32           a shader the list missed reported in Firefox too, which builds none during play
plume 4f0a97e          an empty submission once a millisecond while a readback or a present waits (Firefox's 100 ms
rt64 d070e5c           poll)
plume 94a4795          setBindGroup's dynamic offsets copied out of a heap past 2 GB, which Firefox refuses
rt64 c3d781a
rt64 73e9ca0           render to RAM's copy a display list late for a game that opts in (renderToRAMLate,
RecompFrontend 06468f9 set_render_to_ram_late)
rt64 e8e162e           frames paced evenly on WebGPU while the GPU falls behind (2 dropped presents in a second)
plume 01a7bac          the display's rate from the shortest quarter of the animation frame intervals, not their median
rt64 f0e6217
rt64 cb75c5c           render to RAM's late copy converted outside RDRAM and written a word at a time, each only if
                       it still holds what it held when the list ended: a hash check and then a copy and a byte swap
                       in place overwrote what the CPU wrote meanwhile (Conker writes to a framebuffer with a pending
                       copy in every chapter, 30 of 89 times while it landed); each write is reported, not the first
rt64 950188f           where pipelines build in the background (Chrome), the whole prebuilt list built behind the game
plume 6949a48          a delete through plume_device_thread waits for the command lists that had recorded something
rt64 6790eaa
rt64 918deb3           a reload of the replacement directories waits for the texture upload thread's batch
rt64 c6cf6c4           a per-draw texture's slot in a GPUTile field of its own (drawSlot), so a shader without LOD reads
                       one
rt64 6734747, 0fda089  presents paced only while one in ten or more is dropped over 2 s, 4 at least; the console says so
rt64 b52d78f           a shader the prebuilt list missed built before the next frame, the game waiting, where nothing is
                       built behind the game (Firefox), not drawn with the ubershader for the rest of the visit
plume 16e608a          the display's rate from the period that explains the most animation frames (Firefox's extra
rt64 07d608e           callbacks)
plume 97f4e64          bind groups kept by their layout and what they bind (a serial per handle), the 4096 last used:
                       a browser frees one only when JavaScript collects it, and RT64's sets rewritten every frame made
                       4,000-14,000 a second in Conker's Windy (checkpoint 33), where Firefox lost the device ("Out of
                       Memory", wgpu's D3D12 descriptor heap) whenever they outran a collection; 99% repeated one
                       made in the last 2 s, and the scene makes 40-400 a second now
rt64 53f8e55           CPU hot paths, on every build (the same hashes and matches): a TMEM hash in one XXH3 call, the
                       palette indices it uses as byte flags, frame matching in sorted vectors, not multimaps and sets;
                       on Rush 2049's headless page a list's send_dl took 4.76-4.81 ms median against 5.39-5.58
                       without (title and attract races, Chrome 155 headless, RTX 2070, a busy host, two runs each
                       interleaved), the whole browser's CPU the same within the noise (210-219 s in 100 s)
rt64 fe91344           RT64_FLIPPED_RECT_HIGH_RES: a high-res replacement on a backwards rect sampled on the RDP's texel
N64ModernRuntime       ULTRAMODERN_LIBULTRA_THREAD_STOP: osStopThread/osStartThread on another thread as libultra does
0df8334, f0e0884       them
rt64 58fc4e4           presents paced only on drops over a whole 2 s, and never for a game at about the display's rate
rt64 9ed449d           pacing's count started again a second after a prebuilt shader wait
N64ModernRuntime       OSThread's context pointer past libultra's thprof (0x1C) on a 32-bit host (Banjo-Tooie writes
2e6aa0a                thprof)
RecompFrontend 75fe596 the dummy workload (before a game starts) not copied to RDRAM on a page
plume 90ef8e5          ?present-stats and ?presents-in-flight=<1-8> in the page's query, to see what holds presents back
rt64 f34b19c
rt64 8bea892           tile copies reused from one display list to the next, on every build (Banjo-Tooie's page leaked)
rt64 7734fe4           native builds only: per-draw texture SPIR-V too, picked on Vulkan without descriptor indexing
rt64 b052049           on WebGPU a pixel shader that picks its slot per pixel (mip LOD) finds every tap's texel first
                       and loads them in one switch over the draw's slots, not a switch a tap: GoldenEye's largest
                       224 → 185 KB of WGSL, its list 19.0 → 16.3 MB, Firefox's waits for its boot and Dam a fifth
                       and nearly a third shorter
rt64 ee2dd6a           where pipelines build behind the game (Chrome), the boot's threads build section 1 too
plume 009957c          while the presents-in-flight cap holds presents, one more (up to 4) tried every 2 s, kept if
rt64 2306d25           presents rise
plume 6949d22          fewer and cheaper WebGPU calls on the page's thread for each draw: 94a4795's copy of the offsets
rt64 bf509dd           in Firefox only (in Chrome it took ~1.4 us a call against 0.13, a new array each), bind group
                       keys as bytes, not snprintf's text, and a pass given only the state that changed since its last
                       draw: with the page's thread slowed 3 times (Chrome's CPU throttling, a stand-in for a laptop's
                       CPU), Conker's page presented 54-58 a second in Chrome 155, where it had presented 36-44
plume 3c23b44          009957c's try only from a steady window (no gap over 100 ms, presents held over 10% of it)
rt64 57c0fed
plume 81344f5          a READBACK buffer's isMapReady() and map() through plume_device_thread don't wait behind its
                       queue
plume ba93421          a swap chain's needsResize() and getRefreshRate() likewise, published at each present
rt64 a5bc25d
rt64 29f50e6           the prebuilt shaders' phi variables (naga's `var phi_<n>_` in a function) moved to module scope as
                       var<private>: Chrome parses a module on the thread that takes the page's presents, a 180 KB
                       RasterPS in 100-120 ms, ~30 after; Pilotwings 64's page, while its list built behind the game in
                       Chrome 155, 17-19 frame gaps over 100 ms → 4 on a quiet host, Firefox's waits no longer
rt64 f01c3a6           with Emscripten a workload's draw buffers bound as a zeroed buffer until it makes its own
rt64 008f380           on WebGPU a mip LOD pixel shader samples its levels and tiles in loops it keeps; spirv-opt alone
plume 904b26c          ?uncapped: the display reported at 360 Hz, 4 presents in flight, RT64 interpolating to it unpaced
rt64 e408ed4
plume 7a7e3bc          the canvas's buffer takes a new size only in the present that draws at it
plume 3238ba3          through plume_device_thread a READBACK buffer's map() asks at most once a millisecond (it asked as
plume f2863d8          fast as the page's thread answered, each answer Dawn commands for Chrome's GPU process), and
rt64 730e980           createTexture() and an upload buffer's map() after its first don't wait for the page's thread
                       (RT64 makes two textures for each the game loads, ~570 in 100 ms at Pilotwings 64's screen
                       changes, and maps ~1,700 upload buffers a second): calls waiting for it 252 → 53 per 100 ms,
                       the browser's CPU 1.95 → 1.79 cores (Pilotwings 64, Chrome 155 headless, a quiet host); in
                       Firefox 158 1.09-1.12 → 0.86-0.87, its shader waits as long (16.8-17.7 s against 15.8-21.8)
plume 54b3be7          where pipelines build in the background (Chrome), one made without buildInBackground is built
                       with createRenderPipelineAsync too once a draw resolves its layout, and stays ready at once: RT64's
                       ubershader pipelines (a depth and coverage state each) were each built in line on the GPU process's
                       main thread the first time a draw used its state, and Ocarina of Time's title, a third state 25 s
                       after the boot, held the page's presents 0.96 s (longest gap 172 ms after, Chrome 155 headless)
rt64 9e6830d, c89ced0  on a page each interpolated frame's present takes the slot one period after the last one's, not
                       the moment that one went out (a present a period late or more starts the slots again): the
                       sleep's late wake-ups and wait()'s trip to the page's thread were added to every period, so
                       the pages of games below the display's rate presented 51-55 a second on a laptop's Intel UHD,
                       where games at its rate, which never sleep there, presented 60 (Chrome's 55.6 on a desktop is
                       its frames with no display, docs/playing.md). Banjo with the page's thread kept ~65% busy (headless Chrome 155): 57.6-57.7 → 60.0; plain,
                       Firefox 158 58.0-59.3 → 60.0, headed Chrome 59.4 → 59.8 (RTX 2070, a busy host). c89ced0 set
                       it in the sleep, off the line Conker's and DKR-R's own rt64 patches add beside
rt64 254dee3           a framebuffer the CPU changed counted on the CPU, not by a GPU readback (Pilotwings 64's screen
                       changes)
plume cabe1ac          where a timed wait on a page's thread ends late (Firefox on Windows: on the system timer's 15.6
rt64 2e93be2           ms tick; plume_web_waits.h judges it), the waits a page's speed hangs on are woken or
N64ModernRuntime       spun, not timed: plume_device_thread answers a READBACK buffer's waiters when its data arrives
1f46855                (in every browser) and a waiter spins out its millisecond, RT64's present thread waits for the
                       animation frame nearest a present's slot instead of sleeping 100 us at a time, and the runtime's
                       timer thread polls for a timer less than 2 ms away (a farther one waits on a timer as before:
                       polling up to a tick before each cost the browser ~0.6 cores under the stand-in with Banjo's
                       page, for no more presents); Conker's page under a stand-in for the tick
                       (tools/timer_tick.c, Firefox 158, RTX 2070) 27.0 → 57.8 presents a second, where a laptop drew
                       25-29; Chrome 155 the same within the noise (55.3-56.0 either way), its browser within 0.1 core
N64ModernRuntime       on a page read_file reads in 4 MB pieces, not through an ifstream's ~1 KB proxied reads
b79d63b
RecompFrontend 7bbaa3c on a page the file picker and its callback (the ROM's copy, hash and write) run on a thread of their
                       own, not the launcher's drawing thread, and persistent_home.js stores a file of 1 MB or more from a
                       worker (IndexedDB's put serialized 64 MB in ~120 ms on the page's thread): the launcher's present
                       gaps at Load ROM, Conker 598-672 ms and Banjo 224 from Pages, none over 100 ms in headless Chrome
                       155 (3840x2000 uncapped, a quiet host); Firefox's left are its own pauses, with no ROM too
rt64 179adb8           RT64_OFFSCREEN_WORKLOADS and RT64_UNEVEN_FRAME_RATES: Jet Force Gemini's page interpolates
plume db27484          a prebuilt decal draws in the pass that writes depth (depth32float-stencil8, where the adapter has
rt64 0560318           it), its depth bounds drawn twice through the stencil, not in a pass of its own: Banjo-Tooie's
                       58.2 passes a present 4.7, Firefox 158 uncapped 117-121 → 189-206
plume 795cadf, 2950009 on WebGPU the ubershader's pipelines built behind the launcher; a build matching one in flight
rt64 977ddca           waits for it
rt64 85a6ad5           on WebGPU the spec constant shaders are the flat pair (the shading mode is a spec constant), and
                       RasterPS for the browser keeps the ubershader's loops (SPEC_CONSTANT_LOOPS), 250 KB of WGSL for
                       two of 670: Chrome's GPU main thread parsed them before the launcher's first presents, GoldenEye's
                       held 1643-1814 → 427-451 ms, Donkey Kong 64's 1092-1235 → under 100 (docs/findings.md, The
                       launcher), and a page's wasm is 4.4 MB smaller
plume 2746484,         on WebGPU setup returns once its warm-up is submitted, and the first present waits until the GPU
rt64 ba24420           process has done everything asked of the device before it: the modules and the pipelines setup
                       asks for, built in line in Chrome, no longer hold the launcher after its first frames (GoldenEye
                       403-450 ms → none over 100 in Chrome, 144-196 → none in Firefox; docs/findings.md, The launcher)
RecompFrontend cfd443b on a page the menus' upload buffers unmapped with the bytes the CPU wrote: plume's WebGPU unmap()
                       copies the whole buffer otherwise (writeBuffer), recompui's 1 MB upload buffer at every present
                       (98% of the launcher's bytes) and its image copy buffer, as large as the largest image yet (94 MB
                       for Banjo's 4037x4000 background), again at every later image. Banjo's launcher, 3840x2000
                       uncapped, a quiet host: Firefox 158 338-342 → 22-38 MB/s written, 292-297 → 329-348 presents a
                       second, the gap as it loads its images (ten whole copies of 64-72 ms) 251-298 → 87-138 ms;
                       headless Chrome 155 396 → 18 MB/s, at the uncapped ceiling either way
N64ModernRuntime       ULTRAMODERN_HOLD_BLOCKED_MESSAGES: an external message sent to a full queue and to be sent again
66539ab, 39fa01e,      waits in a list of its own, tried first at the next OS call or idle wait, not put back into the
ed4a797, f8e03f5       queue the idle thread took it from again at once and spun on (~12 million times a second) while
                       the messages behind it waited for a game thread's OS call. Jet Force Gemini leaves a controller
                       message blocked for good, and with its RSP completion sent before its frame is drawn its RDP
                       completion waited for the next retrace: 4-6 retraces a game frame, 2 with the list (headless
                       Chrome 155 uncapped, 3840x2000, its plan: 31,926 sound frames short → 0)
rt64 4cced71           a draw's texture marked used when the state prepares its workload, on every build: the state
                       evicts up to WORKLOAD_QUEUE_SIZE workloads ahead of the one drawn, so a texture drawn again
                       after its maximum age went while a queued draw still used it, which read slot 0, another
                       texture (a menu letter of Rush 2049 flickering to a piece of another font). Rush 2049 carried
                       it as runtime-patches/rt64-0007, which its pin moving onto this drops, or it no longer applies
rt64 8a2c6a7           interpolated frames take turns in 8 color targets (InterpolatedTargetSlots), a frame past them
                       waiting for the one drawn into its target to be presented: RT64 keeps a target per display frame
                       of a game frame and never frees one, so a page held as many as its slowest game frame took
                       display frames. GoldenEye's are 5702x2970 (68 MB) at 3840x2000, and uncapped (360 Hz) in Dam at
                       ~8 fps it kept 42, 2.8 GB, until Firefox's WebGPU device ran out of memory on an 8 GB GPU
rt64 f262d56, 2a249b3  ?present-stats prints a line at each present the present thread drops (the next already queued
                       behind it, what pace() counts): how long it waited, and each game frame's time since the thread
                       last waited, split into waiting for the workload, for the interpolated frame, the draw, the
                       sleeps to the slots (and how far past them they woke), wait() and the present() calls
plume abb5006,         in Firefox, which calls onSubmittedWorkDone back only when it next looks for finished work (after
rt64 58aff42           a submission, or on its own timer, ~50 ms), an empty submission 1 ms after a present and then
                       every 2-4 ms while any present is in flight: each present's callback came back at the next
                       frame's submission, about a frame late, which present-stats' done delay and the adaptive
                       presents-in-flight cap read as GPU time (a laptop's Intel UHD: 18.5 → 5.1 ms at 60 a second)
plume bf417cf,         behind the device thread a present's wait() blocks on the present thread, on a futex the done
rt64 0c5ba5d           callbacks wake (RenderSwapChain::waitOnCaller()), counting presents queued for the device thread
                       as in flight; it was a loop of trips to the page's thread with a 1 ms sleep between two, 33-38
                       ms a game frame in Firefox on a laptop's screen, which paced Banjo-Kazooie to 30
N64ModernRuntime       where a timed wait ends late (Firefox on Windows), the VI thread ends its wait on the first
b81df43, 30c60e5,      animation frame less than half a VI before the VI's time, not on the tick after it: VIs came
6456ba6                15.6 or 31.2 ms apart, RT64 read GoldenEye's frames as a game at 30 ~5 times a second and made
                       two presents of each, and the page presented 63-64 a second on a 60 Hz display. Under the
                       stand-in for the tick (Firefox 158, 60 Hz): VIs 58-60 → 60.0, presents 63.4 → 60.0, sound frames
                       short 47,296 → 0, the browser 1.71 → 1.28 cores. Its code sits apart from vi_thread_func,
                       off the lines a recomp's own patch to the VI thread changes (Conker's, DKR-R's, Rush 2049's)
plume da273ff,         the device made with the adapter's maxTextureDimension2D (16384 on most), not WebGPU's 8192,
rt64 e5ee82d           and on Emscripten RT64's clamp on a render target, tile copy and reinterpreted tile
                       (RenderTarget::MaxDimension, D3D12's 16384) the device's limit: a target past 8192 failed
                       validation with every pass drawn on it (Mario Kart 64 at 7000x1201: an 8394x1440 target)
plume 827a073,         a texture set on a read-write texture slot with no view binds a view of its first mip level
rt64 e83ea6e           and every array slice, as D3D12's null UAV desc does, not its default view of every level:
                       WebGPU binds one level as a storage texture, so a texture with mipmaps bound that way failed
                       the bind group, its pass and the submit (Rush 2's texture cache decoding into its generated
                       mipmaps: every upload failed and races drew black)
N64ModernRuntime       a page saves only the settings and bindings its player changed: an option or input left at its
d98135e,               default follows the default of the build that reads the file. Every option was saved at the
RecompFrontend         first boot and every input whenever the Controls tab closed, so a default an update changed
3993399                (GoldenEye's Mouse Sensitivity of 50 over RecompFrontend's 0) never reached a
                       player who had played the page before. An option the file leaves out takes its default before
                       an option's own parser sees it (the Graphics tab's downsampling would throw). A config saved
                       before it still holds every option: GoldenEye64Recomp-web moves its old 0 to 50 itself
RecompFrontend 2114cc6 on a page mouse motion reaches nothing while relative mode is on and the browser holds no pointer
                       lock, and a lock the browser ended itself (Esc, which never reaches the page, or the page losing
                       focus) opens the menu as Esc does natively: Emscripten's SDL kept relative mode on and sent the
                       cursor's position on the canvas as motion, so GoldenEye's mouse look turned at once by however
                       far that was from the last locked one, and the menu opened only at a second Esc
N64ModernRuntime       ULTRAMODERN_LOADS_WAIT_FOR_DISPLAY_LISTS: RT64's interpreter marks the RDRAM it reads each
bf96a62,               display list's commands from (256-byte units) in an array ultramodern owns, RecompFrontend's glue
rt64 02f0a7c,          hands it and counts the lists read, librecomp the ones sent, and a PI DMA from ROM onto commands
RecompFrontend         one of the last 8 lists read ran waits (at most 2 s) until RT64 has read every list sent before
ab544ca                it, as a console's RSP has long before a load lands; a load anywhere else goes at once. Mario
                       Kart 64 loads its title screen's textures over its logos' model the frame after their last list;
                       on a laptop's integrated GPU RT64's thread, a frame or more behind, read that list after the
                       load, took texture words for commands (color images 1792-3072 wide) and the page trapped in
                       free(). Every load waiting cost 3.4% of the sound frames there (docs/findings.md, Memory)
plume 77e521e,         timedWaitsEndLate() (plume_web_waits.h) answers false in a build without threads, so plume's
rt64 be95c2c           examples and plume_webgpu_checks build without -pthread again: sleepUntil() called it there
                       and the build stopped at an undeclared identifier. Pages build with -pthread, unchanged
rt64 cf8beb9,          RT64_RENDER_INDEX_BY_INSTANCE (rt64_raster_params.h, a WGSL build): a raster draw's index is its
plume 84b785f          first instance, which RasterVS reads as instance_index and hands RasterPS and the dither noise
                       as a flat varying, and renderIndex stays 0; a render pass binds a push constants block it has
                       bound already once, with no slot of the ring. renderIndex changed every draw, so each draw cost
                       the page's thread a setBindGroup and 256 bytes of writeBuffer (Banjo-Tooie throttled in Chrome:
                       ~1,710 a present). setBindGroup a draw 1.70 to 0.93 on Banjo-Tooie and 1.65 to 0.65 on
                       Banjo-Kazooie, which throttled 6 times in Chrome presents 52 a second, from 41-45
                       (docs/findings.md, A page's thread in Chrome, throttled)
plume 08f9327,         a hidden page (a tab behind another, minimized: document.hidden) presents nothing, and RT64's
rt64 52ec88f           pacing counts no presents while it is hidden or for a second after: a swap chain says so
                       (isHidden()), and plume holds no present to its cap then. In a hidden tab Chrome calls
                       onSubmittedWorkDone back late, at times by seconds, and the present thread's wait() held the
                       game: Mario Kart 64's and Star Fox 64's sound broke up while hidden, and their dropped presents
                       read as the GPU falling behind (Mario Kart 64 on a 240 Hz display: 114 presents a second, then
                       60 for 80 s after the tab came back). docs/findings.md, A page in a hidden tab
rt64 5249040, e696b69  the workload thread reads no GPU profiler timestamps on Emscripten: WebGPU has none (plume's
                       queries do nothing and read zeros), and behind plume's device thread queryResults() and
                       getResults() were two round trips to the page's thread after every workload, two of every three
                       of that thread's trips. Presents stayed within the noise (docs/findings.md, A page in a hidden
                       tab)
N64Recomp df17690      an op with $zero as its destination (lw $zero, ...) written (void)(<value>): done, nothing assigned
                       ("0 = MEM_W(...)" didn't compile)
RecompFrontend 75e5f85 on a page the file picker's input is held until the picker is answered (frontend/file_picker.cpp
                       too): Chrome holds an open picker's input only weakly, so a GC while it was open (6 s after
                       Load ROM on Conker's launcher) took it, the file went nowhere, and every Load ROM after was
                       ignored until a reload. A headless play's ROM was lost so once in about 20 plays
plume d554411,         a page's timed waits judged late as it plays, not only as it starts: while they're judged on
rt64 33e87a9,          time, RT64's present thread (sleepUntil()) and the VI thread (vi_sleep_until()) first wait up to
N64ModernRuntime       100 us for a frame and judge that wait, and once most of those in each of 10 seconds in a row
1ff690a                ended more than 4 ms late, presents and VIs go on the animation frames for the rest of the play.
                       Pokémon Snap's page in Firefox 158 (uncapped, RTX 5080) on timed waits presented 94 in 1 play of
                       4, and 172-176 in 6 of 6 that turned late at its menus or level; 206-218 with the switch
                       (docs/findings.md, Pokémon Snap's timed waits in Firefox)
rt64 2292159           a projection holding the camera split into view and perspective by the row where the view's Z
                       axis is largest, not row 0's alone, on every build: for a camera looking along the world's Z
                       that ratio of two fixed-point values near zero gave each frame another depth range, and a frame
                       interpolated between two lost what was far away (Perfect Dark's Air Base at its start, every
                       mountain gone to the clear colour in 1-5 of 30 shots, 0 of 180 with it)
rt64 cbe51a5           a VI whose vertical region ends before it starts gives no frame size, as a blank VI, on every
                       build: its height wrapped round to 4294967040 lines, Expand's horizontal scale to 14520022, and
                       every target drawn that frame was 16384 wide and stayed so (Perfect Dark's one such frame as its
                       menus start: then each mission's targets, 16384x960, through matchColorToDepthTargets). Its
                       regular plan in headless Chrome at 1256x645: widest target 1854, GPU memory 2598 MiB, not 4134
rt64 51c3fdd           RT64_FREE_DISCARDED_TARGETS (on with Emscripten): the render targets of a framebuffer discarded,
                       its RAM overwritten by the CPU, are set aside, given back to a draw that asks for them again and
                       freed once none has in WORKLOAD_QUEUE_SIZE * 32 workloads. RT64 kept a target for every
                       framebuffer address a game drew to: Perfect Dark's, at each mission's own addresses, grew
                       Chrome's GPU process from 1.4 to 4.76 GB over six missions, and to 2.17 GB with this
rt64 d19fdcc           WebGPU: a dummy depth target for each color target size, for the passes that draw no depth
                       framebuffer, freed 120 workloads after its last pass; one shared dummy, matched to every color
                       target, grew each to the biggest any had been (Perfect Dark's 320x1 mission targets, 1286x3,
                       drawn at its 576-wide menus' 1854x960)
rt64 a9eeacd           the interpolated targets grow under interpolatedMutex, which the present thread indexes them
                       under, on every build: a resize could move them while it read one (Pokémon Snap's port's fix)
rt64 a8bfc93           a triangle with a vertex at w <= 0, or projected 4096 pixels out, faces the camera and covers its
                       scissor in the pass's boxes, on every build: xyz / w put it anywhere, and a pass of only such
                       triangles had no drawColorRect and wasn't drawn in interpolated frames (Pokémon Snap's port's);
                       narrowed to a triangle crossing the camera plane by rt64 dd2fd23
rt64 a48552c           a pass's framebuffer is at least as tall as the viewports its triangles were drawn through, cut
                       to their scissors, on every build: an interpolated frame that put them lower than the box
                       fitted to the game frame lost a band at the bottom. Pokémon Snap's port takes the scissor's
                       bottom alone, which starts at 8192 lines
rt64 3879842           fill and copy cycle draws count as undithered for a framebuffer's dithered writeback to RAM, as
                       hardware draws them, on every build (Pokémon Snap's port's: its z-buffers filled with 0xFFFC)
rt64 3af6338           the primitive depth is z / 32768, as a triangle's 15-bit z is, not z / 32767, on every build: a
                       G_ZS_PRIM sprite sat a step deeper (Pokémon Snap's port's: Snorlax's sleep effect at a distance)
rt64 b1f0c37           a new tile copy's Id comes from a counter that only goes up, not the highest plus one, so one
                       a workload names from before destroyAllTileCopies names no new copy, on every build (Pokémon
                       Snap's port's; no game is known to show it)
rt64 47d43be           a texture scroll is placed between frames only while steady, S and T apart: same way as the last
                       frame's, 0.4-2.5 times as far, from this frame's start; any other is drawn where the game put it,
                       on every build. A one-time step slid in a frame late and a scroll that rests every other frame
                       slid back (Pokémon Snap's port's 4810bf6 and 60623fa)
N64Recomp 46395bb      div, divu, ddiv and ddivu by zero give the VR4300's results (quotient -1, or 1 for a negative
                       signed dividend; remainder the dividend), on every build: a bare / and % trapped, in wasm and
                       on x86. The lines Conker's own N64Recomp patch writes, so it takes them by a three-way merge;
                       its patch keeps them (recomp/n64recomp.patch, cgenerator.cpp): its build.cmd, the native
                       Windows build, applies no web patch, and its attract mode divides by zero
N64ModernRuntime       a Status write that changes a bit cop0_status_write doesn't handle (CU1, the interrupt mask)
0425eb8                stores it, on every build: it called exit(), which ended the page (Banjo-Tooie's boot sets CU1).
                       Banjo-Tooie's own patch writes the same lines, and keeps them: its desktop build applies only
                       its own patches (tools/setup_deps.py)
N64ModernRuntime       thread_queue_insert leaves a thread that is in the queue already where it is, and says so once,
9d3e57a                on every build: a second insert linked it to itself and hung the game. The causes known are
                       fixed on a page already (osStartThread on a thread not stopped, upstream's thread_queue_remove).
                       Banjo-Tooie's own patch guards thread_queue_insert and schedule_running_thread its way, and
                       keeps them for its desktop build, which applies no web patch
N64ModernRuntime       queue_audio_buffer reads a buffer given by its KSEG1 address through KSEG0's, and plays none
059e4fe                that doesn't lie in RDRAM's 8 MB, on every build: TO_PTR put KSEG1's 512 MB past RDRAM, the
                       guard region natively and whatever lies there on a page. In ultramodern, off ai.cpp's lines,
                       which Jet Force Gemini's own web patch converted its way; its pin moving onto v0.93.0 dropped
                       that (its desktop build has the base project's own conversion)
plume e16e003,         WebGPU: where a page's timed waits are judged on time (Chrome), a present's sleep to its slot
rt64 0e971b5           is plume's: woken by each animation frame before the slot and spun on the clock from the last,
                       no more than a frame and 2 ms. RT64's own 100 us sleeps there now and then took a tick, up to
                       16 ms, and woke a present 5-30 ms past its slot, and its pacing took the drops for a GPU falling
                       behind: Perfect Dark's page on a 240 Hz display presented 112-117 a second in Chrome, at 60 for
                       half a play, and 212-213 with this (docs/findings.md, A present's sleep in Chrome)
plume 9728862,         WebGPU: that sleep spins from a frame 0.5 ms before the slot, not 2 ms, and present-stats says
rt64 505e43e           how many ms a second it spun: a core's time wherever the display is faster than the game, it
                       fell from 635-646 to 462-483 a second for Mario Kart 64's page in Chrome at 174 animation frames
                       a second and from 405-412 to 304-310 for Perfect Dark's, at the same presents a second. A timed
                       wait can't take its place there: a tenth of Chrome's ended 4-16 ms late (docs/findings.md, A
                       present's sleep in Chrome)
N64ModernRuntime       ULTRAMODERN_RSP_TASKS_COPIED: an RSP task other than graphics runs from a copy of its OSTask and
0ec6c51                the RDRAM its data_ptr and data_size give, taken as the game starts it (the newest of each
                       OSTask's), and the RSP's DMAs read that copy: run late, an audio task read the start of one
                       command list and the rest of the next one Super Mario 64 wrote into the same buffer two VIs on,
                       and its page exited at aspMain's jump table, in 2 of 7 plays (docs/findings.md, A late audio
                       task)
N64ModernRuntime       on a page the stored ROM is written as <stored>.temp and renamed over it whole, and a stored ROM
a0d35b6                that won't open at Start Game goes back to the launcher: Rush 2's launcher checked the stored ROMs
                       while Load ROM's thread wrote one (RecompFrontend 7bbaa3c) and deleted it half-written, in 1 of 7
                       plays, and Start Game then ran the game with no ROM and trapped out of bounds
N64ModernRuntime       a0d35b6's way back to the launcher only when no ROM is loaded (recomp::is_rom_loaded): Ocarina
e4c932f                of Time keeps no stored ROM, hands the runtime the player's file with set_rom_contents before
                       Start Game and finds no stored one every time, and with a0d35b6 its page never started the game
N64ModernRuntime       Module.gameStarted called on the page's thread as the game's entrypoint starts, past the
4746426                launcher: the shell's on-screen controller for phones shows from there, plugged in as a
                       gamepad after SDL has started (SDL opens only a pad that connects later)
N64ModernRuntime       on a page the timer thread orders its timers by a copy of each one's timestamp, taken as it is
ba2551b,               added, not by the OSTimer's own, which osSetTimer rewrites on the game's thread: a timer
a25ea81                restarted while still pending moved inside the set, its erase missed, and it fired at every
                       pass with no wait, so Banjo-Tooie's page on a phone hung at a level change and ended in
                       Aborted(OOM) (docs/phones.md); a25ea81 keeps the timers in a TimerSet with a std::set's calls,
                       so the loop stays each pinned runtime's own (ba2551b's copy of it didn't compile on ca568b6)
rt64 dd2fd23,          a triangle covers its scissor only where it crosses the camera plane, on every build: one wholly
baa3753                behind it draws nothing, and one wholly in front has its box from its vertices held to 8192
                       pixels. a8bfc93 made a pass of triangles behind the camera or off one side a write of its whole
                       framebuffer, and a texture read of it after a new tile copy: ~100 full-screen ones at the title
                       of Banjo-Kazooie, kept, 3.6 GB at 3840x2000 (Firefox: Out of Memory on an 8 GB card)
rt64 4e6c52e           on the web a tile copy is a texture copy (copyTextureToTexture), not a draw into a framebuffer of
                       its own: Perfect Dark's Area 51 - Infiltration cutscene reads ~210 regions back a present, each a
                       render pass in the browser's CPU, 11-14 passes a present after against 204-226 (docs/findings.md,
                       A framebuffer the game reads back)
rt64 343d64d           without descriptor indexing the TMEM pool uploads each run of entries that changed (16 apart at
                       most), not all from the first to the last: in that cutscene it rewrote 14-16 MB pools almost whole
                       every fifth present; with both, it presents 147-191 a second uncapped in Firefox against 74-112
rt64 8b9dce2           the inspector draws ImGui through plume on a page, whatever graphicsAPI says, with its font atlas
                       as its only texture (a draw of any other ImTextureID is skipped): a recomp's ImGui overlay, as
                       DKR-R-web's, opens on a page
rt64 24562c7           on the web a load block or tile copies a word-aligned 8-byte word into TMEM as two 32-bit reads,
                       not a byte at a time: 4.7% of the display list thread in Rush 2049's race on a phone
rt64 0db3a67,          present-stats prints the game's frames a second and the frames RT64 drew for them, so frames
b15112b                drawn under the game's rate times the interpolation are RT64 skipping them (docs/phones.md)
plume 5aa2cbe,         the device thread's waitForCommandFence() waits for the execution before the last, not the
rt64 30df1f5           one just queued, and an upload buffer is mapped at memory of its own on the calling side, its
                       writes copied for the backend's at unmap(): RT64 waits after each list, each wait a trip to
                       the page's thread behind everything queued there, 5.5-6.7 ms of each interpolated frame on a
                       phone, so RT64 skipped the second frame of 35-45% of Rush 2049's game frames; 1-5% with this,
                       and 44.8 presents a second against 39.7 (docs/phones.md)
rt64 63703df           a TMEM hash takes a CI4 texture's palette indices from 16 pieces of its byte set, not a loop
                       over 256 values, and each run of used palette indices in one update, not 8 bytes an index:
                       the same bytes and hashes (2,000,000 random tiles compared), on every build; Rush 2049's race
                       hashes about 65,000 textures a second, 97% CI, and on a phone a CI4 hash took 0.9-1.1 us
                       against 1.5-2.6
rt64 32aa316           with ImGui 1.92 or later (IMGUI_HAS_TEXTURES) the page's inspector makes, updates and destroys
                       each texture ImGui asks for (ImGuiBackendFlags_RendererHasTextures), each draw binding its own,
                       in place of 8b9dce2's one font atlas, which compared an ImTextureRef with an ImTextureID: Jet
                       Force Gemini's rt64, on ImGui 1.93, didn't build for a page
rt64 7844c07           RT64_UNEVEN_FRAME_RATES times a frame at the slowest of the last three's VIs, not the fastest,
                       while it took 3 or more of the last 8 frames: Rush 2049's race on a phone, its own hold off,
                       53 presents a second against 38-42, as a game at 60 that the phone holds to 30-50 mixes frames
                       of 1 and 2 VIs and at the fastest got one drawn frame each
rt64 330f84a           render to RAM's late copy lands at a list's start only once the GPU has it, else at the next
                       VI that finds it ready or where the next list's draws are synced: on a phone the wait for the
                       GPU at each list's start was a quarter of the display list thread's time, and Conker's game
                       frames 15-21% more
plume f3cb1a7,         an upload buffer of 16 MB or more maps the backend's memory on the device thread, as before
rt64 e74c09d           5aa2cbe, without a copy of its own on the calling side: that copy doubled each buffer in the
                       heap, and RecompFrontend's buffer for its launcher's images (an SVG drawn at 4K) took
                       GoldenEye's page, which boots at 1458 MB of its 1536, past its heap 1.7 s after load
rt64 9c88af0           7844c07's slowest of the last three only where the fastest took one VI: a game at 30 mixing
                       frames of 2 and 3 VIs or more is timed at the fastest again, as RT64 skipped the third frame it
                       set each; on a phone, with State's layout right (rt64 43ef41c) both ways, Diddy Kong Racing
                       presented 58.3 and 58.7 a second against 57.0 and 54.7 (docs/phones.md)
rt64 b173eb3,          on the web a present is dropped for a newer one only once its own workload is done and the
rt64 01d734b,          newer one's is too, not as it is taken from the queue: where workloads end after the game's
rt64 2f9290c           next present comes, every present found a newer one queued and was dropped, and Banjo-Tooie's
                       page on a phone showed nothing from its attract's second level change on, its game still
                       running (docs/phones.md); 01d734b moves the function it adds out of the lines Jet Force
                       Gemini's own RT64 patch changes, and 2f9290c out of where Pokémon Snap's port adds one, where
                       its web fork's three-way merge put it inside that function without a conflict
rt64 43ef41c           RT64_UNEVEN_FRAME_RATES is a PUBLIC definition, as RT64_GAME_FRAME_WORKLOADS is: 7844c07 put
                       fields of VIHistory under it in rt64_vi.h, so a recomp's own code that includes rt64_state.h
                       (Diddy Kong Racing's F3DDKR and scenery code, Pokémon Snap's render context) saw every State
                       member after it at another offset than rt64 did; Diddy Kong Racing's race on a desktop GPU
                       presented 47-68 a second from v0.109.0 on, against 287-305 before and 291.8 with it
RecompFrontend 4c15260 on a page the menus upload an image 16 MB of rows at a time: the copy buffer, kept at 1.5
                       times the largest image yet with plume's copy of it in the heap, held 371 MB of GoldenEye's
                       heap for its launcher's SVG background (10723x6032 at 3840x2000), 94 MB of Banjo-Kazooie's,
                       whose heap's break fell to 748.3 MB from 841.0
rt64 9086c93,          frame matching pairs a hash's calls by what each adds (its range of matrices, its tiles, its
rt64 3c6a1cc           look at), not every call with every one of the previous frame's: a group of alike calls cost
                       its square, and in Banjo-Tooie's levels (up to 398 calls of one hash, 167,000 pairs of calls a
                       frame) the matching took 18-23 ms of the workload thread's game frame on a phone; the sets it
                       fills are the same, in 14,715 scenes compared. 3c6a1cc takes out the include 9086c93 added
                       where Pokémon Snap's, Diddy Kong Racing's and Jet Force Gemini's own RT64 patches add theirs
rt64 737169e           a load taller than TMEM skips the rows the later ones overwrite from the row it ends on,
                       assigned rather than added to where it starts (a load starting past TMEM's first byte wrote
                       up to 4 KB past TMEM), and only where the rows have no gap between them or the stride divides
                       TMEM: the same bytes as each row written in turn in 600,000 random loads, the old skip wrong
                       in 541,644 of the 541,823 it took; on every build. Majora's Mask's and Banjo-Kazooie's tall
                       loads take it, from TMEM's first byte without gaps, which the old skip got right too
rt64 15e8e91           the flat, multisampled dual-source RasterPS gets VERTEX_FLAT_COLOR: 85a6ad5's line for it was
                       garbled, and CMake passed dxc the pieces, so it was the smooth one; nothing includes it (a page
                       draws without MSAA), so no binary changes
rt64 1c9e639           with render to RAM's late copy and a frontend's Application::Core::rdpDone, a list that ends at
                       its full sync tells the game its RDP is done once its draws are interpreted and its tiles
                       loaded, before RT64 records and submits its last batch, that batch's framebuffers kept whole
                       for it to read; a pending copy still lands before the next list's RDP is done, at its start,
                       and a desktop build (no rdpDone) is unchanged (docs/phones.md, Conker's Bad Fur Day on a
                       Galaxy S21)
N64ModernRuntime       Emscripten: ultramodern::renderer::rdp_done() sends a graphics task's DP message from inside
51dd220                send_dl, and dp_complete() doesn't send it again (take_rdp_done()); nothing calls it on a
                       desktop build
RecompFrontend 8c7de5e Emscripten: RT64's Application::Core::rdpDone is ultramodern's rdp_done(), only while send_dl
                       runs a game's task (a pipeline warm-up or a dummy workload tells the game nothing)
plume a501afa,         the swap chain puts the canvas's asked-for size back after configuring its surface, which set
rt64 40b0ff6           it to the size resize() had read: on a phone, back in Chrome from another app, the tap that goes
                       fullscreen and then landscape resizes twice in 0.3 s, and 2 of 6 tries on GoldenEye's page lost
                       the landscape size that way, the game drawn upright and stretched across the landscape screen;
                       with it 6 of 6 kept it
rt64 9b87e67           with Emscripten, a tile that finds no tile copy samples the one of a 16 or 32-bit framebuffer
                       row loaded whole at its TMEM address, as a one-row tile, whatever its own size and line say;
                       texcoords that leave the row sample TMEM again: Perfect Dark's night vision copies each row
                       through a 513x9 tile of line 160, and drew each from RDRAM, at 30 (docs/findings.md, Perfect
                       Dark's night vision)
rt64 dd45bdc           with Emscripten, a sync asked for by TMEM past what a call's texcoords sample from its tile's
                       address is left out (fullSync()): Perfect Dark's HUD glyphs, 7 words through a 32x32 CI4 tile
                       that reaches the rest of the goggles' last row, synced once after each of their passes
rt64 f99c2e4,          with Emscripten, a framebuffer row's tile copy is judged by the game's own rectangle, not the
rt64 40ec5c2           one Fix LR with Scissor stretched a pixel to the scissor: Perfect Dark's night vision's second
                       to last row sampled TMEM and synced once a frame (docs/findings.md, Perfect Dark's night
                       vision); 40ec5c2 moves its line off Pokémon Snap's own rt64 change to the file
rt64 2c4230e,         RT64_INTERPOLATE_CAMERA_EYE: a camera's eye is lerped on the line between its two places and
rt64 df06c6b,         each interpolated view's translation put back from it, its lerped axes kept; lerping the view's
rt64 2f08ac9          translation, the eye in the view's own axes, took a camera far from the origin that turns off
                       that line (F-Zero X's, 12,000 units out, up to 25 units) and what is near it swung; df06c6b and
                       2f08ac9 move its lines off those Conker's and Pokémon Snap's own rt64 changes to the file
rt64 110f851           with Emscripten, render to RAM's copy from RAM with no previous buffer unbinds its read set's
                       gCurInput, which kept a buffer a later copy's bigger one may have freed since: plume's WebGPU
                       set builds its bind group from every binding, so it would read the freed buffer
plume 6109ba1,         a descriptor set's binding of a buffer destroyed since is left out of its bind group, as an
rt64 1b46172           unset one is, and logged the first 8 times: reading the freed buffer's handle threw ('reading
                       size' in wgpuBufferGetSize) on the device thread and the page never presented again, as F-Zero
                       X's did at 4K in Chrome on a fast desktop GPU with its race's depth buffer copied at two sizes
rt64 fcbf916,          the GBI database knows L3DEX2.fifo 2.06, 2.05's text with data of its own, on every build: a
rt64 839e4c6           game that loaded that line microcode had no GBI, so its lists read the command table from near
                       address 0 and the page trapped ('function signature mismatch' in send_dl); 839e4c6 keeps its
                       data segment in an array of its own, so CBFD's and Jet Force Gemini's own rt64 changes, which
                       change dataSegments' count, still apply
rt64 bce5e11           RT64_GAME_FRAME_WORKLOADS, in place of 179adb8's RT64_OFFSCREEN_WORKLOADS: the workloads a game
                       frame is drawn in (one per RSP task the game ends with a full sync), up to the present that
                       shows what they drew, are interpolated as one frame, matched against the one before as a whole
                       and all drawn for each interpolated frame; the queue holds 16. Mario Party's village, a
                       minigame's instructions and the minigame drew exactly the game's 30 (headless Chrome 155,
                       3840x2000 uncapped, RTX 2070, two interleaved pairs: 30.2 and 30.6 presents a second) and
                       interpolate (246.1 and 238.9). A scene stays in one workload, as matching reads it through
                       that workload's maps alone; the frame's rate is read through upstream's own lines, beside which
                       Conker's own rt64 change sits
rt64 997f61f,          with Emscripten, the VI's viewport into the swap chain has its edges on whole pixels: a target
rt64 83d4be7,          rounded up to whole pixels (Auto's 1708x960 at a 1600x900 canvas under Expand) letterboxed the
rt64 46f182f           picture by a third of a pixel, and Chrome's WebGPU drew no row past the viewport's last whole
                       one, so the canvas's last row stayed black; 83d4be7 rounds in fromHDtoWindow and 46f182f with
                       roundf and no include, out of the lines Wave Race's and Pokémon Snap's own rt64 changes change
rt64 d64a926           RT64_GAME_FRAME_WORKLOADS's frames drawn whole: a workload that draws nothing isn't an offscreen
                       pass, a shown framebuffer is any of the VI's last eight different ones (not viHistory's last
                       three VIs, which miss a third framebuffer shown now and then) and the queue holds 32, so a frame
                       of up to a dozen workloads fits beside the one before and the next; each ended Mario Party's
                       frames early, and the frames between the game's showed its board without HUD, text or characters
rt64 5f104ed           RT64_GAME_FRAME_WORKLOADS: a frame with fewer workloads that draw than the one before is held
                       at a wait for the rest of them, up to 34 ms: a present showing the frame before came in the
                       middle of Mario Party's next one about every 0.4 s, and each half, matched against the whole
                       frame before, drew Toad tiny and an object beside him huge between the game's frames
rt64 e0f41b3           RT64_GAME_FRAME_WORKLOADS: a frame's interpolated frames stop when the workload queue is full,
                       as when the next frame has ended: the game waits for that frame before it queues anything more,
                       and past InterpolatedTargetSlots (8) its frames waited for presents that never came. Uncapped
                       (12 frames a 30 fps game frame) Mario Party 2's page stopped for good in its opening after
                       27-46 s, render, present and game threads each waiting for the next
```
