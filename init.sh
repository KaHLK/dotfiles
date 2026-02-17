#!/usr/bin/env bash
set -e

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Stowing dotfiles from $DOTFILES_DIR..."
# stow uses the current directory as the stow dir by default,
# so we must cd here regardless of where the script was called from
cd "$DOTFILES_DIR"

stow bash fish git

echo "Done."
