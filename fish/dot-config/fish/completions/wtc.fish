# Completions for wtc - create a git worktree and open it in tmux
# Usage: wtc <dir> [branch]

function __wtc_needs_dir
    set -l tokens (commandline -opc)
    test (count $tokens) -eq 1
end

function __wtc_needs_branch
    set -l tokens (commandline -opc)
    test (count $tokens) -eq 2
end

function __wtc_available_branches
    set -l checked_out (git worktree list --porcelain 2>/dev/null | string match -r 'refs/heads/.+' | string replace 'refs/heads/' '')
    set -l all_branches (git branch --format '%(refname:short)' 2>/dev/null)

    if test (count $checked_out) -gt 0
        set all_branches (printf '%s\n' $all_branches | string match -rv (printf '^%s$\n' $checked_out | string join '|'))
    end

    printf '%s\n' $all_branches
end

# First argument: no path completion (user types directory name)
complete -c wtc -n __wtc_needs_dir -f

# Second argument: git branch completion (no file completions)
complete -c wtc -n __wtc_needs_branch -f -a '(__wtc_available_branches)'

# No completions after both arguments are provided
complete -c wtc -n 'not __wtc_needs_dir; and not __wtc_needs_branch' -f
