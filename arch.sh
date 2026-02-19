#!/usr/bin/env bash

if ! [ -x "$(command -v yay)" ]; then
    sudo pacman -S --needed git base-devel
    git clone https://aur.archlinux.org/yay.git /tmp/yay
    cd /tmp/yay
    makepkg -si
    cd -
    rm -rf /tmp/yay
fi

install() {
    local cmd=${2:-$1}
    if ! [ -x "$(command -v $cmd)" ]; then
        echo ""
        echo "Installing '$1'"
        yay -S $1 --noconfirm
    fi
}

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
