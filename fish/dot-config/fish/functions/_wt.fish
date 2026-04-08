function _wt --description "Open directory in opencode"
    set -l dir $argv[1]

    if not set -q TMUX
        tmux new-session -c $dir "opencode" \; \
            split-window -h -c $dir
    else
        tmux new-window -c $dir "opencode"
        tmux split-window -h -c $dir
    end
end
