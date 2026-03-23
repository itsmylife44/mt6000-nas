package auth

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/itsmylife44/mt6000-nas/internal/config"
	"golang.org/x/crypto/bcrypt"
)

const sessionDuration = 24 * time.Hour
const sessionCookieName = "nas_session"

type session struct {
	Username  string
	ExpiresAt time.Time
}

type Handler struct {
	cfg          *config.Config
	mu           sync.RWMutex
	sessions     map[string]*session
	passwordHash string
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type userInfo struct {
	Username string `json:"username"`
}

func NewHandler(cfg *config.Config) (*Handler, error) {
	h := &Handler{
		cfg:      cfg,
		sessions: map[string]*session{},
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(cfg.AdminPassword), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	h.passwordHash = string(hash)

	go h.cleanExpiredSessions()
	return h, nil
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Username != h.cfg.AdminUser {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(h.passwordHash), []byte(req.Password)); err != nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	token, err := generateToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	h.mu.Lock()
	h.sessions[token] = &session{
		Username:  req.Username,
		ExpiresAt: time.Now().Add(sessionDuration),
	}
	h.mu.Unlock()

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(sessionDuration.Seconds()),
	})

	writeJSON(w, http.StatusOK, userInfo{Username: req.Username})
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(sessionCookieName)
	if err == nil {
		h.mu.Lock()
		delete(h.sessions, cookie.Value)
		h.mu.Unlock()
	}

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	username, valid := h.ValidateSession(cookie.Value)
	if !valid {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	writeJSON(w, http.StatusOK, userInfo{Username: username})
}

func (h *Handler) ValidateSession(token string) (string, bool) {
	h.mu.RLock()
	sess, exists := h.sessions[token]
	h.mu.RUnlock()

	if !exists {
		return "", false
	}
	if time.Now().After(sess.ExpiresAt) {
		h.mu.Lock()
		delete(h.sessions, token)
		h.mu.Unlock()
		return "", false
	}
	return sess.Username, true
}

func (h *Handler) cleanExpiredSessions() {
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		h.mu.Lock()
		for token, sess := range h.sessions {
			if now.After(sess.ExpiresAt) {
				delete(h.sessions, token)
			}
		}
		h.mu.Unlock()
	}
}

func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
