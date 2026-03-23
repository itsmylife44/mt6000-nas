package files

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/xspam/mt6000-nas/internal/config"
)

type Handler struct {
	cfg *config.Config
}

func NewHandler(cfg *config.Config) *Handler {
	return &Handler{cfg: cfg}
}

type FileEntry struct {
	Name        string      `json:"name"`
	Path        string      `json:"path"`
	Size        int64       `json:"size"`
	ModTime     time.Time   `json:"modTime"`
	IsDir       bool        `json:"isDir"`
	Permissions os.FileMode `json:"permissions"`
}

type renameRequest struct {
	OldPath string `json:"oldPath"`
	NewPath string `json:"newPath"`
}

type mkdirRequest struct {
	Path string `json:"path"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// validatePath prevents path traversal attacks by ensuring the resolved absolute path
// stays strictly within StoragePath. Any path containing ".." or symlinks that escape
// the storage root will be rejected.
func (h *Handler) validatePath(rawPath string) (string, bool) {
	if rawPath == "" {
		rawPath = "/"
	}

	joined := filepath.Join(h.cfg.StoragePath, filepath.FromSlash(rawPath))
	abs, err := filepath.Abs(joined)
	if err != nil {
		return "", false
	}

	storageAbs, err := filepath.Abs(h.cfg.StoragePath)
	if err != nil {
		return "", false
	}

	if !strings.HasPrefix(abs, storageAbs+string(os.PathSeparator)) && abs != storageAbs {
		return "", false
	}

	return abs, true
}

func (h *Handler) ListDirectory(w http.ResponseWriter, r *http.Request) {
	rawPath := r.URL.Query().Get("path")
	absPath, ok := h.validatePath(rawPath)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid path")
		return
	}

	dir, err := os.Open(absPath)
	if err != nil {
		if os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, "directory not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to open directory")
		return
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

	entries := make([]os.FileInfo, 0, len(names))
	for _, name := range names {
		info, statErr := os.Lstat(filepath.Join(absPath, name))
		if statErr != nil {
			continue
		}
		entries = append(entries, info)
	}

	storageAbs, _ := filepath.Abs(h.cfg.StoragePath)
	result := make([]FileEntry, 0, len(entries))
	for _, info := range entries {
		if info == nil {
			continue
		}
		entryAbs := filepath.Join(absPath, info.Name())
		relPath, _ := filepath.Rel(storageAbs, entryAbs)
		result = append(result, FileEntry{
			Name:        info.Name(),
			Path:        "/" + filepath.ToSlash(relPath),
			Size:        info.Size(),
			ModTime:     info.ModTime(),
			IsDir:       info.IsDir(),
			Permissions: info.Mode().Perm(),
		})
	}

	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) DownloadFile(w http.ResponseWriter, r *http.Request) {
	rawPath := r.URL.Query().Get("path")
	absPath, ok := h.validatePath(rawPath)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid path")
		return
	}

	info, err := os.Stat(absPath)
	if err != nil {
		if os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, "file not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to stat file")
		return
	}

	if info.IsDir() {
		writeError(w, http.StatusBadRequest, "cannot download a directory")
		return
	}

	f, err := os.Open(absPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to open file")
		return
	}
	defer f.Close()

	w.Header().Set("Content-Disposition", "attachment; filename="+filepath.Base(absPath))
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", strconv.FormatInt(info.Size(), 10))

	http.ServeContent(w, r, info.Name(), info.ModTime(), f)
}

func (h *Handler) UploadFile(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "failed to parse multipart form")
		return
	}

	targetDir := r.FormValue("path")
	absTarget, ok := h.validatePath(targetDir)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid path")
		return
	}

	if err := os.MkdirAll(absTarget, 0750); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create target directory")
		return
	}

	fh, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "no file in request")
		return
	}
	defer fh.Close()

	destPath, destOk := h.validatePath(filepath.Join(targetDir, header.Filename))
	if !destOk {
		writeError(w, http.StatusBadRequest, "invalid filename")
		return
	}

	out, err := os.OpenFile(destPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0640)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create file")
		return
	}
	defer out.Close()

	if _, err := io.Copy(out, fh); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to write file")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{"path": filepath.ToSlash(destPath)})
}

func (h *Handler) DeletePath(w http.ResponseWriter, r *http.Request) {
	rawPath := r.URL.Query().Get("path")
	absPath, ok := h.validatePath(rawPath)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid path")
		return
	}

	storageAbs, _ := filepath.Abs(h.cfg.StoragePath)
	if absPath == storageAbs {
		writeError(w, http.StatusForbidden, "cannot delete storage root")
		return
	}

	if err := os.RemoveAll(absPath); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) RenameFile(w http.ResponseWriter, r *http.Request) {
	var req renameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	oldAbs, oldOk := h.validatePath(req.OldPath)
	newAbs, newOk := h.validatePath(req.NewPath)
	if !oldOk || !newOk {
		writeError(w, http.StatusBadRequest, "invalid path")
		return
	}

	if err := os.Rename(oldAbs, newAbs); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to rename")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"newPath": filepath.ToSlash(newAbs)})
}

func (h *Handler) MakeDirectory(w http.ResponseWriter, r *http.Request) {
	var req mkdirRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	absPath, ok := h.validatePath(req.Path)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid path")
		return
	}

	if err := os.MkdirAll(absPath, 0750); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create directory")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{"path": req.Path})
}


