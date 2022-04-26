#!/bin/bash

if ! [ -x "$(command -v yay)" ]; then
    sudo pacman -S --needed git base-devel
    git clone https://aur.archlinux.org/yay.git
    cd yay
    makepkg -si
    cd ..
    rm -rf yay
fi

yay

install() {
    if ! [ -x "$(command -v $1)" ]; then
        echo ""
        echo "Installing '$1'"
        yay -S $1
    fi
}

install fish
install alacritty
install nitrogen
install rofi
install firefox-developer-edition
install polybar
install jq
install bat
install exa
install fd
install dust
install tokei
install scrcpy

install yarn
install rustup

if ! [ -x "$(command -v code)" ]; then
    echo ""
    echo "Installing 'vscode'"
    yay -S visual-studio-code-bin
fi
