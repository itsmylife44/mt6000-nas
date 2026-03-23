package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type Config struct {
	// Server settings
	ListenAddr string `json:"listen_addr"`
	Port       int    `json:"port"`

	// Storage settings
	StoragePath  string `json:"storage_path"`
	MountDevice  string `json:"mount_device"`
	MountOptions string `json:"mount_options"`

	// Samba settings
	SambaConfigPath string `json:"samba_config_path"`
	SambaEnabled    bool   `json:"samba_enabled"`

	// Auth settings
	AdminUser     string `json:"admin_user"`
	AdminPassword string `json:"admin_password"`
	SessionSecret string `json:"session_secret"`

	// Shares
	SharesFilePath string `json:"shares_file_path"`

	// Logging
	LogFile  string `json:"log_file"`
	LogLevel string `json:"log_level"`
}

func DefaultConfig() *Config {
	return &Config{
		ListenAddr:      "0.0.0.0",
		Port:            8081,
		StoragePath:     "/mnt/ssd",
		MountDevice:     "/dev/sda1",
		MountOptions:    "noatime,errors=remount-ro",
		SambaConfigPath: "/etc/samba/smb.conf",
		SambaEnabled:    true,
		AdminUser:       "admin",
		AdminPassword:   "admin", // MUST be changed on first login
		SessionSecret:   "",
		SharesFilePath:  "/etc/nas-dashboard/shares.json",
		LogFile:         "/var/log/nas-dashboard.log",
		LogLevel:        "info",
	}
}

func Load(path string) (*Config, error) {
	cfg := DefaultConfig()

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			if saveErr := cfg.Save(path); saveErr != nil {
				return nil, saveErr
			}
			return cfg, nil
		}
		return nil, err
	}

	if err := json.Unmarshal(data, cfg); err != nil {
		return nil, err
	}

	return cfg, nil
}

func (c *Config) Save(path string) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0750); err != nil {
		return err
	}

	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0640)
}
