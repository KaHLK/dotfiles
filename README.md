# Dotfiles

Personal dotfiles managed with [GNU Stow](https://www.gnu.org/software/stow/). Supports macOS (via MacPorts) and Arch Linux (via yay/AUR).

## The `dot-` prefix convention

Stow is invoked with the `--dotfiles` flag, which translates any `dot-` prefix in file or directory names to a leading `.` when creating symlinks. This is why files in this repo don't have leading dots.

For example:
```
fish/dot-config/fish/config.fish  ->  ~/.config/fish/config.fish
git/dot-config/git/config         ->  ~/.config/git/config
claude/dot-claude/settings.json   ->  ~/.claude/settings.json
```

## Prerequisites

- [GNU Stow](https://www.gnu.org/software/stow/)
- **macOS**: Xcode Command Line Tools and [MacPorts](https://www.macports.org/install.php) (must be installed manually)
- **Arch Linux**: `base-devel` and `git` (yay is installed automatically by the install script)

## Installation

**Full install** — installs Rust, Bun, OS-level packages, and stows all dotfiles:

```sh
./install.sh
```

**Stow only** — just creates the symlinks (assumes dependencies are already installed):

```sh
./init.sh
```

The `packages` file controls which directories get stowed.

## Uninstalling

Remove all symlinks:

```sh
./uninit.sh
```

## Shell functions

Custom fish functions included in the `fish` package:

| Function | Description |
|----------|-------------|
| `wt`     | Select a git worktree with fzf and open it in a tmux window |
| `wtc`    | Create a git worktree (with interactive branch selection) and open it in tmux |
| `wtd`    | Select and delete a git worktree |
| `gtag`   | Create or replace a git tag and push it to origin |

## Adding a new package

1. Create a directory at the repo root named after the package (e.g. `foo/`)
2. Mirror the target home directory structure inside it, using `dot-` in place of leading dots
3. Add the directory name to the `packages` file
4. Run `./init.sh` or `stow --dotfiles foo` to create the symlinks

For example, to manage `~/.config/foo/config.toml`:

```
foo/
└── dot-config/
    └── foo/
        └── config.toml
```
