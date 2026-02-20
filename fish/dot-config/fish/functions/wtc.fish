function wtc --description 'Create a git worktree and open it in a tmux window with opencode'
    if test (count $argv) -lt 1 -o (count $argv) -gt 2
        echo "Usage: wtc <dir> [branch]"
        return 1
    end

    set -l dir $argv[1]
    set -l branch

    if test (count $argv) -eq 2
        set branch $argv[2]
    else
        set -l checked_out (git worktree list --porcelain | string match -r 'refs/heads/.+' | string replace 'refs/heads/' '')
        set -l all_branches (git branch --format '%(refname:short)')
        if test (count $checked_out) -gt 0
            set all_branches (printf '%s\n' $all_branches | string match -rv (printf '^%s$\n' $checked_out | string join '|'))
        end
        set branch (printf '%s\n' $all_branches | fzf --prompt="Select branch: " --height=40% --border)
        if test -z "$branch"
            echo "No branch selected. Aborting."
            return 1
        end
    end

    if not git show-ref --verify --quiet refs/heads/$branch
        echo "Branch '$branch' does not exist."
        read --prompt-str="Base on [h]ead or [m]ain/master? " --nchars 1 choice
        switch $choice
            case h H
                git branch $branch HEAD
                or return 1
            case m M
                set -l default_branch (git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | string replace 'refs/remotes/origin/' '')
                if test -z "$default_branch"
                    set default_branch main
                end
                git branch $branch $default_branch
                or return 1
            case '*'
                echo "Invalid choice. Aborting."
                return 1
        end
    end

    git worktree add $dir $branch
    or return 1

    set -l abs_dir (realpath $dir)

    _wt $abs_dir
end
