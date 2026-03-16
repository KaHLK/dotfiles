function wtd --description "Delete a git worktree and its directory"
    if not git rev-parse --is-inside-work-tree >/dev/null 2>&1
        echo "Warning: Not in a git repository. Aborting."
        return 1
    end

    set -l selected

    if test (count $argv) -ge 1
        set selected $argv[1]
    else
        set -l main_worktree (git rev-parse --git-common-dir | string replace '/.git' '')
        set -l worktrees (git worktree list --porcelain | string match --regex '(?<=^worktree ).*')

        # Filter out the main worktree
        set worktrees (printf '%s\n' $worktrees | string match -rv "^$main_worktree\$")

        if test (count $worktrees) -eq 0
            echo "No removable worktrees found."
            return 1
        end

        set selected (printf '%s\n' $worktrees | fzf --prompt="Select worktree to delete: ")

        if test -z "$selected"
            return 0
        end
    end

    echo "Will remove worktree: $selected"
    read --prompt-str="Proceed? [y/N] " --nchars 1 confirm
    if not string match -qi y -- $confirm
        echo "Aborted."
        return 0
    end

    if not git worktree remove $selected
        echo "Removal failed (possibly uncommitted changes)."
        read --prompt-str="Force remove? [y/N] " --nchars 1 force_confirm
        if string match -qi y -- $force_confirm
            git worktree remove --force $selected
            or return 1
        else
            return 1
        end
    end

    echo "Worktree removed."
end
