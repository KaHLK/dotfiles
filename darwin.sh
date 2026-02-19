#!/usr/bin/env bash

set -e

xcode-select --install 2>/dev/null || true

# MacPorts must be installed manually from https://www.macports.org/install.php
if ! [ -x "$(command -v port)" ]; then
    echo "MacPorts is not installed. Download and install it from https://www.macports.org/install.php"
    exit 1
fi

install() {
    local cmd=${2:-$1}
    if ! [ -x "$(command -v $cmd)" ]; then
        echo ""
        echo "Installing '$1'"
        sudo port install $1
    fi
}

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
