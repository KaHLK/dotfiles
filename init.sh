#!/usr/bin/env bash
set -e

if ! [ -x "$(command -v stow)" ]; then
    echo "stow is not installed. Please install it and re-run."
    exit 1
fi

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Stowing dotfiles from $DOTFILES_DIR..."
# stow uses the current directory as the stow dir by default,
# so we must cd here regardless of where the script was called from
cd "$DOTFILES_DIR"

stow --dotfiles bash fish git scripts

echo "Done."
