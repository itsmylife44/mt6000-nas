#!/bin/sh
set -e

INSTALL_DIR="/opt/nas-dashboard"
CONFIG_DIR="/etc/nas-dashboard"
BINARY_NAME="nas-dashboard-arm64"
SERVICE_NAME="nas-dashboard"
MOUNT_POINT="/mnt/ssd"
DEVICE="/dev/sda1"

echo "=== MT6000 NAS Dashboard Installer ==="

if [ "$(id -u)" -ne 0 ]; then
    echo "Error: must run as root"
    exit 1
fi

echo "[1/6] Installing dependencies..."
opkg update
opkg install samba4-server samba4-client block-mount kmod-fs-ext4 kmod-usb-storage e2fsprogs

echo "[2/6] Setting up SSD mount..."
mkdir -p "$MOUNT_POINT"

if ! mount | grep -q "$MOUNT_POINT"; then
    if [ -b "$DEVICE" ]; then
        if ! blkid "$DEVICE" | grep -q "ext4"; then
            echo "Formatting $DEVICE as ext4..."
            mkfs.ext4 -L nas-storage "$DEVICE"
        fi
        mount -t ext4 -o noatime "$DEVICE" "$MOUNT_POINT"
        echo "$DEVICE $MOUNT_POINT ext4 noatime,errors=remount-ro 0 2" >> /etc/fstab
        echo "SSD mounted at $MOUNT_POINT"
    else
        echo "Warning: $DEVICE not found. Connect your SSD and re-run."
    fi
fi

echo "[3/6] Installing NAS Dashboard binary..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$CONFIG_DIR"

if [ -f "$BINARY_NAME" ]; then
    cp "$BINARY_NAME" "$INSTALL_DIR/nas-dashboard"
    chmod +x "$INSTALL_DIR/nas-dashboard"
else
    echo "Error: $BINARY_NAME not found in current directory"
    exit 1
fi

echo "[4/6] Setting up Samba..."
if [ ! -f /etc/samba/smb.conf.bak ]; then
    cp /etc/samba/smb.conf /etc/samba/smb.conf.bak 2>/dev/null || true
fi

cat > /etc/samba/smb.conf << 'SMBEOF'
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
    valid users = @nas
SMBEOF

mkdir -p /mnt/ssd/shared
mkdir -p /var/log/samba

echo "[5/6] Creating init.d service..."
cat > /etc/init.d/$SERVICE_NAME << 'INITEOF'
#!/bin/sh /etc/rc.common

START=99
STOP=10
USE_PROCD=1

PROG=/opt/nas-dashboard/nas-dashboard
CONFIG=/etc/nas-dashboard/config.json

start_service() {
    procd_open_instance
    procd_set_param command $PROG -config $CONFIG
    procd_set_param respawn 3600 5 5
    procd_set_param stdout 1
    procd_set_param stderr 1
    procd_close_instance
}
INITEOF

chmod +x /etc/init.d/$SERVICE_NAME

echo "[6/6] Starting services..."
/etc/init.d/samba4 enable
/etc/init.d/samba4 restart
/etc/init.d/$SERVICE_NAME enable
/etc/init.d/$SERVICE_NAME start

echo ""
echo "=== Installation complete ==="
echo "Dashboard: http://$(uci get network.lan.ipaddr):8080"
echo "Default login: admin / admin"
echo "IMPORTANT: Change the default password immediately!"
echo ""
echo "SMB share available at: \\\\$(uci get network.lan.ipaddr)\\nas"
