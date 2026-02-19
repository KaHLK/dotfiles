#!/usr/bin/env bash

set -e

xcode-select --install 2>/dev/null || true

# MacPorts must be installed manually from https://www.macports.org/install.php
if ! [ -x "$(command -v port)" ]; then
    echo "MacPorts is not installed. Download and install it from https://www.macports.org/install.php"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_CMD="sudo port install"
source "$SCRIPT_DIR/lib.sh"

sudo port selfupdate
sudo port upgrade outdated

if ! [ -x "$(command -v ghostty)" ]; then
    echo ""
    echo "Ghostty must be installed manually: https://ghostty.org/download"
fi

if ! [ -d "/Applications/Firefox Developer Edition.app" ]; then
    echo ""
    echo "Firefox Developer Edition must be installed manually: https://www.mozilla.org/firefox/developer/"
fi

install stow
install fish
install bat
install eza
install fd
install fzf
install dust
install jq
install lf
install neovim nvim
install scc
install scrcpy
install fnm
