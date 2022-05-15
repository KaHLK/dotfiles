# Abbreviations
if command -v exa >/dev/null
    abbr -a l exa
    abbr -a ls exa
    abbr -a ll 'exa -l'
    abbr -a la 'exa -la'
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
    set AGENTS /tmp/ssh-*/agent.*
    set GOT_AGENT 0
    for FILE in $AGENTS
        set SOCK_PID (string split "." $FILE)[2]
        set PID (ps -fu $LOGNAME | awk '/ssh-agent/ && ( $2=='$SOCK_PID' || $3=='$SOCK_PID' || $2=='$SOCK_PID' +1 ) {print $2}')
        set SOCK_FILE $FILE

        set -x SSH_AUTH_SOCK $SOCK_FILE
        set -x SSH_AGENT_PID $PID

        # Check if an ssh-agent have keys and re-use it if it does
        ssh-add -l | string match --regex The >/dev/null
        if [ $status != 0 ]
            set GOT_AGENT 1
            echo "Found existing agent pid $PID"
            break
        end
    end

    if [ $GOT_AGENT = 0 ]
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

function fish_prompt
    echo -n "["
    set_color ffb3ba
    echo -n (whoami)
    set_color normal
    echo -n "@"
    set_color bae1ff
    echo -n $hostname
    set_color normal
    echo -n "] "

    set_color ffb3ba
    echo -n (prompt_pwd)

    printf '%s ' (__fish_git_prompt)

    set_color normal
    echo -n "> "
end

function fish_greeting
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

function d
    while test $PWD != /
        if test -d .git
            break
        end
        cd ..
    end
end
