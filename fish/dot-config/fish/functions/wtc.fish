function wtc --description 'Create a git worktree and open it in a tmux window with opencode'
    # Check if in a git repository
    if not git rev-parse --is-inside-work-tree >/dev/null 2>&1
        echo "Warning: Not in a git repository. Aborting."
        return 1
    end

    if test (count $argv) -lt 1 -o (count $argv) -gt 2
        echo "Usage: wtc <dir> [branch]"
        return 1
    end

    # Get the git repository root
    set -l repo_root (git rev-parse --show-toplevel)
    set -l parent_dir (dirname $repo_root)
    
    set -l dir_name $argv[1]
    set -l dir "$parent_dir/$dir_name"
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

    # Confirm workspace location before creating
    echo "Workspace will be created at: $dir"
    read --prompt-str="Proceed? [y/N] " --nchars 1 confirm
    if not string match -qi 'y' -- $confirm
        echo "Aborted."
        return 1
    end

    git worktree add $dir $branch
    or return 1

    set -l abs_dir (realpath $dir)

    # Symlink .env for stack (Pluto-Technology) worktrees
    set -l remote_url (git remote get-url origin 2>/dev/null)
    if string match -q '*Pluto-Technology*' -- $remote_url
        for app_dir in js/apps/webapp js/apps/plutowork js/apps/e2e
            if test -d $abs_dir/$app_dir
                ln -s ../../../../.env $abs_dir/$app_dir/.env
                echo "Symlinked .env in $app_dir"
            end
        end
    end

    _wt $abs_dir
end
