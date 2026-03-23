package media

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/itsmylife44/mt6000-nas/internal/config"
)

type Handler struct {
	cfg *config.Config
}

func NewHandler(cfg *config.Config) *Handler {
	return &Handler{cfg: cfg}
}

var mimeTypes = map[string]string{
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".png":  "image/png",
	".gif":  "image/gif",
	".webp": "image/webp",
	".svg":  "image/svg+xml",
	".bmp":  "image/bmp",
	".ico":  "image/x-icon",
	".mp4":  "video/mp4",
	".webm": "video/webm",
	".mkv":  "video/x-matroska",
	".avi":  "video/x-msvideo",
	".mov":  "video/quicktime",
	".mp3":  "audio/mpeg",
	".ogg":  "audio/ogg",
	".flac": "audio/flac",
	".wav":  "audio/wav",
	".aac":  "audio/aac",
	".m4a":  "audio/mp4",
	".pdf":  "application/pdf",
	".txt":  "text/plain; charset=utf-8",
	".md":   "text/markdown; charset=utf-8",
	".json": "application/json",
	".xml":  "application/xml",
	".csv":  "text/csv",
	".zip":  "application/zip",
	".tar":  "application/x-tar",
	".gz":   "application/gzip",
	".7z":   "application/x-7z-compressed",
	".rar":  "application/x-rar-compressed",
}

func mimeByExtension(ext string) string {
	if m, ok := mimeTypes[strings.ToLower(ext)]; ok {
		return m
	}
	return "application/octet-stream"
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write([]byte(`{"error":"` + msg + `"}`))
}

func (h *Handler) validatePath(rawPath string) (string, bool) {
	if rawPath == "" {
		return "", false
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

func (h *Handler) serveInline(w http.ResponseWriter, r *http.Request, streaming bool) {
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
		writeError(w, http.StatusBadRequest, "cannot preview a directory")
		return
	}

	f, err := os.Open(absPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to open file")
		return
	}
	defer f.Close()

	ext := strings.ToLower(filepath.Ext(absPath))
	mime := mimeByExtension(ext)

	w.Header().Set("Content-Type", mime)
	w.Header().Set("Content-Disposition", "inline; filename="+info.Name())

	if streaming {
		w.Header().Set("Accept-Ranges", "bytes")
	}

	http.ServeContent(w, r, info.Name(), info.ModTime(), f)
}

func (h *Handler) Preview(w http.ResponseWriter, r *http.Request) {
	h.serveInline(w, r, false)
}

func (h *Handler) Stream(w http.ResponseWriter, r *http.Request) {
	h.serveInline(w, r, true)
}

func (h *Handler) Thumbnail(w http.ResponseWriter, r *http.Request) {
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
		writeError(w, http.StatusBadRequest, "cannot thumbnail a directory")
		return
	}

	f, err := os.Open(absPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to open file")
		return
	}
	defer f.Close()

	ext := strings.ToLower(filepath.Ext(absPath))
	mime := mimeByExtension(ext)

	w.Header().Set("Content-Type", mime)
	w.Header().Set("Content-Disposition", "inline; filename="+info.Name())
	w.Header().Set("Cache-Control", "max-age=86400")

	http.ServeContent(w, r, info.Name(), info.ModTime(), f)
}
