package samba

import (
	"encoding/json"
	"net/http"
	"os/exec"
	"runtime"
	"strings"

	"github.com/gorilla/mux"
	"github.com/itsmylife44/mt6000-nas/internal/config"
)

type Handler struct {
	cfg *config.Config
}

func NewHandler(cfg *config.Config) *Handler {
	return &Handler{cfg: cfg}
}

type ServiceStatus struct {
	Running bool   `json:"running"`
	Status  string `json:"status"`
}

type ShareRequest struct {
	Name       string `json:"name"`
	Path       string `json:"path"`
	ReadOnly   bool   `json:"readOnly"`
	GuestOk    bool   `json:"guestOk"`
	ValidUsers string `json:"validUsers"`
}

type UserRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (h *Handler) GetStatus(w http.ResponseWriter, r *http.Request) {
	if runtime.GOOS == "windows" {
		writeJSON(w, http.StatusOK, ServiceStatus{Running: false, Status: "mock-windows"})
		return
	}

	out, _ := exec.Command("pgrep", "smbd").Output()
	running := len(strings.TrimSpace(string(out))) > 0
	status := "inactive"
	if running {
		status = "active"
	}
	writeJSON(w, http.StatusOK, ServiceStatus{Running: running, Status: status})
}

func (h *Handler) GetShares(w http.ResponseWriter, r *http.Request) {
	conf, err := ParseSmbConf(h.cfg.SambaConfigPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read samba config")
		return
	}
	writeJSON(w, http.StatusOK, conf.Shares)
}

func (h *Handler) CreateShare(w http.ResponseWriter, r *http.Request) {
	var req ShareRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" || req.Path == "" {
		writeError(w, http.StatusBadRequest, "name and path are required")
		return
	}

	conf, err := ParseSmbConf(h.cfg.SambaConfigPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read samba config")
		return
	}

	if _, existing := conf.FindShare(req.Name); existing != nil {
		writeError(w, http.StatusConflict, "share already exists")
		return
	}

	conf.Shares = append(conf.Shares, Share{
		Name:       req.Name,
		Path:       req.Path,
		ReadOnly:   req.ReadOnly,
		GuestOk:    req.GuestOk,
		ValidUsers: req.ValidUsers,
		Extra:      map[string]string{},
	})

	if err := conf.WriteTo(h.cfg.SambaConfigPath); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to write samba config")
		return
	}

	writeJSON(w, http.StatusCreated, conf.Shares[len(conf.Shares)-1])
}

func (h *Handler) UpdateShare(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]

	var req ShareRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	conf, err := ParseSmbConf(h.cfg.SambaConfigPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read samba config")
		return
	}

	idx, share := conf.FindShare(name)
	if share == nil {
		writeError(w, http.StatusNotFound, "share not found")
		return
	}

	if req.Path != "" {
		share.Path = req.Path
	}
	share.ReadOnly = req.ReadOnly
	share.GuestOk = req.GuestOk
	if req.ValidUsers != "" {
		share.ValidUsers = req.ValidUsers
	}
	conf.Shares[idx] = *share

	if err := conf.WriteTo(h.cfg.SambaConfigPath); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to write samba config")
		return
	}

	writeJSON(w, http.StatusOK, conf.Shares[idx])
}

func (h *Handler) DeleteShare(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]

	conf, err := ParseSmbConf(h.cfg.SambaConfigPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read samba config")
		return
	}

	if !conf.RemoveShare(name) {
		writeError(w, http.StatusNotFound, "share not found")
		return
	}

	if err := conf.WriteTo(h.cfg.SambaConfigPath); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to write samba config")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) RestartSamba(w http.ResponseWriter, r *http.Request) {
	if runtime.GOOS == "windows" {
		writeJSON(w, http.StatusOK, map[string]string{"status": "mock-restart"})
		return
	}

	if err := exec.Command("/etc/init.d/samba4", "restart").Run(); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to restart samba")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "restarted"})
}

func (h *Handler) GetUsers(w http.ResponseWriter, r *http.Request) {
	if runtime.GOOS == "windows" {
		writeJSON(w, http.StatusOK, []string{"admin"})
		return
	}

	out, err := exec.Command("pdbedit", "-L", "-w").Output()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list samba users")
		return
	}

	users := []string{}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, ":", 2)
		if len(parts) >= 1 && parts[0] != "" {
			users = append(users, parts[0])
		}
	}

	writeJSON(w, http.StatusOK, users)
}

func (h *Handler) CreateUser(w http.ResponseWriter, r *http.Request) {
	var req UserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Username == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "username and password are required")
		return
	}

	if runtime.GOOS == "windows" {
		writeJSON(w, http.StatusCreated, map[string]string{"username": req.Username})
		return
	}

	addUserCmd := exec.Command("adduser", "-D", "-H", "-s", "/sbin/nologin", req.Username)
	if err := addUserCmd.Run(); err != nil {
		if !strings.Contains(err.Error(), "in use") {
			writeError(w, http.StatusInternalServerError, "failed to create system user")
			return
		}
	}

	newPasswordTwice := req.Password + "\n" + req.Password + "\n"
	smbCmd := exec.Command("smbpasswd", "-a", "-s", req.Username)
	smbCmd.Stdin = strings.NewReader(newPasswordTwice)
	if err := smbCmd.Run(); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to set samba password")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{"username": req.Username})
}

func (h *Handler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]

	if runtime.GOOS == "windows" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if err := exec.Command("smbpasswd", "-x", name).Run(); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to remove samba user")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
