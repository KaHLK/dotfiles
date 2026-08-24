function ftail --description "fzf-pick a file under a root (newest first) and follow it with tail -F"
    argparse 'n/lines=' 'no-follow' 'r/root=' -- $argv
    or return 1

    # Root is optional and positional, which makes the first word ambiguous:
    # `ftail build/` is a root, `ftail build` is a query against the cwd. Claim it
    # as the root only when it is a real directory, or when it is path-shaped and
    # therefore a typo worth reporting rather than a search term to silently accept.
    set -l root .
    if set -q _flag_root
        set root $_flag_root
    else if test (count $argv) -ge 1
        if test -d "$argv[1]"; or string match -qr '^[~./]|/' -- "$argv[1]"
            set root $argv[1]
            set -e argv[1]
        end
    end

    if not test -d "$root"
        echo "ftail: not a directory: $root" >&2
        return 1
    end

    # one ls call for the whole tree: -1t sorts by mtime on both BSD and GNU ls,
    # so the file an agent just wrote lands on the first row
    set -l files (fd --type f . "$root" -X ls -1t)
    if test (count $files) -eq 0
        echo "ftail: no files under $root" >&2
        return 1
    end

    # show paths relative to root; fzf hands the same string back, so re-anchor after the pick
    set -l prefix (string replace -r '/?$' '/' -- "$root")
    set -l rel (string replace -- "$prefix" '' $files)

    # quoted, and never a bare substitution: with no query left in $argv this expands
    # to zero args and --query eats the next flag instead
    set -l query ""
    test (count $argv) -gt 0; and set query (string join ' ' -- $argv)

    # preview is deliberately metadata-only (size + mtime); birth time is not portable
    set -l pick (printf '%s\n' $rel | fzf \
        --query "$query" \
        --select-1 --exit-0 \
        --prompt "tail> " \
        --preview "ls -ld -- $prefix{}" \
        --preview-window 'down,3,wrap')

    if test -z "$pick"
        return 1
    end

    set -l lines 100
    set -q _flag_lines; and set lines $_flag_lines

    # -F, not -f: agents rewrite these files with `cmd | tee path`, which truncates
    # or recreates the inode; -f would go silent, -F reattaches
    if set -q _flag_no_follow
        tail -n $lines -- "$prefix$pick"
    else
        tail -F -n $lines -- "$prefix$pick"
    end
end
