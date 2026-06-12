function _wt --description "Open directory in opencode"
    set -l dir $argv[1]
    set -l cmd $argv[2]
    set -l name (string replace -r '^pluto-' '' (path basename $dir))

    if not set -q TMUX
        tmux new-session -c $dir -n $name "cjs" \; \
            split-window -h -c $dir $cmd \; \
            select-pane -L
    else
        tmux new-window -c $dir -n $name "cjs"
        tmux split-window -h -c $dir $cmd
        tmux select-pane -L
    end
end
