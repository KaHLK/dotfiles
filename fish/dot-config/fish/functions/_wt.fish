function _wt --description "Open directory in opencode"
    set -l dir $argv[1]
    set -l name (string replace -r '^pluto-' '' (path basename $dir))

    if not set -q TMUX
        tmux new-session -c $dir -n $name "cjs" \; \
            split-window -h -c $dir
    else
        tmux new-window -c $dir -n $name "cjs"
        tmux split-window -h -c $dir
    end
end
