# The web support as patches on a recomp's own rt64, N64ModernRuntime and RecompFrontend, at whatever upstream commits
# it pins: the recomp keeps its submodules and adds this repo, and its web build patches their checkouts. Each patch
# here is what a fork adds to upstream (patches.txt, tools/export_patches.sh). Every web change in them is behind
# __EMSCRIPTEN__ or __wasm__ (or a CMake option on with Emscripten), so a patched checkout still builds the desktop
# program as upstream does, but for fixes to bugs the desktop build has too (docs/forks.md, "on every build").
#
# Patch them before building N64Recomp from them (the page needs the recompiled code made by the patched one), from
# the recomp's folder:
#
#   cmake -P lib/N64Recomp-browser/patches/apply.cmake lib           the folder holding rt64, N64ModernRuntime and
#                                                                    RecompFrontend, with plume, hlslpp and N64Recomp
#                                                                    where they keep them
#   cmake -P lib/N64Recomp-browser/patches/apply.cmake N64Recomp tools/N64Recomp      one project, anywhere
#   cmake -P lib/N64Recomp-browser/patches/apply.cmake N64Recomp tools/N64Recomp src/analysis.cpp
#                                                                    leaving out a file (a path in the project) whose
#                                                                    change the recomp's own patch already makes its own
#                                                                    way, where the two would conflict
#   cmake -P lib/N64Recomp-browser/patches/apply.cmake rt64 lib/rt64 --since <commit> <file>...
#                                                                    files left out whose web change the recomp made its
#                                                                    own way from this repo's <commit>: the web's change
#                                                                    to them since, merged in (below)
#
# and again from the recomp's CMakeLists.txt when it configures for the web, before adding them, which does nothing if
# they are patched already:
#
#   include(${CMAKE_SOURCE_DIR}/lib/N64Recomp-browser/patches/apply.cmake)
#   n64recomp_browser_apply_patches(${CMAKE_SOURCE_DIR}/lib)
#
# A patch goes in with git apply, and where the recomp's commit differs too much around a change for that, with a
# three-way merge against the upstream commit the patch was made on, fetched into the checkout from the fork. A
# checkout with changes of its own (a recomp's own patches) is patched on top of them. A patch that applies neither
# way stops with the files that conflict; undo a checkout's patch with git apply --reverse <patch>.

set(N64RECOMP_BROWSER_PATCHES_DIR "${CMAKE_CURRENT_LIST_DIR}")

# A hash of a checkout's changes to its files (under <sub>, in a repository it shares), but not its submodules': one
# patched after it (rt64's plume and hlslpp) shows up "-dirty" and would change what its stamp holds.
function(_n64recomp_browser_changes top sub out)
    execute_process(COMMAND git diff HEAD --binary --ignore-submodules=all -- "./${sub}" WORKING_DIRECTORY "${top}"
        OUTPUT_VARIABLE diff)
    string(SHA1 hash "${diff}")
    set(${out} ${hash} PARENT_SCOPE)
endfunction()

# Fetches the upstream commit <name>.patch was made on (or the commit after <out>, an earlier one) from the fork
# patches.txt names into the repository at <top>, and returns it, or nothing if it can't.
function(_n64recomp_browser_fetch_base name top out)
    file(STRINGS "${N64RECOMP_BROWSER_PATCHES_DIR}/patches.txt" rows REGEX "^${name} ")
    string(REGEX REPLACE " +" ";" row "${rows}")
    list(GET row 2 fork)
    list(GET row 3 base)
    if (ARGC GREATER 3)
        set(base "${ARGV3}")
    endif()
    message(STATUS "N64Recomp-browser: fetching ${name}'s upstream ${base} from ${fork}")
    # --refetch brings the commit's files even where the checkout has the commit already: a partial clone
    # (--filter=blob:none, as DKR-R's bootstrap makes) holds upstream's commits without their files, and git apply
    # fetches none of them for the merge ("repository lacks the necessary blob"). Older gits have no --refetch.
    execute_process(COMMAND git fetch -q --depth 1 --refetch "${fork}" "${base}" WORKING_DIRECTORY "${top}"
        RESULT_VARIABLE result ERROR_QUIET)
    if (NOT result EQUAL 0)
        execute_process(COMMAND git fetch -q --depth 1 "${fork}" "${base}" WORKING_DIRECTORY "${top}" RESULT_VARIABLE result)
    endif()
    if (result EQUAL 0)
        set(${out} ${base} PARENT_SCOPE)
    else()
        set(${out} "" PARENT_SCOPE)
    endif()
endfunction()

# Patches one project's checkout, <dir>, with <name>.patch, but the files named after it (paths in the project).
function(n64recomp_browser_apply_patch name dir)
    set(patch "${N64RECOMP_BROWSER_PATCHES_DIR}/${name}.patch")
    get_filename_component(dir "${dir}" ABSOLUTE)
    if (NOT EXISTS "${patch}")
        message(FATAL_ERROR "N64Recomp-browser: no patch for ${name}")
    endif()
    # git apply takes a patch's paths from the top of the repository, so a project kept inside another repository's
    # tree, not as a submodule, gets its folder prepended.
    execute_process(COMMAND git rev-parse --show-toplevel WORKING_DIRECTORY "${dir}"
        RESULT_VARIABLE result OUTPUT_VARIABLE top OUTPUT_STRIP_TRAILING_WHITESPACE ERROR_QUIET)
    if (NOT result EQUAL 0)
        message(FATAL_ERROR "N64Recomp-browser: ${dir} (${name}) isn't a git checkout")
    endif()
    get_filename_component(top "${top}" REALPATH)
    get_filename_component(real "${dir}" REALPATH)
    file(RELATIVE_PATH sub "${top}" "${real}")
    set(apply git apply --whitespace=nowarn)
    if (sub)
        list(APPEND apply "--directory=${sub}")
    endif()
    # --exclude matches a path with --directory's folder already prepended.
    foreach (file IN LISTS ARGN)
        if (sub)
            set(file "${sub}/${file}")
        endif()
        list(APPEND apply "--exclude=${file}")
    endforeach()

    # Patched already: the patch comes out again, or the checkout's changes are what they were when it went in (a
    # three-way merge, which the reverse can't take out), kept in the checkout's git dir.
    execute_process(COMMAND ${apply} --reverse --check "${patch}" WORKING_DIRECTORY "${top}"
        RESULT_VARIABLE result OUTPUT_QUIET ERROR_QUIET)
    if (result EQUAL 0)
        return()
    endif()
    execute_process(COMMAND git rev-parse --path-format=absolute --git-path "n64recomp-browser-${name}"
        WORKING_DIRECTORY "${top}" OUTPUT_VARIABLE stamp OUTPUT_STRIP_TRAILING_WHITESPACE)
    file(SHA1 "${patch}" patch_hash)
    string(SHA1 patch_hash "${patch_hash} ${ARGN}")
    _n64recomp_browser_changes("${top}" "${sub}" changes)
    if (EXISTS "${stamp}")
        file(READ "${stamp}" stamped)
        if (stamped STREQUAL "${patch_hash} ${changes}")
            return()
        endif()
    endif()

    execute_process(COMMAND ${apply} "${patch}" WORKING_DIRECTORY "${top}" RESULT_VARIABLE result ERROR_VARIABLE plain)
    if (result EQUAL 0)
        message(STATUS "N64Recomp-browser: patched ${name} (${dir})")
        return()
    endif()

    # The three-way merge needs the upstream files the patch was made from.
    message(STATUS "N64Recomp-browser: ${name} needs a three-way merge")
    _n64recomp_browser_fetch_base(${name} "${top}" base)
    if (base)
        # --3way merges against the index, so it works in an index of its own holding the checkout's files as they
        # are (its own changes included), and the checkout's index stays as it was.
        set(index "${stamp}.index")
        set(env ${CMAKE_COMMAND} -E env "GIT_INDEX_FILE=${index}")
        execute_process(COMMAND ${env} git read-tree HEAD WORKING_DIRECTORY "${top}")
        execute_process(COMMAND ${env} git add -u -- "./${sub}" WORKING_DIRECTORY "${top}")
        execute_process(COMMAND ${env} ${apply} --3way "${patch}" WORKING_DIRECTORY "${top}"
            RESULT_VARIABLE result ERROR_VARIABLE merged)
        file(REMOVE "${index}")
        if (result EQUAL 0)
            _n64recomp_browser_changes("${top}" "${sub}" changes)
            file(WRITE "${stamp}" "${patch_hash} ${changes}")
            message(STATUS "N64Recomp-browser: patched ${name} (${dir}) with a three-way merge")
            return()
        endif()
        set(plain "${merged}")
    endif()
    message(FATAL_ERROR "N64Recomp-browser: ${name}.patch doesn't apply to ${dir}:\n${plain}")
endfunction()

# A recomp that leaves files out of <name>.patch where its own changes meet the web's (n64recomp_browser_apply_patch's
# files left out) makes the web's change to them its own way, merged by hand with its own, from this repository's
# <commit>. Run after its own change is in, this merges into those files of <dir> what the web has changed in them
# since <commit>, three ways: the files as upstream's commit with <commit>'s patch, as they are, and as upstream's
# commit with this patch. So the recomp's merge takes the web's later changes by itself, and only a change that meets
# its own lines stops, the file left with conflict markers to merge by hand into its own change, which is then from this
# commit. Merging again, or where nothing moved, changes nothing. Where the upstream commit the patches are made on moved
# since <commit>, <commit>'s patch goes on the upstream commit it was made on, and upstream's change to a file between
# the two is taken back out of this patch's side first: the recomp's files are on its own commit, so only the web's
# change is merged. One that meets the web's lines (the fork merged it by hand) stops for a merge by hand.
function(n64recomp_browser_merge_since name dir commit)
    get_filename_component(dir "${dir}" ABSOLUTE)
    execute_process(COMMAND git rev-parse --show-toplevel WORKING_DIRECTORY "${dir}"
        RESULT_VARIABLE result OUTPUT_VARIABLE top OUTPUT_STRIP_TRAILING_WHITESPACE ERROR_QUIET)
    if (NOT result EQUAL 0)
        message(FATAL_ERROR "N64Recomp-browser: ${dir} (${name}) isn't a git checkout")
    endif()
    get_filename_component(top "${top}" REALPATH)
    get_filename_component(real "${dir}" REALPATH)
    file(RELATIVE_PATH sub "${top}" "${real}")
    if (sub)
        set(sub "${sub}/")
    endif()

    # <commit>'s patch, from this repository's history (fetched into a shallow checkout of it).
    get_filename_component(browser "${N64RECOMP_BROWSER_PATCHES_DIR}" DIRECTORY)
    execute_process(COMMAND git cat-file -e "${commit}:patches/${name}.patch" WORKING_DIRECTORY "${browser}"
        RESULT_VARIABLE result ERROR_QUIET)
    if (NOT result EQUAL 0)
        execute_process(COMMAND git fetch -q --depth 1 origin "${commit}" WORKING_DIRECTORY "${browser}" ERROR_QUIET)
    endif()
    execute_process(COMMAND git rev-parse --path-format=absolute --git-path "n64recomp-browser-${name}-since"
        WORKING_DIRECTORY "${top}" OUTPUT_VARIABLE work OUTPUT_STRIP_TRAILING_WHITESPACE)
    file(REMOVE_RECURSE "${work}")
    file(MAKE_DIRECTORY "${work}")
    execute_process(COMMAND git show "${commit}:patches/${name}.patch" WORKING_DIRECTORY "${browser}"
        OUTPUT_FILE "${work}/old.patch" RESULT_VARIABLE result)
    if (NOT result EQUAL 0)
        message(FATAL_ERROR "N64Recomp-browser: no ${name}.patch at ${commit} in ${browser}")
    endif()
    execute_process(COMMAND git show "${commit}:patches/patches.txt" WORKING_DIRECTORY "${browser}"
        OUTPUT_VARIABLE then)
    string(REGEX MATCH "\n${name} +[^ ]+ +[^ ]+ +([0-9a-f]+)" then "\n${then}")
    _n64recomp_browser_fetch_base(${name} "${top}" base)
    if (NOT base)
        message(FATAL_ERROR "N64Recomp-browser: can't fetch ${name}'s upstream commit to merge into ${dir}")
    endif()
    set(then_base "${CMAKE_MATCH_1}")
    if (NOT then_base)
        message(FATAL_ERROR "N64Recomp-browser: no ${name} in patches.txt at ${commit}")
    endif()
    if (NOT then_base STREQUAL base)
        _n64recomp_browser_fetch_base(${name} "${top}" fetched ${then_base})
        if (NOT fetched)
            message(FATAL_ERROR "N64Recomp-browser: can't fetch ${name}'s upstream ${then_base}, which ${commit}'s patch "
                "was made on")
        endif()
    endif()

    # The files as upstream's commit with each patch, in an index of their own.
    set(include "")
    foreach (file IN LISTS ARGN)
        list(APPEND include "--include=${sub}${file}")
    endforeach()
    # Each side's commit is looked up by its name, never if (side STREQUAL then): if() reads a word that names a
    # variable as that variable, and then holds patches.txt's row at <commit>, so upstream's change came out of nothing.
    set(patch_old "${work}/old.patch")
    set(patch_new "${N64RECOMP_BROWSER_PATCHES_DIR}/${name}.patch")
    set(on_old "${then_base}")
    set(on_new "${base}")
    set(on_then "${then_base}")
    set(on_now "${base}")
    foreach (side old new)
        set(patch "${patch_${side}}")
        set(on "${on_${side}}")
        set(env ${CMAKE_COMMAND} -E env "GIT_INDEX_FILE=${work}/${side}.index")
        if (sub)
            execute_process(COMMAND ${env} git read-tree "--prefix=${sub}" "${on}" WORKING_DIRECTORY "${top}")
            set(directory "--directory=${sub}")
        else()
            execute_process(COMMAND ${env} git read-tree "${on}" WORKING_DIRECTORY "${top}")
            set(directory "")
        endif()
        execute_process(COMMAND ${env} git apply --cached --whitespace=nowarn ${directory} ${include} "${patch}"
            WORKING_DIRECTORY "${top}" RESULT_VARIABLE result ERROR_VARIABLE error)
        if (NOT result EQUAL 0)
            message(FATAL_ERROR "N64Recomp-browser: ${name}.patch (${side}) doesn't apply to upstream's ${on}:\n${error}")
        endif()
    endforeach()

    set(merged "")
    set(conflicts "")
    foreach (file IN LISTS ARGN)
        foreach (side old new)
            set(env ${CMAKE_COMMAND} -E env "GIT_INDEX_FILE=${work}/${side}.index")
            execute_process(COMMAND ${env} git ls-files -s -- "${sub}${file}" WORKING_DIRECTORY "${top}"
                OUTPUT_VARIABLE ${side})
            string(REGEX MATCH "^[0-9]+ ([0-9a-f]+)" ${side} "${${side}}")
            set(${side} "${CMAKE_MATCH_1}")
        endforeach()
        if (old STREQUAL new)
            continue()
        endif()
        foreach (side old new)
            if (${side})
                execute_process(COMMAND git cat-file blob ${${side}} WORKING_DIRECTORY "${top}" OUTPUT_FILE "${work}/${side}")
            else()
                file(WRITE "${work}/${side}" "")
            endif()
        endforeach()
        if (NOT then_base STREQUAL base)
            # Upstream's change to the file, taken back out of this patch's side.
            foreach (side then now)
                execute_process(COMMAND git cat-file blob "${on_${side}}:${file}" WORKING_DIRECTORY "${top}"
                    OUTPUT_FILE "${work}/${side}" RESULT_VARIABLE result ERROR_QUIET)
                if (NOT result EQUAL 0)
                    file(WRITE "${work}/${side}" "")
                endif()
            endforeach()
            execute_process(COMMAND git merge-file "${work}/new" "${work}/now" "${work}/then" WORKING_DIRECTORY "${top}"
                RESULT_VARIABLE result)
            if (NOT result EQUAL 0)
                message(FATAL_ERROR "N64Recomp-browser: ${name}'s upstream change to ${file} from ${then_base} to ${base} "
                    "meets the web's: merge the web's change to it since ${commit} into ${dir}'s by hand")
            endif()
            execute_process(COMMAND ${CMAKE_COMMAND} -E compare_files "${work}/old" "${work}/new" RESULT_VARIABLE result)
            if (result EQUAL 0)
                continue()
            endif()
        endif()
        if (NOT EXISTS "${top}/${sub}${file}")
            file(WRITE "${top}/${sub}${file}" "")
        endif()
        # Where both only added lines at the same place (an include beside an include), both are kept, the recomp's
        # first; any other conflict is left in the file with the lines both started from.
        set(merge git merge-file -L "${dir} ${file}" -L "N64Recomp-browser ${commit}" -L "N64Recomp-browser"
            "${top}/${sub}${file}" "${work}/old" "${work}/new")
        execute_process(COMMAND ${merge} -p --diff3 WORKING_DIRECTORY "${top}" RESULT_VARIABLE result OUTPUT_VARIABLE text)
        string(REGEX MATCHALL "\n<<<<<<< " starts "\n${text}")
        string(REGEX MATCHALL "\n\\|\\|\\|\\|\\|\\|\\| [^\n]*\n=======\n" added "\n${text}")
        list(LENGTH starts starts)
        list(LENGTH added added)
        if (result EQUAL 0)
            execute_process(COMMAND ${merge} WORKING_DIRECTORY "${top}")
            list(APPEND merged "${file}")
        elseif (starts EQUAL added)
            execute_process(COMMAND ${merge} --union WORKING_DIRECTORY "${top}")
            list(APPEND merged "${file} (lines both added, kept)")
        else()
            execute_process(COMMAND ${merge} --diff3 WORKING_DIRECTORY "${top}")
            list(APPEND conflicts "${file}")
        endif()
    endforeach()
    file(REMOVE_RECURSE "${work}")
    if (merged)
        list(JOIN merged ", " merged)
        message(STATUS "N64Recomp-browser: merged the web's change since ${commit} into ${dir}'s ${merged}")
    endif()
    if (conflicts)
        list(JOIN conflicts "\n  " conflicts)
        message(FATAL_ERROR "N64Recomp-browser: the web's change since ${commit} meets ${dir}'s own in these files, left "
            "with conflict markers: merge them by hand into its change to them, which is then from this commit:\n  ${conflicts}")
    endif()
endfunction()

# Patches every project under <dir>, the folder holding rt64, N64ModernRuntime and RecompFrontend, at the place in it
# patches.txt names; one that isn't there is left out with a note.
function(n64recomp_browser_apply_patches dir)
    file(STRINGS "${N64RECOMP_BROWSER_PATCHES_DIR}/patches.txt" rows REGEX "^[^#]")
    foreach (row IN LISTS rows)
        string(REGEX REPLACE " +" ";" row "${row}")
        list(GET row 0 name)
        list(GET row 1 path)
        if (EXISTS "${dir}/${path}/.git")
            n64recomp_browser_apply_patch(${name} "${dir}/${path}")
        else()
            message(STATUS "N64Recomp-browser: no ${path} in ${dir}, ${name} not patched")
        endif()
    endforeach()
endfunction()

if (CMAKE_SCRIPT_MODE_FILE AND CMAKE_SCRIPT_MODE_FILE STREQUAL CMAKE_CURRENT_LIST_FILE)
    if (CMAKE_ARGC EQUAL 4)
        n64recomp_browser_apply_patches("${CMAKE_ARGV3}")
    elseif (CMAKE_ARGC GREATER_EQUAL 8 AND CMAKE_ARGV5 STREQUAL "--since")
        set(files "")
        math(EXPR last "${CMAKE_ARGC} - 1")
        foreach (i RANGE 7 ${last})
            list(APPEND files "${CMAKE_ARGV${i}}")
        endforeach()
        n64recomp_browser_merge_since("${CMAKE_ARGV3}" "${CMAKE_ARGV4}" "${CMAKE_ARGV6}" ${files})
    elseif (CMAKE_ARGC GREATER_EQUAL 5)
        set(excluded "")
        math(EXPR last "${CMAKE_ARGC} - 1")
        if (last GREATER_EQUAL 5)
            foreach (i RANGE 5 ${last})
                list(APPEND excluded "${CMAKE_ARGV${i}}")
            endforeach()
        endif()
        n64recomp_browser_apply_patch("${CMAKE_ARGV3}" "${CMAKE_ARGV4}" ${excluded})
    else()
        message(FATAL_ERROR "cmake -P apply.cmake <folder> | <name> <folder> [<file left out>...] | "
            "<name> <folder> --since <commit> <file left out>...")
    endif()
endif()
