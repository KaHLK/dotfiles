#!/usr/bin/env bash

set -e

if ! [ -x "$(command -v yay)" ]; then
    sudo pacman -S --needed git base-devel
    git clone https://aur.archlinux.org/yay.git /tmp/yay
    cd /tmp/yay
    makepkg -si --noconfirm
    cd -
    rm -rf /tmp/yay
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_CMD="yay -S --noconfirm"
source "$SCRIPT_DIR/lib.sh"

yay

install stow
install fish
install ghostty
install firefox-developer-edition
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
install zed zeditor

# install rustup
install fnm
