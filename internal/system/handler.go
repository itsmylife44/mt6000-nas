package system

import (
	"bufio"
	"encoding/json"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/itsmylife44/mt6000-nas/internal/config"
)

type Handler struct {
	cfg *config.Config
}

func NewHandler(cfg *config.Config) *Handler {
	return &Handler{cfg: cfg}
}

type SystemInfo struct {
	Hostname      string  `json:"hostname"`
	KernelVersion string  `json:"kernelVersion"`
	Uptime        float64 `json:"uptimeSeconds"`
	CPUUsagePercent float64 `json:"cpuUsagePercent"`
	MemTotal      uint64  `json:"memTotalBytes"`
	MemUsed       uint64  `json:"memUsedBytes"`
	MemFree       uint64  `json:"memFreeBytes"`
}

type DiskInfo struct {
	Path           string  `json:"path"`
	TotalBytes     uint64  `json:"totalBytes"`
	UsedBytes      uint64  `json:"usedBytes"`
	FreeBytes      uint64  `json:"freeBytes"`
	UsedPercent    float64 `json:"usedPercent"`
	FilesystemType string  `json:"filesystemType"`
}

type NetworkInterface struct {
	Name     string `json:"name"`
	IPAddrs  []string `json:"ipAddrs"`
	MACAddr  string `json:"macAddr"`
	RXBytes  uint64 `json:"rxBytes"`
	TXBytes  uint64 `json:"txBytes"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (h *Handler) GetSystemInfo(w http.ResponseWriter, r *http.Request) {
	if runtime.GOOS == "windows" {
		writeJSON(w, http.StatusOK, SystemInfo{
			Hostname:        "nas-dev",
			KernelVersion:   "windows-mock",
			Uptime:          3600,
			CPUUsagePercent: 5.0,
			MemTotal:        8 * 1024 * 1024 * 1024,
			MemUsed:         2 * 1024 * 1024 * 1024,
			MemFree:         6 * 1024 * 1024 * 1024,
		})
		return
	}

	info, err := buildSystemInfo()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read system info")
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (h *Handler) GetDiskInfo(w http.ResponseWriter, r *http.Request) {
	if runtime.GOOS == "windows" {
		writeJSON(w, http.StatusOK, DiskInfo{
			Path:           h.cfg.StoragePath,
			TotalBytes:     500 * 1024 * 1024 * 1024,
			UsedBytes:      100 * 1024 * 1024 * 1024,
			FreeBytes:      400 * 1024 * 1024 * 1024,
			UsedPercent:    20.0,
			FilesystemType: "mock",
		})
		return
	}

	disk, err := buildDiskInfo(h.cfg.StoragePath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read disk info")
		return
	}
	writeJSON(w, http.StatusOK, disk)
}

func (h *Handler) GetNetworkInfo(w http.ResponseWriter, r *http.Request) {
	if runtime.GOOS == "windows" {
		writeJSON(w, http.StatusOK, []NetworkInterface{
			{Name: "eth0", IPAddrs: []string{"192.168.1.1/24"}, MACAddr: "00:00:00:00:00:00", RXBytes: 1024, TXBytes: 512},
		})
		return
	}

	ifaces, err := buildNetworkInfo()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read network info")
		return
	}
	writeJSON(w, http.StatusOK, ifaces)
}

func buildSystemInfo() (*SystemInfo, error) {
	hostname, _ := os.Hostname()

	uptimeBytes, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return nil, err
	}
	uptimeParts := strings.Fields(string(uptimeBytes))
	uptimeSecs, _ := strconv.ParseFloat(uptimeParts[0], 64)

	kernelVersion := readKernelVersion()
	cpuUsage := readCPUUsage()
	memTotal, memUsed, memFree := readMemInfo()

	return &SystemInfo{
		Hostname:        hostname,
		KernelVersion:   kernelVersion,
		Uptime:          uptimeSecs,
		CPUUsagePercent: cpuUsage,
		MemTotal:        memTotal,
		MemUsed:         memUsed,
		MemFree:         memFree,
	}, nil
}

func readKernelVersion() string {
	out, err := exec.Command("uname", "-r").Output()
	if err != nil {
		return "unknown"
	}
	return strings.TrimSpace(string(out))
}

// readCPUUsage takes two /proc/stat samples 200ms apart to compute CPU usage percentage.
func readCPUUsage() float64 {
	sample1 := readCPUStat()
	time.Sleep(200 * time.Millisecond)
	sample2 := readCPUStat()

	total1 := sample1[0] + sample1[1] + sample1[2] + sample1[3] + sample1[4] + sample1[5] + sample1[6]
	total2 := sample2[0] + sample2[1] + sample2[2] + sample2[3] + sample2[4] + sample2[5] + sample2[6]
	idle1 := sample1[3]
	idle2 := sample2[3]

	totalDiff := total2 - total1
	idleDiff := idle2 - idle1
	if totalDiff == 0 {
		return 0
	}
	return float64(totalDiff-idleDiff) / float64(totalDiff) * 100
}

func readCPUStat() [7]uint64 {
	f, err := os.Open("/proc/stat")
	if err != nil {
		return [7]uint64{}
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "cpu ") {
			fields := strings.Fields(line)
			var vals [7]uint64
			for i := 1; i <= 7 && i < len(fields); i++ {
				vals[i-1], _ = strconv.ParseUint(fields[i], 10, 64)
			}
			return vals
		}
	}
	return [7]uint64{}
}

func readMemInfo() (total, used, free uint64) {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return
	}
	defer f.Close()

	memValues := map[string]uint64{}
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		parts := strings.Fields(scanner.Text())
		if len(parts) >= 2 {
			key := strings.TrimSuffix(parts[0], ":")
			val, _ := strconv.ParseUint(parts[1], 10, 64)
			memValues[key] = val * 1024
		}
	}

	total = memValues["MemTotal"]
	free = memValues["MemAvailable"]
	used = total - free
	return
}

func buildDiskInfo(storagePath string) (*DiskInfo, error) {
	out, err := exec.Command("df", "-k", storagePath).Output()
	if err != nil {
		return nil, err
	}

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) < 2 {
		return nil, nil
	}

	fields := strings.Fields(lines[len(lines)-1])
	if len(fields) < 5 {
		return nil, nil
	}

	totalKB, _ := strconv.ParseUint(fields[1], 10, 64)
	usedKB, _ := strconv.ParseUint(fields[2], 10, 64)
	freeKB, _ := strconv.ParseUint(fields[3], 10, 64)
	percentStr := strings.TrimSuffix(fields[4], "%")
	percent, _ := strconv.ParseFloat(percentStr, 64)

	fsType := readFilesystemType(storagePath)

	return &DiskInfo{
		Path:           storagePath,
		TotalBytes:     totalKB * 1024,
		UsedBytes:      usedKB * 1024,
		FreeBytes:      freeKB * 1024,
		UsedPercent:    percent,
		FilesystemType: fsType,
	}, nil
}

func readFilesystemType(path string) string {
	out, err := exec.Command("mount").Output()
	if err != nil {
		return "unknown"
	}
	for _, line := range strings.Split(string(out), "\n") {
		if strings.Contains(line, path) || strings.Contains(line, " on "+path+" ") {
			parts := strings.Fields(line)
			for i, p := range parts {
				if p == "type" && i+1 < len(parts) {
					return parts[i+1]
				}
			}
		}
	}
	return "unknown"
}

func buildNetworkInfo() ([]NetworkInterface, error) {
	netIfaces, err := net.Interfaces()
	if err != nil {
		return nil, err
	}

	rxTxMap := readNetDev()

	result := make([]NetworkInterface, 0, len(netIfaces))
	for _, iface := range netIfaces {
		addrs, _ := iface.Addrs()
		ipStrs := make([]string, 0, len(addrs))
		for _, a := range addrs {
			ipStrs = append(ipStrs, a.String())
		}

		stats := rxTxMap[iface.Name]
		result = append(result, NetworkInterface{
			Name:    iface.Name,
			IPAddrs: ipStrs,
			MACAddr: iface.HardwareAddr.String(),
			RXBytes: stats[0],
			TXBytes: stats[1],
		})
	}
	return result, nil
}

func readNetDev() map[string][2]uint64 {
	result := map[string][2]uint64{}

	f, err := os.Open("/proc/net/dev")
	if err != nil {
		return result
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	lineNum := 0
	for scanner.Scan() {
		lineNum++
		if lineNum <= 2 {
			continue
		}
		line := scanner.Text()
		colonIdx := strings.Index(line, ":")
		if colonIdx < 0 {
			continue
		}
		name := strings.TrimSpace(line[:colonIdx])
		fields := strings.Fields(line[colonIdx+1:])
		if len(fields) < 9 {
			continue
		}
		rx, _ := strconv.ParseUint(fields[0], 10, 64)
		tx, _ := strconv.ParseUint(fields[8], 10, 64)
		result[name] = [2]uint64{rx, tx}
	}
	return result
}
