BINARY=nas-dashboard
VERSION=0.1.0
BUILD_DIR=build

.PHONY: all build build-arm64 package clean dev vet test

all: build

build:
	go build -ldflags="-s -w" -o $(BUILD_DIR)/$(BINARY) ./cmd/nas-server

build-arm64:
	GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o $(BUILD_DIR)/$(BINARY)-arm64 ./cmd/nas-server

package: build-arm64
	cd openwrt && bash build-ipk.sh $(VERSION)

dev:
	go run ./cmd/nas-server -config config.dev.json -port 8080

clean:
	rm -rf $(BUILD_DIR)
	rm -f openwrt/*.ipk

vet:
	go vet ./...

test:
	go test ./...
