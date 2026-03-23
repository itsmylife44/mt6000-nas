package shares

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/xspam/mt6000-nas/internal/auth"
	"github.com/xspam/mt6000-nas/internal/config"
)

type ShareLink struct {
	Token        string    `json:"token"`
	FilePath     string    `json:"filePath"`
	FileName     string    `json:"fileName"`
	CreatedAt    time.Time `json:"createdAt"`
	ExpiresAt    time.Time `json:"expiresAt"`
	Downloads    int       `json:"downloads"`
	MaxDownloads int       `json:"maxDownloads"`
	CreatedBy    string    `json:"createdBy"`
}

type Handler struct {
	cfg      *config.Config
	mu       sync.RWMutex
	shares   map[string]*ShareLink
	filePath string
}

type createShareRequest struct {
	Path         string `json:"path"`
	ExpiresIn    int    `json:"expiresIn"`
	MaxDownloads int    `json:"maxDownloads"`
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
	h := &Handler{
		cfg:      cfg,
		shares:   make(map[string]*ShareLink),
		filePath: cfg.SharesFilePath,
	}
	h.load()
	return h
}

func (h *Handler) load() {
	data, err := os.ReadFile(h.filePath)
	if err != nil {
		return
	}
	var list []*ShareLink
	if err := json.Unmarshal(data, &list); err != nil {
		return
	}
	for _, s := range list {
		h.shares[s.Token] = s
	}
}

func (h *Handler) save() {
	list := make([]*ShareLink, 0, len(h.shares))
	for _, s := range h.shares {
		list = append(list, s)
	}
	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return
	}
	dir := filepath.Dir(h.filePath)
	_ = os.MkdirAll(dir, 0750)
	_ = os.WriteFile(h.filePath, data, 0640)
}

func generateToken() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
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

func (h *Handler) CreateShare(w http.ResponseWriter, r *http.Request) {
	var req createShareRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	absPath, ok := h.validatePath(req.Path)
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
		writeError(w, http.StatusBadRequest, "cannot share a directory")
		return
	}

	token, err := generateToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	username, _ := auth.UsernameFromContext(r.Context())

	now := time.Now()
	share := &ShareLink{
		Token:        token,
		FilePath:     absPath,
		FileName:     info.Name(),
		CreatedAt:    now,
		Downloads:    0,
		MaxDownloads: req.MaxDownloads,
		CreatedBy:    username,
	}

	if req.ExpiresIn > 0 {
		share.ExpiresAt = now.Add(time.Duration(req.ExpiresIn) * time.Second)
	}

	h.mu.Lock()
	h.shares[token] = share
	h.save()
	h.mu.Unlock()

	host := r.Host
	url := fmt.Sprintf("http://%s/s/%s", host, token)

	var expiresAt *string
	if !share.ExpiresAt.IsZero() {
		s := share.ExpiresAt.Format(time.RFC3339)
		expiresAt = &s
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"token":     token,
		"url":       url,
		"expiresAt": expiresAt,
		"fileName":  share.FileName,
	})
}

func (h *Handler) ListShares(w http.ResponseWriter, r *http.Request) {
	h.mu.RLock()
	list := make([]*ShareLink, 0, len(h.shares))
	for _, s := range h.shares {
		list = append(list, s)
	}
	h.mu.RUnlock()
	writeJSON(w, http.StatusOK, list)
}

func (h *Handler) DeleteShare(w http.ResponseWriter, r *http.Request) {
	token := mux.Vars(r)["token"]
	h.mu.Lock()
	_, exists := h.shares[token]
	if !exists {
		h.mu.Unlock()
		writeError(w, http.StatusNotFound, "share not found")
		return
	}
	delete(h.shares, token)
	h.save()
	h.mu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) PublicDownload(w http.ResponseWriter, r *http.Request) {
	token := mux.Vars(r)["token"]

	h.mu.Lock()
	share, exists := h.shares[token]
	if !exists {
		h.mu.Unlock()
		writeError(w, http.StatusNotFound, "share not found")
		return
	}

	now := time.Now()
	if !share.ExpiresAt.IsZero() && now.After(share.ExpiresAt) {
		delete(h.shares, token)
		h.save()
		h.mu.Unlock()
		writeError(w, http.StatusGone, "share link has expired")
		return
	}

	if share.MaxDownloads > 0 && share.Downloads >= share.MaxDownloads {
		h.mu.Unlock()
		writeError(w, http.StatusGone, "download limit reached")
		return
	}

	share.Downloads++
	h.save()
	absPath := share.FilePath
	fileName := share.FileName
	h.mu.Unlock()

	f, err := os.Open(absPath)
	if err != nil {
		if os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, "file not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to open file")
		return
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to stat file")
		return
	}

	w.Header().Set("Content-Disposition", "attachment; filename="+fileName)
	w.Header().Set("Content-Type", "application/octet-stream")
	http.ServeContent(w, r, fileName, info.ModTime(), f)
}

func (h *Handler) PublicInfo(w http.ResponseWriter, r *http.Request) {
	token := mux.Vars(r)["token"]

	h.mu.RLock()
	share, exists := h.shares[token]
	if !exists {
		h.mu.RUnlock()
		writeError(w, http.StatusNotFound, "share not found")
		return
	}

	if !share.ExpiresAt.IsZero() && time.Now().After(share.ExpiresAt) {
		h.mu.RUnlock()
		writeError(w, http.StatusGone, "share link has expired")
		return
	}

	absPath := share.FilePath
	fileName := share.FileName
	h.mu.RUnlock()

	info, err := os.Stat(absPath)
	if err != nil {
		if os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, "file not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to stat file")
		return
	}

	ext := strings.ToLower(filepath.Ext(fileName))
	mimeType := mimeByExtension(ext)

	writeJSON(w, http.StatusOK, map[string]any{
		"fileName": fileName,
		"fileSize": info.Size(),
		"mimeType": mimeType,
	})
}

func mimeByExtension(ext string) string {
	mimes := map[string]string{
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
		".txt":  "text/plain",
		".md":   "text/markdown",
		".json": "application/json",
		".xml":  "application/xml",
		".csv":  "text/csv",
		".zip":  "application/zip",
		".tar":  "application/x-tar",
		".gz":   "application/gzip",
		".7z":   "application/x-7z-compressed",
		".rar":  "application/x-rar-compressed",
	}
	if m, ok := mimes[ext]; ok {
		return m
	}
	return "application/octet-stream"
}
