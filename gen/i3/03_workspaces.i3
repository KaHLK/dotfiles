# Define names for default workspaces for which we configure key bindings later on.
# We use variables to avoid repeating the names in multiple places.
set $ws1 "1"
set $ws2 "2"
set $ws3 "3"
set $ws4 "4"
set $ws5 "5"
set $ws6 "6"
set $ws7 "7"
set $ws8 "8"
set $ws9 "9"

# switch to workspace
bindsym $mod+1 workspace number $ws1
bindsym $mod+2 workspace number $ws2
bindsym $mod+3 workspace number $ws3
bindsym $mod+4 workspace number $ws4
bindsym $mod+5 workspace number $ws5
bindsym $mod+6 workspace number $ws6
bindsym $mod+7 workspace number $ws7
bindsym $mod+8 workspace number $ws8
bindsym $mod+9 workspace number $ws9

# move focused container to workspace
bindsym $mod+Ctrl+1 move container to workspace number $ws1
bindsym $mod+Ctrl+2 move container to workspace number $ws2
bindsym $mod+Ctrl+3 move container to workspace number $ws3
bindsym $mod+Ctrl+4 move container to workspace number $ws4
bindsym $mod+Ctrl+5 move container to workspace number $ws5
bindsym $mod+Ctrl+6 move container to workspace number $ws6
bindsym $mod+Ctrl+7 move container to workspace number $ws7
bindsym $mod+Ctrl+8 move container to workspace number $ws8
bindsym $mod+Ctrl+9 move container to workspace number $ws9


# Move to workspace with focused container
bindsym $mod+Shift+1 move container to workspace $ws1; workspace $ws1
bindsym $mod+Shift+2 move container to workspace $ws2; workspace $ws2
bindsym $mod+Shift+3 move container to workspace $ws3; workspace $ws3
bindsym $mod+Shift+4 move container to workspace $ws4; workspace $ws4
bindsym $mod+Shift+5 move container to workspace $ws5; workspace $ws5
bindsym $mod+Shift+6 move container to workspace $ws6; workspace $ws6
bindsym $mod+Shift+7 move container to workspace $ws7; workspace $ws7
bindsym $mod+Shift+8 move container to workspace $ws8; workspace $ws8
bindsym $mod+Shift+9 move container to workspace $ws9; workspace $ws9
