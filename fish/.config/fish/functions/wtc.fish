function wtc --description 'Create a git worktree and open it in a tmux window with opencode'
    if test (count $argv) -ne 2
        echo "Usage: worktree <dir> <branch>"
        return 1
    end

    set -l dir $argv[1]
    set -l branch $argv[2]

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
