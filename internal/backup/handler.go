package backup

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/xspam/mt6000-nas/internal/config"
)

type Handler struct {
	cfg        *config.Config
	backupDir  string
}

type BackupEntry struct {
	Name      string    `json:"name"`
	Size      int64     `json:"size"`
	CreatedAt time.Time `json:"createdAt"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func NewHandler(cfg *config.Config) *Handler {
	backupDir := filepath.Join(cfg.StoragePath, "backups")
	return &Handler{
		cfg:       cfg,
		backupDir: backupDir,
	}
}

func (h *Handler) ensureBackupDir() error {
	return os.MkdirAll(h.backupDir, 0750)
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureBackupDir(); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create backup directory")
		return
	}

	tmpFile := "/tmp/backup.tar.gz"
	cmd := exec.Command("sysupgrade", "-b", tmpFile)
	if out, err := cmd.CombinedOutput(); err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("backup command failed: %s", strings.TrimSpace(string(out))))
		return
	}

	now := time.Now()
	name := fmt.Sprintf("backup-%s.tar.gz", now.Format("2006-01-02T15-04-05"))
	destPath := filepath.Join(h.backupDir, name)

	src, err := os.Open(tmpFile)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to open backup file")
		return
	}
	defer src.Close()

	dst, err := os.OpenFile(destPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0640)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create destination file")
		return
	}

	buf := make([]byte, 32*1024)
	for {
		n, readErr := src.Read(buf)
		if n > 0 {
			if _, writeErr := dst.Write(buf[:n]); writeErr != nil {
				dst.Close()
				writeError(w, http.StatusInternalServerError, "failed to write backup")
				return
			}
		}
		if readErr != nil {
			break
		}
	}
	dst.Close()
	_ = os.Remove(tmpFile)

	info, err := os.Stat(destPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to stat backup")
		return
	}

	writeJSON(w, http.StatusCreated, BackupEntry{
		Name:      name,
		Size:      info.Size(),
		CreatedAt: now,
	})
}

func (h *Handler) listBackupFiles() []BackupEntry {
	dir, err := os.Open(h.backupDir)
	if err != nil {
		return nil
	}
	defer dir.Close()

	var names []string
	for {
		batch, readErr := dir.Readdirnames(64)
		names = append(names, batch...)
		if readErr != nil {
			break
		}
	}

	result := make([]BackupEntry, 0, len(names))
	for _, name := range names {
		info, err := os.Lstat(filepath.Join(h.backupDir, name))
		if err != nil || info.IsDir() {
			continue
		}
		result = append(result, BackupEntry{
			Name:      name,
			Size:      info.Size(),
			CreatedAt: info.ModTime(),
		})
	}
	return result
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureBackupDir(); err != nil {
		writeJSON(w, http.StatusOK, []BackupEntry{})
		return
	}
	writeJSON(w, http.StatusOK, h.listBackupFiles())
}

func (h *Handler) Download(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]
	if strings.Contains(name, "/") || strings.Contains(name, "..") {
		writeError(w, http.StatusBadRequest, "invalid backup name")
		return
	}

	absPath := filepath.Join(h.backupDir, name)
	info, err := os.Stat(absPath)
	if err != nil {
		if os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, "backup not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to stat backup")
		return
	}

	f, err := os.Open(absPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to open backup")
		return
	}
	defer f.Close()

	w.Header().Set("Content-Disposition", "attachment; filename="+name)
	w.Header().Set("Content-Type", "application/gzip")
	http.ServeContent(w, r, name, info.ModTime(), f)
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]
	if strings.Contains(name, "/") || strings.Contains(name, "..") {
		writeError(w, http.StatusBadRequest, "invalid backup name")
		return
	}

	absPath := filepath.Join(h.backupDir, name)
	if _, err := os.Stat(absPath); os.IsNotExist(err) {
		writeError(w, http.StatusNotFound, "backup not found")
		return
	}

	if err := os.Remove(absPath); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete backup")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) Status(w http.ResponseWriter, r *http.Request) {
	_ = h.ensureBackupDir()
	entries := h.listBackupFiles()

	var totalSize int64
	var lastBackup *time.Time

	for _, e := range entries {
		totalSize += e.Size
		t := e.CreatedAt
		if lastBackup == nil || t.After(*lastBackup) {
			lastBackup = &t
		}
	}

	var lastBackupStr *string
	if lastBackup != nil {
		s := lastBackup.Format(time.RFC3339)
		lastBackupStr = &s
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"lastBackup":   lastBackupStr,
		"totalBackups": len(entries),
		"totalSize":    totalSize,
	})
}
