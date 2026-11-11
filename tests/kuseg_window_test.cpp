// Memory for TLB-mapped (KUSEG) addresses, which a recomp whose code runs from them reads its strings, tables and
// constants through: N64Recomp's recomp.h maps the recompiled code's loads and stores, ultramodern's TO_PTR the
// runtime's, and librecomp's make_kuseg_accessible opens a range (librecomp/src/kuseg.cpp, built in here alone). Run by
// CI three ways:
//
// - natively, where KUSEG lies 2 GB past rdram in the range librecomp reserves, and a range opened is written and read;
// - in node with RECOMP_KUSEG_WINDOW, where wasm32's pointers would wrap it into the heap and it goes to the window
//   librecomp allocates right after kseg0's 512 MB instead, a KUSEG address past the window wrapped inside it;
// - in node without it, where every address is as before and nothing can be opened.
//
//   rt=<N64ModernRuntime>; inc="-I$rt/N64Recomp/include -I$rt/ultramodern/include -I$rt/librecomp/include"
//   g++ -std=c++20 $inc tests/kuseg_window_test.cpp $rt/librecomp/src/kuseg.cpp -o kuseg && ./kuseg
//   em++ -std=c++20 [-DRECOMP_KUSEG_WINDOW] -sALLOW_MEMORY_GROWTH -sMAXIMUM_MEMORY=4GB $inc <the same> -o kuseg.js
//   node kuseg.js

#include <cstdio>
#include <cstring>
#include <sys/mman.h>

#include "librecomp/addresses.hpp"

namespace {

int failures = 0;

void check(bool ok, const char* what) {
    if (!ok) {
        printf("FAIL: %s\n", what);
        failures++;
    }
}

// A guest address as the generated code holds it, sign-extended to 64 bits.
gpr guest(uint32_t vaddr) {
    return (gpr)(int64_t)(int32_t)vaddr;
}

// Where a recompiled 32-bit load from vaddr reads.
uint8_t* load_at(uint8_t* rdram, uint32_t vaddr) {
    return (uint8_t*)&MEM_W(0, guest(vaddr));
}

// Where the runtime's TO_PTR puts vaddr.
uint8_t* runtime_at(uint8_t* rdram, uint32_t vaddr) {
    return TO_PTR(uint8_t, (int32_t)vaddr);
}

}

int main() {
    // As recomp.cpp allocates it.
    uint8_t* rdram = (uint8_t*)mmap(nullptr, recomp::allocation_size, PROT_NONE, MAP_ANON | MAP_PRIVATE, -1, 0);
    if (rdram == (uint8_t*)MAP_FAILED || mprotect(rdram, recomp::mem_size, PROT_READ | PROT_WRITE) != 0) {
        printf("FAIL: couldn't allocate rdram\n");
        return 1;
    }

    // KSEG0, as every recomp reads it.
    check(load_at(rdram, 0x80000400) == rdram + 0x400, "a KSEG0 load reads at its offset");
    check(runtime_at(rdram, 0x80000400) == rdram + 0x400, "TO_PTR puts KSEG0 at its offset");
    check((uint8_t*)&MEM_B(0, guest(0x80000400)) == rdram + 0x403, "a KSEG0 byte load reads its byte of the word");
    MEM_W(0, guest(0x80000400)) = 0x12345678;
    check(*(uint32_t*)(rdram + 0x400) == 0x12345678, "a KSEG0 store writes RDRAM");

    // A TLB-mapped game's code at 0x00200400 and a ROM region mapped at 0x00480000.
    check(recomp::make_kuseg_accessible(rdram, 0x00480000, 0) == false, "an empty range isn't opened");
    check(recomp::make_kuseg_accessible(rdram, 0x80000000, 0x1000) == false, "KSEG0 isn't KUSEG");
    check(recomp::make_kuseg_accessible(rdram, 0x7FFFF000, 0x2000) == false, "a range running out of KUSEG isn't opened");

#if defined(__EMSCRIPTEN__) && !defined(RECOMP_KUSEG_WINDOW)
    check(recomp::allocation_size == recomp::mem_size, "no window is allocated");
    check(recomp::make_kuseg_accessible(rdram, 0x00200000, 0x200000) == false, "no KUSEG range is opened");
    check((uint32_t)(load_at(rdram, 0x00200400) - rdram) == 0x80200400u, "a KUSEG load reads where it always did");
#else
    check(recomp::make_kuseg_accessible(rdram, 0x00200000, 0x200000), "the code's 2 MB open");
    check(recomp::make_kuseg_accessible(rdram, 0x00480000, 0x12345), "a ROM region opens");

    uint8_t* code = load_at(rdram, 0x00200400);
    check(code == runtime_at(rdram, 0x00200400), "TO_PTR puts KUSEG where the recompiled code reads it");
    check((uint8_t*)&MEM_BU(0, guest(0x00200400)) == code + 3, "a KUSEG byte load reads its byte of the word");
    check((uint8_t*)&MEM_HU(2, guest(0x00200400)) == code, "a KUSEG halfword load reads its half of the word");

    // Filled as do_rom_read fills it, a byte at a time, and read back as the game reads its strings and tables.
    const char text[] = "Turok";
    for (uint32_t i = 0; i < sizeof(text); i++) {
        MEM_B(i, guest(0x00480000)) = text[i];
    }
    char read[sizeof(text)];
    for (uint32_t i = 0; i < sizeof(text); i++) {
        read[i] = (char)MEM_BU(i, guest(0x00480000));
    }
    check(memcmp(read, text, sizeof(text)) == 0, "a ROM region reads back what was written");
    SD(0x0123456789ABCDEFULL, 0, guest(0x00200408));
    check(LD(0, guest(0x00200408)) == 0x0123456789ABCDEFULL, "a doubleword reads back");
    check(*(uint32_t*)(rdram + 0x400) == 0x12345678, "KUSEG stores leave KSEG0 alone");
    check(*TO_PTR(uint32_t, (int32_t)0x00200408) == 0x01234567, "TO_PTR reads what the recompiled code wrote");

#if defined(__EMSCRIPTEN__)
    check(recomp::allocation_size == recomp::mem_size + 0x01000000, "the window is 16 MB past kseg0's 512 MB");
    check(code == rdram + recomp::mem_size + 0x00200400, "KUSEG lies in the window");
    check(recomp::make_kuseg_accessible(rdram, 0x00FFF000, 0x1000), "the window's last page opens");
    check(recomp::make_kuseg_accessible(rdram, 0x00FFF000, 0x2000) == false, "a range past the window isn't opened");
    check(load_at(rdram, 0x01200400) == code, "a KUSEG address past the window wraps inside it");
    check(load_at(rdram, 0x7FFFFFFC) == rdram + recomp::allocation_size - 4, "KUSEG's last word is the window's");
#else
    check(code == rdram + 0x80200400ULL, "KUSEG lies 2 GB past rdram");
#endif
#endif

    if (failures == 0) {
        printf("kuseg window: all checks passed\n");
    }
    return failures == 0 ? 0 : 1;
}
