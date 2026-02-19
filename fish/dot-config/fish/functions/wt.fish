function wt --description "Select a git worktree and open it in a tmux window with opencode"
    set -l worktrees (git worktree list --porcelain | string match --regex '(?<=^worktree ).*')

    if test (count $worktrees) -eq 0
        echo "No worktrees found."
        return 1
    end

    set -l selected (printf '%s\n' $worktrees | fzf --prompt="Select worktree: ")

    if test -z "$selected"
        return 0
    end

    _wt $selected
end

