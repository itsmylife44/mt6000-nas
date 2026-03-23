package logs

import (
	"encoding/json"
	"net/http"
	"os/exec"
	"runtime"
	"strings"
)

type logResponse struct {
	Lines []string `json:"lines"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func GetSystemLog(w http.ResponseWriter, r *http.Request) {
	if runtime.GOOS == "windows" {
		writeJSON(w, http.StatusOK, logResponse{Lines: []string{"[mock] system log on windows"}})
		return
	}

	out, err := exec.Command("logread", "-e", "").Output()
	if err != nil {
		out, err = exec.Command("logread").Output()
		if err != nil {
			writeJSON(w, http.StatusOK, logResponse{Lines: []string{"failed to read system log: " + err.Error()}})
			return
		}
	}

	lines := splitLogLines(string(out), 500)
	writeJSON(w, http.StatusOK, logResponse{Lines: lines})
}

func GetSambaLog(w http.ResponseWriter, r *http.Request) {
	if runtime.GOOS == "windows" {
		writeJSON(w, http.StatusOK, logResponse{Lines: []string{"[mock] samba log on windows"}})
		return
	}

	out, _ := exec.Command("logread").Output()
	allLines := strings.Split(strings.TrimSpace(string(out)), "\n")

	var sambaLines []string
	for _, line := range allLines {
		lower := strings.ToLower(line)
		if strings.Contains(lower, "smbd") || strings.Contains(lower, "samba") || strings.Contains(lower, "nmbd") {
			sambaLines = append(sambaLines, line)
		}
	}

	if len(sambaLines) > 500 {
		sambaLines = sambaLines[len(sambaLines)-500:]
	}

	if len(sambaLines) == 0 {
		sambaLines = []string{"No samba log entries found."}
	}

	writeJSON(w, http.StatusOK, logResponse{Lines: sambaLines})
}

func splitLogLines(raw string, maxLines int) []string {
	lines := strings.Split(strings.TrimSpace(raw), "\n")
	if len(lines) > maxLines {
		lines = lines[len(lines)-maxLines:]
	}
	result := make([]string, 0, len(lines))
	for _, l := range lines {
		if l != "" {
			result = append(result, l)
		}
	}
	return result
}
