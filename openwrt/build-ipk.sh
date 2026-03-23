#!/bin/bash
set -e

PKG_NAME="nas-dashboard"
VERSION="${1:-0.1.0}"
ARCH="aarch64_cortex-a53"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BINARY="${PROJECT_ROOT}/build/nas-dashboard-arm64"
IPK_FILE="${PKG_NAME}_${VERSION}_${ARCH}.ipk"
BUILD_ROOT="${SCRIPT_DIR}/_ipk-staging"

if [ ! -f "$BINARY" ]; then
    echo "Error: ARM64 binary not found at $BINARY"
    echo "Run 'make build-arm64' first."
    exit 1
fi

rm -rf "$BUILD_ROOT"
mkdir -p "$BUILD_ROOT"/{control,data}

mkdir -p "$BUILD_ROOT/data/usr/bin"
cp "$BINARY" "$BUILD_ROOT/data/usr/bin/nas-dashboard"
chmod 755 "$BUILD_ROOT/data/usr/bin/nas-dashboard"

mkdir -p "$BUILD_ROOT/data/etc/init.d"
cat > "$BUILD_ROOT/data/etc/init.d/nas-dashboard" << 'EOF'
#!/bin/sh /etc/rc.common

START=95
STOP=10
USE_PROCD=1

PROG=/usr/bin/nas-dashboard
CONFIG=/etc/nas-dashboard/config.json

start_service() {
    procd_open_instance
    procd_set_param command $PROG -config $CONFIG
    procd_set_param respawn 3600 5 5
    procd_set_param stdout 1
    procd_set_param stderr 1
    procd_close_instance
}
EOF
chmod 755 "$BUILD_ROOT/data/etc/init.d/nas-dashboard"

mkdir -p "$BUILD_ROOT/data/etc/nas-dashboard"

mkdir -p "$BUILD_ROOT/data/etc/samba"
cat > "$BUILD_ROOT/data/etc/samba/smb.conf.nas-dashboard" << 'EOF'
[global]
    workgroup = WORKGROUP
    server string = MT6000 NAS
    security = user
    map to guest = never
    log file = /var/log/samba/%m.log
    max log size = 1000
    logging = file

[nas]
    path = /mnt/ssd/shared
    browseable = yes
    read only = no
    create mask = 0644
    directory mask = 0755
EOF

mkdir -p "$BUILD_ROOT/data/etc/nginx/conf.d"
cat > "$BUILD_ROOT/data/etc/nginx/conf.d/nas-dashboard.conf" << 'EOF'
server {
    listen 80;
    server_name nas.lan;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        client_max_body_size 0;
    }
}
EOF

cat > "$BUILD_ROOT/control/control" << EOF
Package: ${PKG_NAME}
Version: ${VERSION}
Architecture: ${ARCH}
Maintainer: xSpaM
Section: utils
Priority: optional
Depends: samba4-server, block-mount, kmod-fs-ext4, kmod-usb-storage, e2fsprogs
Description: NAS Dashboard for GL.iNet Flint 2 (MT6000).
 Web-based file manager, Samba administration, system monitoring,
 and user management. Single binary with embedded web UI.
 Access via http://nas.lan after installation.
Installed-Size: $(du -sk "$BUILD_ROOT/data/usr/bin/nas-dashboard" | cut -f1)
EOF

cat > "$BUILD_ROOT/control/conffiles" << 'EOF'
/etc/nas-dashboard/config.json
/etc/samba/smb.conf.nas-dashboard
/etc/nginx/conf.d/nas-dashboard.conf
EOF

cat > "$BUILD_ROOT/control/postinst" << 'POSTINST'
#!/bin/sh
set -e

MOUNT_POINT="/mnt/ssd"
DEVICE="/dev/sda1"

mkdir -p "$MOUNT_POINT"
mkdir -p /mnt/ssd/shared
mkdir -p /var/log/samba

if [ -b "$DEVICE" ] && ! mount | grep -q "$MOUNT_POINT"; then
    if ! blkid "$DEVICE" | grep -q "ext4"; then
        echo "nas-dashboard: Formatting $DEVICE as ext4..."
        mkfs.ext4 -q -L nas-storage "$DEVICE"
    fi
    mount -t ext4 -o noatime "$DEVICE" "$MOUNT_POINT"
    if ! grep -q "$MOUNT_POINT" /etc/fstab; then
        echo "$DEVICE $MOUNT_POINT ext4 noatime,errors=remount-ro 0 2" >> /etc/fstab
    fi
fi

if [ ! -f /etc/samba/smb.conf ] || ! grep -q "nas-dashboard" /etc/samba/smb.conf 2>/dev/null; then
    cp /etc/samba/smb.conf.nas-dashboard /etc/samba/smb.conf
fi

/etc/init.d/nas-dashboard enable
/etc/init.d/nas-dashboard start

if /etc/init.d/samba4 enabled 2>/dev/null; then
    /etc/init.d/samba4 restart
else
    /etc/init.d/samba4 enable
    /etc/init.d/samba4 start
fi

LAN_IP=$(uci get network.lan.ipaddr 2>/dev/null || echo "192.168.8.1")

if ! uci show dhcp 2>/dev/null | grep -q "nas.lan"; then
    uci add dhcp domain
    uci set dhcp.@domain[-1].name='nas.lan'
    uci set dhcp.@domain[-1].ip="$LAN_IP"
    uci commit dhcp
    /etc/init.d/dnsmasq restart
fi

if [ -f /etc/init.d/nginx ]; then
    /etc/init.d/nginx restart
fi

echo ""
echo "=== NAS Dashboard installed ==="
echo ""
echo "  Dashboard:  http://nas.lan"
echo "  Fallback:   http://${LAN_IP}:8080"
echo "  Login:      admin / admin"
echo "  SMB:        \\\\${LAN_IP}\\nas"
echo ""
POSTINST
chmod 755 "$BUILD_ROOT/control/postinst"

cat > "$BUILD_ROOT/control/prerm" << 'PRERM'
#!/bin/sh
/etc/init.d/nas-dashboard stop 2>/dev/null || true
/etc/init.d/nas-dashboard disable 2>/dev/null || true

DOMAIN_IDX=$(uci show dhcp 2>/dev/null | grep "nas.lan" | head -1 | sed 's/dhcp\.@domain\[\([0-9]*\)\].*/\1/')
if [ -n "$DOMAIN_IDX" ]; then
    uci delete "dhcp.@domain[$DOMAIN_IDX]" 2>/dev/null || true
    uci commit dhcp 2>/dev/null || true
    /etc/init.d/dnsmasq restart 2>/dev/null || true
fi

rm -f /etc/nginx/conf.d/nas-dashboard.conf 2>/dev/null || true
if [ -f /etc/init.d/nginx ]; then
    /etc/init.d/nginx restart 2>/dev/null || true
fi
PRERM
chmod 755 "$BUILD_ROOT/control/prerm"

echo "2.0" > "$BUILD_ROOT/debian-binary"

cd "$BUILD_ROOT"
tar czf control.tar.gz -C control .
tar czf data.tar.gz -C data .
tar czf "../$IPK_FILE" debian-binary control.tar.gz data.tar.gz
cd ..

rm -rf "$BUILD_ROOT"

FILESIZE=$(du -h "$SCRIPT_DIR/$IPK_FILE" | cut -f1)
echo "Built: $IPK_FILE ($FILESIZE)"
echo ""
echo "Install on router:"
echo "  scp openwrt/$IPK_FILE root@192.168.8.1:/tmp/"
echo "  ssh root@192.168.8.1 'opkg install /tmp/$IPK_FILE'"
