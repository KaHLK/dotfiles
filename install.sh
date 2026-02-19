#!/usr/bin/env bash

set -e

# Install Rust
if ! [ -x "$(command -v rustup)" ]; then
    echo ""
    echo "Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
fi

# Install Bun
if ! [ -x "$(command -v bun)" ]; then
    echo ""
    echo "Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
fi

# Run OS-specific install script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OS="$(uname -s)"

case "$OS" in
    Darwin)
        bash "$SCRIPT_DIR/darwin.sh"
        ;;
    Linux)
        if [ -f /etc/os-release ] && grep -qi 'arch\|manjaro\|endeavour' /etc/os-release; then
            bash "$SCRIPT_DIR/arch.sh"
        else
            echo "Unsupported Linux distribution."
            exit 1
        fi
        ;;
    *)
        echo "Unsupported OS: $OS"
        exit 1
        ;;
esac

bash "$SCRIPT_DIR/init.sh"
