# The image tools/boot_release.sh boots a Linux release archive in: a plain Ubuntu 24.04 with what a player's system
# has and the archive doesn't carry (GTK 3, FreeType, a Vulkan driver, here Mesa's lavapipe on the CPU), Xvfb for a
# display, and xwd and ImageMagick to capture it. boot_release.sh tags it with a hash of this file, so a change here
# makes the next boot build a new one.
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends libgtk-3-0t64 libfreetype6 libvulkan1 \
    mesa-vulkan-drivers xvfb x11-apps imagemagick && rm -rf /var/lib/apt/lists/*
