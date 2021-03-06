set -g -x fish_greeting ""
# cd ~

# Check if an existing ssh-agent exists and re-use it
set GOT_AGENT 0
for FILE in /tmp/ssh-*/agent.*;
 set SOCK_PID (string split "." $FILE)[2]
 set PID (ps -fu$LOGNAME|awk '/ssh-agent/ && ( $2=='$SOCK_PID' || $3=='$SOCK_PID' || $2=='$SOCK_PID' +1 ) {print $2}')
 set SOCK_FILE $FILE

 set -x SSH_AUTH_SOCK $SOCK_FILE
 set -x SSH_AGENT_PID $PID

 ssh-add -l > /dev/null
 if [ $status != 2 ]
   set GOT_AGENT 1
   echo "Found existing agent pid $PID"
   break
 end
end

if [ $GOT_AGENT = 0 ]
 eval (ssh-agent -c)
end
