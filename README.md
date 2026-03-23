# MT6000 NAS Dashboard

[![Go 1.24+](https://img.shields.io/badge/Go-1.24%2B-00ADD8?logo=go)](https://go.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![OpenWrt](https://img.shields.io/badge/OpenWrt-ARM64-blue?logo=openwrt)](https://openwrt.org/)
[![Binary size](https://img.shields.io/badge/binary-6.2MB-brightgreen)](https://github.com/itsmylife44/mt6000-nas/releases)
[![Platform](https://img.shields.io/badge/platform-GL.iNet%20MT6000-orange)](https://www.gl-inet.com/products/gl-mt6000/)

A lightweight, self-hosted NAS dashboard for the **GL.iNet Flint 2 (MT6000)** router. Single Go binary with an embedded web UI. No Node.js, no Docker, no runtime dependencies. Designed to run comfortably within 1GB RAM on OpenWrt ARM64.

Dark theme inspired by Portainer and TrueNAS.

---

## Features

- 📁 **File Manager** — Upload, download, rename, delete, create folders. Drag-and-drop support with breadcrumb navigation.
- 🎬 **Media Streaming** — Watch MP4, WebM, MKV and listen to MP3, FLAC, OGG directly in the browser. HTTP Range requests for seeking without buffering the full file.
- 🔗 **Share Links** — Generate public download links with optional expiration dates and download limits. Recipients need no account.
- 🖧 **Samba/SMB Management** — Create, edit, and delete shares. Manage Samba users. Restart the service. Full `smb.conf` parser under the hood.
- 📊 **System Monitor** — Real-time CPU, RAM, disk usage, and network interface traffic stats.
- 💾 **Router Backup** — One-click OpenWrt config backup via `sysupgrade -b`, saved directly to USB storage.
- 📋 **Log Viewer** — System and Samba logs with color-coded severity, auto-refresh, and download.
- 👤 **User Management** — Admin login with bcrypt. Samba user CRUD from the dashboard.
- 🌐 **Remote Access** — Works with Tailscale, WireGuard, or any VPN. No port-forwarding required.
- 📦 **OpenWrt Package** — Installable via `opkg`. The installer auto-configures Samba, DNS (`nas.lan`), and an Nginx reverse proxy.

---

## Screenshots

> Screenshots coming soon. Once available, they'll be added here covering the file manager, media player, Samba management, and system monitor views.

---

## Quick Start

### Install on the router

```bash
# Cross-compile for ARM64
make build-arm64

# Build the .ipk package
make package

# Copy to router and install
scp openwrt/nas-dashboard_*.ipk root@192.168.8.1:/tmp/
ssh root@192.168.8.1 'opkg install /tmp/nas-dashboard_*.ipk'
```

Once installed, the dashboard is available at:

- `http://nas.lan` — local network (after DNS propagates)
- `http://192.168.8.1:8081` — direct router IP
- `http://<tailscale-ip>:8081` — remote access via VPN

**Default login:** `admin` with the password set during install (prompted by the installer). Change it immediately after first login.

---

## Development

**Prerequisites:** Go 1.24+

```bash
make dev          # Run locally on :8080 using config.dev.json
make build        # Build for current OS/arch
make build-arm64  # Cross-compile for router (linux/arm64)
make package      # Build .ipk installable package
make vet          # Run go vet ./...
make test         # Run go test ./...
```

The dev server uses `config.dev.json` and serves the embedded UI at `http://localhost:8080`.

---

## Project Structure

```
mt6000-nas/
├── cmd/
│   └── nas-server/       # Main entrypoint — parses flags, wires config, starts HTTP server
├── internal/
│   ├── api/              # Router — all HTTP routes registered here
│   ├── auth/             # Login/logout, bcrypt, session cookie management
│   ├── backup/           # sysupgrade backup creation, listing, download, delete
│   ├── config/           # Config struct, JSON loading, defaults
│   ├── files/            # File listing, upload, download, rename, mkdir, delete
│   ├── logs/             # System log and Samba log readers
│   ├── media/            # Video/audio streaming with Range support, thumbnails
│   ├── middleware/        # Auth middleware (session validation)
│   ├── samba/            # smb.conf parser, share CRUD, user management, service restart
│   ├── shares/           # Share link generation, public download, expiry/limit enforcement
│   └── system/           # CPU, RAM, disk, and network stats via /proc and syscalls
├── web/                  # Embedded frontend (HTML templates + static assets)
├── openwrt/              # .ipk build scripts, init.d service file, installer
├── scripts/              # Helper scripts (USB mount, UAS quirks)
├── config.dev.json       # Local dev config (do not use in production)
├── Makefile
└── go.mod
```

---

## API Reference

All endpoints under `/api/*` require a valid session cookie (set by `POST /api/auth/login`), except where noted.

### Auth

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Authenticate and set session cookie |
| `POST` | `/api/auth/logout` | Clear session |
| `GET` | `/api/auth/me` | Return current user info |

### Files

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/files` | List directory contents |
| `GET` | `/api/files/download` | Download a file |
| `POST` | `/api/files/upload` | Upload one or more files |
| `DELETE` | `/api/files` | Delete a file or directory |
| `PUT` | `/api/files/rename` | Rename or move a file |
| `POST` | `/api/files/mkdir` | Create a new directory |

### System

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/system/info` | CPU and RAM usage |
| `GET` | `/api/system/disk` | Disk usage for the storage mount |
| `GET` | `/api/system/network` | Network interfaces and traffic stats |

### Samba

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/samba/status` | Samba service status |
| `GET` | `/api/samba/shares` | List all SMB shares |
| `POST` | `/api/samba/shares` | Create a new share |
| `PUT` | `/api/samba/shares/{name}` | Update an existing share |
| `DELETE` | `/api/samba/shares/{name}` | Delete a share |
| `POST` | `/api/samba/restart` | Restart the Samba service |
| `GET` | `/api/samba/users` | List Samba users |
| `POST` | `/api/samba/users` | Create a Samba user |
| `DELETE` | `/api/samba/users/{name}` | Delete a Samba user |

### Shares (public links)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/files/share` | Generate a public share link |
| `GET` | `/api/shares` | List all active share links |
| `DELETE` | `/api/shares/{token}` | Revoke a share link |
| `GET` | `/s/{token}` | Public file download (no auth required) |
| `GET` | `/s/{token}/info` | Public file metadata (no auth required) |

### Media

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/files/preview` | Serve a file for in-browser preview |
| `GET` | `/api/files/stream` | Stream video/audio with HTTP Range support |
| `GET` | `/api/files/thumbnail` | Generate and serve a thumbnail |

### Backup

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/backup/create` | Trigger an OpenWrt config backup |
| `GET` | `/api/backup/list` | List available backups |
| `GET` | `/api/backup/download/{name}` | Download a backup archive |
| `DELETE` | `/api/backup/{name}` | Delete a backup |
| `GET` | `/api/backup/status` | Check if a backup is in progress |

### Logs

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/logs/system` | Fetch system log (logread) |
| `GET` | `/api/logs/samba` | Fetch Samba log |

---

## Configuration

The dashboard reads a JSON config file at startup (`-config` flag, defaults to `/etc/nas-dashboard/config.json` on the router).

```json
{
  "listen_addr": "0.0.0.0",
  "port": 8081,
  "storage_path": "/mnt/usb",
  "mount_device": "/dev/sda1",
  "mount_options": "defaults,noatime",
  "samba_config_path": "/etc/samba/smb.conf",
  "samba_enabled": true,
  "admin_user": "admin",
  "admin_password": "<bcrypt hash set by installer>",
  "session_secret": "<random 32-byte hex set by installer>",
  "log_file": "/var/log/nas-dashboard.log",
  "log_level": "info"
}
```

Key fields:

| Field | Description |
|-------|-------------|
| `storage_path` | Absolute path to the USB mount point |
| `mount_device` | Block device for the USB drive (e.g. `/dev/sda1`) |
| `samba_config_path` | Path to `smb.conf` — the dashboard reads and writes this directly |
| `admin_password` | bcrypt hash. Use the installer to set it, or `htpasswd -bnBC 10 "" password \| tr -d ':\n'` |
| `session_secret` | Random secret for HMAC-signed session cookies. Change this in production. |
| `log_level` | `debug`, `info`, `warn`, or `error` |

---

## Network Setup

The `.ipk` installer configures everything automatically:

- **DNS** — Adds a `dnsmasq` UCI entry pointing `nas.lan` to the router's LAN IP. Accessible from any device on the network without touching hosts files.
- **Nginx** — Creates a reverse proxy vhost for the `nas.lan` hostname, forwarding to `127.0.0.1:8081`. Port 80 traffic works without specifying a port.
- **Samba** — Enables Samba via UCI (`samba_enable`) and writes an initial `smb.conf` with the storage path pre-configured.
- **procd** — Registers a procd init.d service with automatic crash recovery. Starts on boot. Managed via `service nas-dashboard start|stop|restart`.

---

## Hardware Notes

Tested configuration:

- **Router:** GL.iNet Flint 2 (MT6000), firmware 4.8.3 (MediaTek MT7986A, ARM Cortex-A53 dual-core, 1GB RAM)
- **Storage:** Kingston SV300S37A 120GB SSD via USB 3.0
- **Adapter:** ASMedia ASM1153E USB-to-SATA bridge

**UAS quirk:** The ASM1153E requires UAS mode to be disabled. The installer handles this automatically by adding a kernel quirk via `/etc/modules.d/`. If you're setting up manually, add `options usb-storage quirks=174c:55aa:u` to the appropriate modules file.

**Filesystem:** ext4 is strongly recommended. exFAT works but has known reliability issues on OpenWrt (unclean unmounts, fsck not always available). NTFS is not supported.

Any USB storage works as long as it's formatted with a supported filesystem — SSD, spinning HDD, or a USB stick.

---

## License

MIT. See [LICENSE](LICENSE).
