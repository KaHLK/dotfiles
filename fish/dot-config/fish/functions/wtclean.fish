function wtclean --description "Prune origin and delete local branches whose remote is gone (and their worktrees)"
    if not git rev-parse --is-inside-work-tree >/dev/null 2>&1
        echo "Warning: Not in a git repository. Aborting."
        return 1
    end

    git remote prune origin

    set -l gone (git for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads \
        | string match -r '.*\[gone\]$' | string replace -r ' \[gone\]$' '')

    if test (count $gone) -eq 0
        echo "No stale branches."
        return 0
    end

    # Map branch -> worktree dir from porcelain output (parallel lists, no assoc arrays).
    set -l wt_branch
    set -l wt_dir
    set -l cur_dir
    for line in (git worktree list --porcelain)
        if set -l m (string match -r '^worktree (.*)' $line)
            set cur_dir $m[2]
        else if set -l m (string match -r '^branch refs/heads/(.*)' $line)
            set -a wt_branch $m[2]
            set -a wt_dir $cur_dir
        end
    end

    # Resolve each gone branch's worktree dir (empty if none) and display.
    set -l dirs
    for i in (seq (count $gone))
        set -l idx (contains -i -- $gone[$i] $wt_branch)
        if test -n "$idx"
            set dirs[$i] $wt_dir[$idx]
            echo "$i. $gone[$i] -> $wt_dir[$idx]"
        else
            set dirs[$i] ""
            echo "$i. $gone[$i] -> (no worktree)"
        end
    end

    read --prompt-str="Delete which? [enter=all] " sel

    set -l indices
    if test -z "$sel"
        set indices (seq (count $gone))
    else
        for token in (string split ',' $sel)
            set token (string trim $token)
            if string match -qr '^[0-9]+-[0-9]+$' $token
                set -l parts (string split '-' $token)
                set -a indices (seq $parts[1] $parts[2])
            else if string match -qr '^[0-9]+$' $token
                set -a indices $token
            else
                echo "Invalid selection: $token"
                return 1
            end
        end
    end

    # Validate, dedupe, keep ascending.
    set -l seen
    for n in $indices
        if test $n -lt 1 -o $n -gt (count $gone)
            echo "Selection out of range: $n"
            return 1
        end
        if not contains -- $n $seen
            set -a seen $n
        end
    end

    for n in (printf '%s\n' $seen | sort -n)
        set -l branch $gone[$n]
        set -l dir $dirs[$n]

        if test -n "$dir"
            if not git worktree remove $dir
                read --prompt-str="Force remove $dir? [y/N] " --nchars 1 force
                if string match -qi y -- $force
                    git worktree remove --force $dir
                    or continue
                else
                    echo "Skipped $branch (worktree left intact)."
                    continue
                end
            end
            echo "Worktree removed: $dir"
        end

        if git branch -D $branch
            echo "Branch deleted: $branch"
        end
    end
end
