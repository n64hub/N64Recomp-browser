# The image tools/boot_release.sh boots a Linux release archive in: a plain Ubuntu 24.04, with what a player's system
# has and the archive doesn't carry (GTK 3, FreeType, a Vulkan driver, here Mesa's lavapipe on the CPU), Xvfb for a
# display, and xwd and ImageMagick to capture it. Not 22.04, the oldest system the archives run on: its lavapipe is too
# slow to draw Perfect Dark's title within 40 s. 24.04's (Mesa 25) is fast enough; it crashed every recomp some seconds
# into its game until plume a8e74eb (docs/findings.md, A desktop build on Mesa's lavapipe).
# boot_release.sh tags the image with a hash of this file, so a change here makes the next boot build a new one.
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends libgtk-3-0t64 libfreetype6 libvulkan1 \
    mesa-vulkan-drivers xvfb x11-apps imagemagick && rm -rf /var/lib/apt/lists/*
