#!/usr/bin/env bash
set -e

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Unstowing dotfiles from $DOTFILES_DIR..."
cd "$DOTFILES_DIR"

stow -D bash fish git

echo "Done."
