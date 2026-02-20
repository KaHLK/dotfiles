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

    switch (uname)
        case Darwin
            # Modern macOS (Sequoia+) places agent sockets in ~/.ssh/agent/
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

        case "*"
            for SOCK_FILE in /tmp/ssh-*/agent.*
                test -S "$SOCK_FILE"; or continue
                set SOCK_PID (string split "." $SOCK_FILE)[2]
                set PID (ps -fu $LOGNAME | awk '/ssh-agent/ && ( $2=='$SOCK_PID' || $3=='$SOCK_PID' || $2=='$SOCK_PID' +1 ) {print $2}')
                set -x SSH_AUTH_SOCK $SOCK_FILE
                set -x SSH_AGENT_PID $PID
                ssh-add -l >/dev/null 2>&1
                if test $status -eq 0
                    set GOT_AGENT 1
                    echo "Found existing agent pid $PID"
                    break
                end
            end
    end

    if test $GOT_AGENT = 0
        echo "Didn't find existing agent with keys. Creating a new one and adding key"
        eval (ssh-agent -c)
        ssh-add ~/.ssh/sakie
    end
end

set __fish_git_prompt_showuntrackedfiles yes
set __fish_git_prompt_showdirtystate yes
set __fish_git_prompt_showstashstate ''
# set __fish_git_prompt_showupstream none
set -g fish_prompt_pwd_dir_length 3
set __fish_git_prompt_show_informative_status 1
set __fish_git_prompt_color_branch brmagenta
set __fish_git_prompt_showupstream informative
set __fish_git_prompt_color_stagedstate yellow
set __fish_git_prompt_color_invalidstate red
set __fish_git_prompt_color_cleanstate brgreen

set host $hostname
switch (uname)
    case Darwin
        set host (scutil --get ComputerName)
end

function fish_prompt
    # echo -n " "

    # set_color ffb3ba
    # echo -n (prompt_pwd)

    # printf '%s ' (__fish_git_prompt)

    # set_color normal
    # echo -n "> "

    set -l exitcode "$status"

    # print the "show cursor" escape code in case a program exited while the cursor was hidden
    printf "\033[?25h"

    printf (set_color reset)(set_color grey)
    printf "\n\033[1F"

    # printf (set_color ffb3ba)(whoami)(set_color normal)@(set_color bae1ff)"$host "(set_color normal)

    # if is a git repository
    if git rev-parse --is-inside-work-tree >/dev/null 2>/dev/null
        # repo name
        set -l reporoot (git rev-parse --show-toplevel 2>/dev/null)
        printf (set_color blue)(basename $reporoot)

        # branch
        set -l branchname (git symbolic-ref --short HEAD 2>/dev/null)
        set -l mainbranch (git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null)
        set -l mainbranch (string sub -s 11 "$mainbranch")
        if test -z "$mainbranch"
            set mainbranch main
        end
        if test "$branchname" != "$mainbranch"
            # set -l branchname (string split / $branchname)[-1]
            # printf (set_color magenta)\($branchname\)
            printf (set_color magenta)(string trim (fish_git_prompt))
        end

        # rest of the path
        printf (set_color grey)(string join "/" (string split "/" (string sub -s (math (string length $reporoot) + 1) $PWD)))
    else
        # non git path formatting
        switch "$PWD"
            case "$HOME*"
                printf "~"(string sub -s (math (string length $HOME) + 1) "$PWD")
            case "/tmp/scratchpad_*"
                printf (set_color brred)"scratch"(set_color grey)(string sub -s 32 "$PWD")
            case '*'
                printf "%s" "$PWD"
        end
    end

    # print the $
    if test "$exitcode" -ne 0
        printf (set_color brred)" >"(set_color brwhite)" "
    else
        printf (set_color brwhite)" > "
    end
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
set --export GITHUB_ACCESS_TOKEN "***REMOVED***"
set --export BUN_INSTALL "$HOME/.bun"

fish_add_path /usr/bin/rsync
fish_add_path ~/.cargo/bin
fish_add_path /opt/local/bin
fish_add_path /opt/local/sbin
fish_add_path $BUN_INSTALL/bin

# set -g PATH /usr/bin/rsync:~/.cargo/bin:/usr/local/bin/code:/opt/local/bin:/opt/local/sbin:$BUN_INSTALL/bin:$PATH
zoxide init fish | source
fnm env --use-on-cd | source

set --export JAVA_HOME "/Applications/Android Studio.app/Contents/jbr/Contents/Home"

# bun


# The next line updates PATH for the Google Cloud SDK.
if [ -f '/Users/kahlk/.google/path.fish.inc' ]; . '/Users/kahlk/.google/path.fish.inc'; end
