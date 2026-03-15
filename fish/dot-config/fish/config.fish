# Abbreviations
if command -v eza >/dev/null
    abbr -a l eza
    abbr -a ls eza
    abbr -a ll 'eza -l'
    abbr -a la 'eza -la'
else
    abbr -a l ls
    abbr -a ll 'ls -l'
    abbr -a la 'ls -la'
end

abbr -a c cargo
abbr -a e code
abbr -a g git
abbr -a yr "cal -y"

if status is-interactive
    # Check if an existing ssh-agent exists and re-use it
    set GOT_AGENT 0

    for SOCK_FILE in $HOME/.ssh/agent/s.*
        test -S "$SOCK_FILE"; or continue
        set -x SSH_AUTH_SOCK $SOCK_FILE
        set -e SSH_AGENT_PID
        ssh-add -l >/dev/null 2>&1
        if test $status -eq 0
            set GOT_AGENT 1
            echo "Found existing agent via $SOCK_FILE"
            break
        end
    end

    if test $GOT_AGENT = 0
        echo "Didn't find existing agent with keys. Creating a new one and adding key"
        eval (ssh-agent -c)
        ssh-add ~/.ssh/sakie
    end
end

set host $hostname
switch (uname)
    case Darwin
        set host (scutil --get ComputerName)
end

function fish_greeting
    switch (uname)
        case Darwin
            ~/.scripts/mac_login_info.ts

        case "*"
            echo
            echo -e (uname -ro | awk '{print " \\\\e[1mOS: \\\\e[0;32m"$0"\\\\e[0m"}')
            echo -e (uptime -p | sed 's/^up //' | awk '{print " \\\\e[1mUptime: \\\\e[0;32m"$0"\\\\e[0m"}')
            echo -e (uname -n | awk '{print " \\\\e[1mHostname: \\\\e[0;32m"$0"\\\\e[0m"}')
            echo -e " \\e[1mDisk usage:\\e[0m"
            echo -ne (\
                df -l -h | grep -E 'dev/(xvda|sd|mapper|nvme)' | \
                awk '{printf "  %s\\\\t%4s / %4s  %s\\\\n", $6, $3, $2, $5}' | \
                sed -e 's/^\(.*\([8][5-9]\|[9][0-9]\)%.*\)$/\\\\e[0;31m\1\\\\e[0m/' -e 's/^\(.*\([7][5-9]\|[8][0-4]\)%.*\)$/\\\\e[0;33m\1\\\\e[0m/' | \
                paste -sd ''\
            )
            echo
            set_color normal
    end
end

set --export EDITOR nvim
set --export BUN_INSTALL "$HOME/.bun"

fish_add_path /usr/bin/rsync
fish_add_path ~/.cargo/bin
fish_add_path /opt/local/bin
fish_add_path /opt/local/sbin
fish_add_path $BUN_INSTALL/bin

zoxide init fish | source
fnm env --use-on-cd | source

# The next line updates PATH for the Google Cloud SDK.
if [ -f '/Users/kahlk/.google/path.fish.inc' ]
    . '/Users/kahlk/.google/path.fish.inc'
end

starship init fish | source
