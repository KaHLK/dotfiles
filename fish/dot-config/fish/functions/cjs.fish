function cjs --description "Pipe a saved prompt file into claude (bat FILE | claude --verbose); fzf-pick on first run"
    # machine-local state, kept out of the stowed repo
    set -l state_base $XDG_STATE_HOME
    test -z "$state_base"; and set state_base "$HOME/.local/state"
    set -l state_file "$state_base/cjs/promptfile"

    set -l file ""
    set -l save 0 # only persist when the path actually changes

    if contains -- --pick $argv
        # force re-pick: leave $file empty -> fzf below
    else if test (count $argv) -ge 1
        # explicit path arg
        set file $argv[1]
        set save 1
    else if test -f "$state_file"
        # happy path: reuse saved path, nothing else
        set file (cat "$state_file")
    end

    # first run, --pick, or saved/explicit path missing -> choose via fzf
    if test -z "$file"; or not test -f "$file"
        set file (fd -e md . $HOME | fzf --prompt="Select prompt file: ")
        set save 1
    end

    if test -z "$file"; or not test -f "$file"
        echo "cjs: no file selected" >&2
        return 1
    end

    # persist only on change (explicit arg or fresh pick), not on plain reuse
    if test "$save" -eq 1
        mkdir -p (dirname "$state_file")
        printf '%s\n' "$file" >"$state_file"
    end

    bat "$file" | claude --verbose
end
