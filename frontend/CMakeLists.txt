# n64recomp_browser_frontend: what a recomp's executable built on RecompFrontend needs to be a page, as link options. Compile
# everything, libraries too, with -pthread -fwasm-exceptions -msimd128 -mtail-call "-DXXH_HAS_INCLUDE(x)=0"
# (add_compile_options; -mtail-call makes the recompiled code's tail calls return_calls, recomp.h's RECOMP_TAIL_CALL,
# and the last keeps xxHash off a NEON path that doesn't compile in C++ there), and make the executable a page with
# n64recomp_browser_frontend_page(<target>) below, which links it with this and copies coi_serviceworker.js beside it. It brings:
# - threads as pthreads, with main() on one of them (-sPROXY_TO_PTHREAD), so the page's own thread is free for the
#   WebGPU device (plume_device_thread.h), the file picker and the browser's events,
# - the page, shell.html: a canvas filling the window, which SDL's window is and RT64 draws on, and a status line,
#   fullscreen in landscape on a phone, and an on-screen controller there (the hub's site/touch_pad.js),
# - persistent_home.js: HOME (/home/web_user, where RecompFrontend keeps settings, saves and the ROM it was given)
#   kept in the browser's IndexedDB, a database for each page on a site, a file of 1 MB or more (a ROM) stored
#   there by a worker, off the page's thread,
# - save_sync.js: the saves in HOME synced with the player's own Google Drive, once they have signed in on the hub,
# - sdl_audio.js: SDL2's audio opened from a thread, which Emscripten's port can't do by itself,
# - audio_output.h: sound played on the browser's audio thread, which a recomp uses instead of SDL's queue: SDL2's
#   port plays it from the page's thread, where it breaks up whenever WebGPU keeps that thread busy,
# - worker_alert.js: alert() on a thread (SDL's message box) logged, where a worker would throw,
# - thread_stdio.js: a thread's stdout and stderr printed without waiting for the page's thread, which Emscripten
#   otherwise makes every printed line do,
# - the page's WebGPU device (plume_webgpu_device.js),
# - a link that fails on any wasm-ld warning (--fatal-warnings), for the one that matters: a call to a function whose
#   signature doesn't match the call (`function signature mismatch`) links as a trap, which stops the page only when
#   the call is made, perhaps minutes in (a patch calling a native that doesn't take (rdram, ctx), README),
# - a heap of 1536MB, 1 MB stacks and a worker for each thread the page runs, made at the start, which a recomp's own
#   target_link_options(<target> PRIVATE -sINITIAL_MEMORY=...) and the like override: they go first on the link line,
#   and Emscripten takes a setting's last value. A thread started with no worker left waits while the browser makes
#   one and instantiates the wasm in it, 130-240 ms in Chrome on a game thread's osCreateThread (32 workers held
#   GoldenEye's Start 195 ms and Donkey Kong 64's boot 0.5 s). RT64 starts min(n, 16) shader prebuild threads and n/4
#   texture stream threads for n cores (navigator.hardwareConcurrency), and its other threads, the runtime's and a
#   game's take about 30 more: GoldenEye and Donkey Kong 64 ran 45 and 46 threads with 12, so the pool is the first
#   two and 40.
# A page with threads must be cross-origin isolated: served with Cross-Origin-Opener-Policy: same-origin and
# Cross-Origin-Embedder-Policy: require-corp, or from a host that can't set headers (GitHub Pages) with
# coi_serviceworker.js beside it, which adds them.

add_library(n64recomp_browser_frontend INTERFACE)
target_link_options(n64recomp_browser_frontend INTERFACE
    -pthread -fwasm-exceptions -mtail-call -sUSE_SDL=2 -sUSE_FREETYPE=1
    -sPROXY_TO_PTHREAD -Wl,--fatal-warnings
    -lidbfs.js
    "-sDEFAULT_LIBRARY_FUNCS_TO_INCLUDE=$addRunDependency,$removeRunDependency"
    "--pre-js=${CMAKE_CURRENT_SOURCE_DIR}/persistent_home.js"
    "--pre-js=${CMAKE_CURRENT_SOURCE_DIR}/save_sync.js"
    "--pre-js=${CMAKE_CURRENT_SOURCE_DIR}/sdl_audio.js"
    "--pre-js=${CMAKE_CURRENT_SOURCE_DIR}/audio_output.js"
    "--pre-js=${CMAKE_CURRENT_SOURCE_DIR}/worker_alert.js"
    "--pre-js=${rt64_SOURCE_DIR}/src/contrib/plume/plume_webgpu_device.js"
    "--js-library=${CMAKE_CURRENT_SOURCE_DIR}/thread_stdio.js"
    "--shell-file=${CMAKE_CURRENT_SOURCE_DIR}/shell.html")
target_sources(n64recomp_browser_frontend INTERFACE "${CMAKE_CURRENT_SOURCE_DIR}/audio_output.cpp")
target_include_directories(n64recomp_browser_frontend INTERFACE "${CMAKE_CURRENT_SOURCE_DIR}")

# Makes <target> a page, <target>.html, with the service worker beside it.
function(n64recomp_browser_frontend_page target)
    target_link_libraries(${target} PRIVATE n64recomp_browser_frontend)
    # The target's own options, first: an interface library's come after them, where they would win.
    target_link_options(${target} BEFORE PRIVATE
        -sINITIAL_MEMORY=1536MB -sSTACK_SIZE=1MB -sDEFAULT_PTHREAD_STACK_SIZE=1MB
        "-sPTHREAD_POOL_SIZE=Math.min(navigator.hardwareConcurrency,16)+Math.floor(navigator.hardwareConcurrency/4)+40")
    set_target_properties(${target} PROPERTIES SUFFIX ".html")
    # The page's scripts go into it at link time, so a change to one relinks it.
    set_property(TARGET ${target} APPEND PROPERTY LINK_DEPENDS
        "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/persistent_home.js" "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/save_sync.js"
        "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/sdl_audio.js"
        "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/audio_output.js"
        "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/worker_alert.js" "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/thread_stdio.js"
        "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/shell.html" "${rt64_SOURCE_DIR}/src/contrib/plume/plume_webgpu_device.js")
    add_custom_command(TARGET ${target} POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/coi_serviceworker.js"
            $<TARGET_FILE_DIR:${target}>)
    if (N64RECOMP_BROWSER_FAST_LINK)
        target_link_options(${target} PRIVATE -O1)
    endif()
endfunction()

# The page's file picker for a recomp whose menus are its own (file_picker.h); RecompFrontend's menus have one built in.
# A library of its own, so a page that doesn't link it builds the same bytes as before.
add_library(n64recomp_browser_file_picker INTERFACE)
target_sources(n64recomp_browser_file_picker INTERFACE "${CMAKE_CURRENT_SOURCE_DIR}/file_picker.cpp")
target_include_directories(n64recomp_browser_file_picker INTERFACE "${CMAKE_CURRENT_SOURCE_DIR}")

# For a build to try something: the page is linked at -O1, where Binaryen's wasm-opt doesn't optimize the whole module,
# which is most of a link at -O3. The code is still compiled at the build's level. Rush 2049's link took 190 s at -O3
# and 11 s at -O1 (2026-10-12), and its wasm grew 7%. Leave it off for a page that people play.
option(N64RECOMP_BROWSER_FAST_LINK "Link the page without Binaryen's optimizations (builds to try something)" OFF)

# Links the code of a mod built into the recomp (an .nrm it embeds with recomp::mods::register_embedded_mod) into
# <target>, recompiled ahead of time: a page has no live recompiler, which recompiles a mod's code as it loads.
# OfflineModRecomp --static (N64Recomp-web) writes it as C defining `const recomp_precompiled_mod <name>`, which the
# recomp registers with recomp::mods::register_precompiled_mod; the runtime then runs it for that mod's files and no
# others (a newer .nrm of the same mod in the mods folder doesn't match). <syms> is the recomp's symbol file, the one
# its mods are built against. N64RECOMP_BROWSER_OFFLINE_MOD_RECOMP is OfflineModRecomp, built natively from N64Recomp-web.
function(n64recomp_browser_precompiled_mod target nrm syms name)
    if (NOT N64RECOMP_BROWSER_OFFLINE_MOD_RECOMP)
        message(FATAL_ERROR "n64recomp_browser_precompiled_mod needs N64RECOMP_BROWSER_OFFLINE_MOD_RECOMP, OfflineModRecomp's path")
    endif()
    set(dir "${CMAKE_CURRENT_BINARY_DIR}/precompiled_mods/${name}")
    add_custom_command(OUTPUT "${dir}/${name}.c"
        COMMAND ${CMAKE_COMMAND} -E make_directory "${dir}"
        COMMAND ${CMAKE_COMMAND} -E chdir "${dir}" ${CMAKE_COMMAND} -E tar xf "${nrm}" mod_binary.bin mod_syms.bin
        COMMAND "${N64RECOMP_BROWSER_OFFLINE_MOD_RECOMP}" "${dir}/mod_syms.bin" "${dir}/mod_binary.bin" "${syms}"
            "${dir}/${name}.c" --static ${name}
        DEPENDS "${nrm}" "${syms}" "${N64RECOMP_BROWSER_OFFLINE_MOD_RECOMP}")
    target_sources(${target} PRIVATE "${dir}/${name}.c")
    # Built like the recompiled code it calls into, with recomp.h.
    set_source_files_properties("${dir}/${name}.c" PROPERTIES
        COMPILE_OPTIONS "-fno-strict-aliasing;-Wno-unused-variable;-Werror=implicit-function-declaration"
        INCLUDE_DIRECTORIES "$<TARGET_PROPERTY:N64Recomp,INTERFACE_INCLUDE_DIRECTORIES>")
endfunction()

# The same functions as recomp_web_frontend_page and recomp_web_precompiled_mod (with RECOMP_WEB_OFFLINE_MOD_RECOMP),
# for a recomp that still calls them by those names.
function(recomp_web_frontend_page target)
    n64recomp_browser_frontend_page(${target})
endfunction()
function(recomp_web_precompiled_mod)
    if (NOT N64RECOMP_BROWSER_OFFLINE_MOD_RECOMP)
        set(N64RECOMP_BROWSER_OFFLINE_MOD_RECOMP "${RECOMP_WEB_OFFLINE_MOD_RECOMP}")
    endif()
    n64recomp_browser_precompiled_mod(${ARGV})
endfunction()
