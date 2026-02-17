#!/usr/bin/env bash
set -e

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Stowing dotfiles from $DOTFILES_DIR..."
cd "$DOTFILES_DIR"

stow bash fish git

echo "Done."
