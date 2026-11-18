# The image tools/remote_frame_dump.sh runs a recomp's Linux desktop build in, on a Linux host with an NVIDIA GPU, to
# dump its frames (RT64_FRAME_DUMP) by a plan and check them with tools/frame_check.mjs (tools/frame_dump.mjs drives
# both). The program draws on the host's GPU through NVIDIA's Vulkan driver, which the NVIDIA container toolkit mounts
# (--gpus, NVIDIA_DRIVER_CAPABILITIES=all, its X driver included), into Xorg on NVIDIA's X driver with no display, so a
# present stays on the GPU (frame_dump.mjs's xServer() says what Xvfb's cost), and no privileges are needed: its
# config is /etc/X11/frame-dump.conf, written here, since a server not run as root takes -config only as a name under
# /etc/X11. xdotool sends a plan's keys and sizes the window,
# ImageMagick and x11-apps' xwd take its shots. GTK 3 and FreeType are what a recomp's Linux archive doesn't carry.
# gcc builds tools/sdl_audio_record.c, which records the sound each run plays.
# remote_frame_dump.sh tags it with a hash of this file, so a change here makes the next run build a new one.
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends xserver-xorg-core xdotool x11-utils x11-apps \
      imagemagick libgtk-3-0t64 libfreetype6 libvulkan1 ca-certificates procps gcc libc6-dev && \
    rm -rf /var/lib/apt/lists/* && \
    printf '%s\n' \
      'Section "Files"' \
      '  ModulePath "/usr/lib/x86_64-linux-gnu/nvidia/xorg"' \
      '  ModulePath "/usr/lib/xorg/modules"' \
      'EndSection' \
      'Section "ServerFlags"' \
      '  Option "AutoAddDevices" "false"' \
      '  Option "AutoAddGPU" "false"' \
      'EndSection' \
      'Section "Device"' \
      '  Identifier "gpu"' \
      '  Driver "nvidia"' \
      '  Option "AllowEmptyInitialConfiguration" "true"' \
      '  Option "UseDisplayDevice" "None"' \
      'EndSection' \
      'Section "Screen"' \
      '  Identifier "screen"' \
      '  Device "gpu"' \
      '  DefaultDepth 24' \
      '  SubSection "Display"' \
      '    Depth 24' \
      '    Virtual 7680 2160' \
      '  EndSubSection' \
      'EndSection' > /etc/X11/frame-dump.conf
COPY --from=node:24-slim /usr/local/bin/node /usr/local/bin/node
ENV NVIDIA_DRIVER_CAPABILITIES=all
