#pragma once
// n64recomp_browser::audio: a recomp's sound output on a page, played by an AudioWorklet on the browser's audio thread
// from a ring in the program's own memory (audio_output.js). Use it in place of SDL_QueueAudio and
// SDL_GetQueuedAudioSize on Emscripten. SDL2's port plays through a ScriptProcessorNode, whose callback runs on the
// page's thread, which is also where WebGPU's work runs (plume_device_thread.h), so its sound breaks up whenever that
// thread is busy for more than one of SDL's buffers; the audio thread here waits for nobody.
#include <cstddef>
#include <cstdint>

namespace n64recomp_browser::audio {
    // Starts the output with <channels> interleaved float channels and returns its sample rate, the page's audio
    // context's (sdl_audio.js). The browser keeps it silent until the player first clicks or presses a key.
    uint32_t open(uint32_t channels);
    // Queues <frame_count> frames. What doesn't fit in the ring (about two thirds of a second) is dropped.
    void queue(const float* frames, size_t frame_count);
    // Frames queued and not yet played, less those the browser takes in one go (audio_output.cpp), as
    // SDL_GetQueuedAudioSize leaves out its device's buffer.
    size_t queued_frames();
}
