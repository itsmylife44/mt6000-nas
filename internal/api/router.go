package api

import (
	"io/fs"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
	"github.com/xspam/mt6000-nas/internal/auth"
	"github.com/xspam/mt6000-nas/internal/backup"
	"github.com/xspam/mt6000-nas/internal/config"
	"github.com/xspam/mt6000-nas/internal/files"
	"github.com/xspam/mt6000-nas/internal/logs"
	"github.com/xspam/mt6000-nas/internal/media"
	"github.com/xspam/mt6000-nas/internal/middleware"
	"github.com/xspam/mt6000-nas/internal/samba"
	"github.com/xspam/mt6000-nas/internal/shares"
	"github.com/xspam/mt6000-nas/internal/system"
	"github.com/xspam/mt6000-nas/web"
)

func NewRouter(cfg *config.Config) http.Handler {
	authHandler, err := auth.NewHandler(cfg)
	if err != nil {
		panic("failed to initialize auth handler: " + err.Error())
	}

	filesHandler := files.NewHandler(cfg)
	systemHandler := system.NewHandler(cfg)
	sambaHandler := samba.NewHandler(cfg)
	sharesHandler := shares.NewHandler(cfg)
	mediaHandler := media.NewHandler(cfg)
	backupHandler := backup.NewHandler(cfg)

	r := mux.NewRouter()

	r.Use(corsMiddleware)

	r.HandleFunc("/api/auth/login", authHandler.Login).Methods(http.MethodPost)
	r.HandleFunc("/api/auth/logout", authHandler.Logout).Methods(http.MethodPost)
	r.HandleFunc("/api/auth/me", authHandler.Me).Methods(http.MethodGet)

	protected := r.PathPrefix("/api").Subrouter()
	protected.Use(middleware.Auth(authHandler))

	protected.HandleFunc("/files", filesHandler.ListDirectory).Methods(http.MethodGet)
	protected.HandleFunc("/files/download", filesHandler.DownloadFile).Methods(http.MethodGet)
	protected.HandleFunc("/files/upload", filesHandler.UploadFile).Methods(http.MethodPost)
	protected.HandleFunc("/files", filesHandler.DeletePath).Methods(http.MethodDelete)
	protected.HandleFunc("/files/rename", filesHandler.RenameFile).Methods(http.MethodPut)
	protected.HandleFunc("/files/mkdir", filesHandler.MakeDirectory).Methods(http.MethodPost)

	protected.HandleFunc("/system/info", systemHandler.GetSystemInfo).Methods(http.MethodGet)
	protected.HandleFunc("/system/disk", systemHandler.GetDiskInfo).Methods(http.MethodGet)
	protected.HandleFunc("/system/network", systemHandler.GetNetworkInfo).Methods(http.MethodGet)

	protected.HandleFunc("/samba/status", sambaHandler.GetStatus).Methods(http.MethodGet)
	protected.HandleFunc("/samba/shares", sambaHandler.GetShares).Methods(http.MethodGet)
	protected.HandleFunc("/samba/shares", sambaHandler.CreateShare).Methods(http.MethodPost)
	protected.HandleFunc("/samba/shares/{name}", sambaHandler.UpdateShare).Methods(http.MethodPut)
	protected.HandleFunc("/samba/shares/{name}", sambaHandler.DeleteShare).Methods(http.MethodDelete)
	protected.HandleFunc("/samba/restart", sambaHandler.RestartSamba).Methods(http.MethodPost)
	protected.HandleFunc("/samba/users", sambaHandler.GetUsers).Methods(http.MethodGet)
	protected.HandleFunc("/samba/users", sambaHandler.CreateUser).Methods(http.MethodPost)
	protected.HandleFunc("/samba/users/{name}", sambaHandler.DeleteUser).Methods(http.MethodDelete)

	protected.HandleFunc("/logs/system", logs.GetSystemLog).Methods(http.MethodGet)
	protected.HandleFunc("/logs/samba", logs.GetSambaLog).Methods(http.MethodGet)

	protected.HandleFunc("/files/share", sharesHandler.CreateShare).Methods(http.MethodPost)
	protected.HandleFunc("/shares", sharesHandler.ListShares).Methods(http.MethodGet)
	protected.HandleFunc("/shares/{token}", sharesHandler.DeleteShare).Methods(http.MethodDelete)

	protected.HandleFunc("/files/preview", mediaHandler.Preview).Methods(http.MethodGet)
	protected.HandleFunc("/files/stream", mediaHandler.Stream).Methods(http.MethodGet)
	protected.HandleFunc("/files/thumbnail", mediaHandler.Thumbnail).Methods(http.MethodGet)

	protected.HandleFunc("/backup/create", backupHandler.Create).Methods(http.MethodPost)
	protected.HandleFunc("/backup/list", backupHandler.List).Methods(http.MethodGet)
	protected.HandleFunc("/backup/download/{name}", backupHandler.Download).Methods(http.MethodGet)
	protected.HandleFunc("/backup/{name}", backupHandler.Delete).Methods(http.MethodDelete)
	protected.HandleFunc("/backup/status", backupHandler.Status).Methods(http.MethodGet)

	r.HandleFunc("/s/{token}", sharesHandler.PublicDownload).Methods(http.MethodGet)
	r.HandleFunc("/s/{token}/info", sharesHandler.PublicInfo).Methods(http.MethodGet)

	staticFS, _ := fs.Sub(web.EmbeddedFiles, "static")
	r.PathPrefix("/static/").Handler(
		http.StripPrefix("/static/", http.FileServer(http.FS(staticFS))),
	)

	r.PathPrefix("/").HandlerFunc(serveSPA())

	return r
}

func serveSPA() http.HandlerFunc {
	indexHTML, _ := web.EmbeddedFiles.ReadFile("templates/index.html")
	return func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(indexHTML)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Cookie")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
