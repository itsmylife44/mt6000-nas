package samba

import (
	"bufio"
	"bytes"
	"os"
	"strings"
)

type GlobalConfig struct {
	Workgroup   string
	ServerString string
	Extra       map[string]string
}

type Share struct {
	Name       string            `json:"name"`
	Path       string            `json:"path"`
	ReadOnly   bool              `json:"read_only"`
	GuestOk    bool              `json:"guest_ok"`
	ValidUsers string            `json:"valid_users"`
	Extra      map[string]string `json:"extra"`
}

type SmbConf struct {
	Global GlobalConfig
	Shares []Share
}

func ParseSmbConf(path string) (*SmbConf, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return parseSmbConfBytes(data), nil
}

func parseSmbConfBytes(data []byte) *SmbConf {
	conf := &SmbConf{
		Global: GlobalConfig{Extra: map[string]string{}},
	}

	var currentSection string
	var currentShare *Share

	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, ";") {
			continue
		}

		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			if currentShare != nil {
				conf.Shares = append(conf.Shares, *currentShare)
				currentShare = nil
			}

			currentSection = line[1 : len(line)-1]

			if currentSection != "global" {
				currentShare = &Share{
					Name:  currentSection,
					Extra: map[string]string{},
				}
			}
			continue
		}

		eqIdx := strings.Index(line, "=")
		if eqIdx < 0 {
			continue
		}
		key := strings.TrimSpace(line[:eqIdx])
		val := strings.TrimSpace(line[eqIdx+1:])

		if currentSection == "global" || currentSection == "" {
			switch strings.ToLower(key) {
			case "workgroup":
				conf.Global.Workgroup = val
			case "server string":
				conf.Global.ServerString = val
			default:
				conf.Global.Extra[key] = val
			}
		} else if currentShare != nil {
			switch strings.ToLower(key) {
			case "path":
				currentShare.Path = val
			case "read only":
				currentShare.ReadOnly = strings.ToLower(val) == "yes"
			case "guest ok":
				currentShare.GuestOk = strings.ToLower(val) == "yes"
			case "valid users":
				currentShare.ValidUsers = val
			default:
				currentShare.Extra[key] = val
			}
		}
	}

	if currentShare != nil {
		conf.Shares = append(conf.Shares, *currentShare)
	}

	return conf
}

func (conf *SmbConf) WriteTo(path string) error {
	var buf bytes.Buffer

	buf.WriteString("[global]\n")
	if conf.Global.Workgroup != "" {
		buf.WriteString("   workgroup = " + conf.Global.Workgroup + "\n")
	}
	if conf.Global.ServerString != "" {
		buf.WriteString("   server string = " + conf.Global.ServerString + "\n")
	}
	for k, v := range conf.Global.Extra {
		buf.WriteString("   " + k + " = " + v + "\n")
	}
	buf.WriteString("\n")

	for _, share := range conf.Shares {
		buf.WriteString("[" + share.Name + "]\n")
		if share.Path != "" {
			buf.WriteString("   path = " + share.Path + "\n")
		}
		if share.ReadOnly {
			buf.WriteString("   read only = yes\n")
		} else {
			buf.WriteString("   read only = no\n")
		}
		if share.GuestOk {
			buf.WriteString("   guest ok = yes\n")
		} else {
			buf.WriteString("   guest ok = no\n")
		}
		if share.ValidUsers != "" {
			buf.WriteString("   valid users = " + share.ValidUsers + "\n")
		}
		for k, v := range share.Extra {
			buf.WriteString("   " + k + " = " + v + "\n")
		}
		buf.WriteString("\n")
	}

	return os.WriteFile(path, buf.Bytes(), 0640)
}

func (conf *SmbConf) FindShare(name string) (int, *Share) {
	for i := range conf.Shares {
		if conf.Shares[i].Name == name {
			return i, &conf.Shares[i]
		}
	}
	return -1, nil
}

func (conf *SmbConf) RemoveShare(name string) bool {
	idx, _ := conf.FindShare(name)
	if idx < 0 {
		return false
	}
	conf.Shares = append(conf.Shares[:idx], conf.Shares[idx+1:]...)
	return true
}
