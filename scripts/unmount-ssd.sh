#!/bin/sh
set -e

MOUNT_POINT="${1:-/mnt/ssd}"

if ! mount | grep -q "$MOUNT_POINT"; then
    echo "Not mounted: $MOUNT_POINT"
    exit 0
fi

sync
umount "$MOUNT_POINT"
echo "Unmounted $MOUNT_POINT"
