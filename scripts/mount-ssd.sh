#!/bin/sh
set -e

MOUNT_POINT="${1:-/mnt/ssd}"
DEVICE="${2:-/dev/sda1}"

if mount | grep -q "$MOUNT_POINT"; then
    echo "Already mounted at $MOUNT_POINT"
    df -h "$MOUNT_POINT"
    exit 0
fi

if [ ! -b "$DEVICE" ]; then
    echo "Error: device $DEVICE not found"
    echo "Available block devices:"
    ls -la /dev/sd* 2>/dev/null || echo "  none found"
    exit 1
fi

mkdir -p "$MOUNT_POINT"
mount -t ext4 -o noatime,errors=remount-ro "$DEVICE" "$MOUNT_POINT"
echo "Mounted $DEVICE at $MOUNT_POINT"
df -h "$MOUNT_POINT"
