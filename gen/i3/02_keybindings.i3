set $mod Mod4
# Use Mouse+$mod to drag floating windows to their wanted position
floating_modifier $mod
# toggle tiling / floating
bindsym $mod+Shift+space floating toggle
# change focus between tiling / floating windows
bindsym $mod+space focus mode_toggle

# start a terminal
bindsym $mod+Return exec alacritty
# kill focused window
bindsym $mod+Shift+q kill
# Start rofi:
bindsym $mod+d exec "rofi -show drun"
bindsym $mod+Shift+d exec "rofi -show ssh"

# change focus
bindsym $mod+Left focus left
bindsym $mod+Down focus down
bindsym $mod+Up focus up
bindsym $mod+Right focus right
# alternatively, you can use the cursor keys:
bindsym $mod+Shift+Left move left
bindsym $mod+Shift+Down move down
bindsym $mod+Shift+Up move up
bindsym $mod+Shift+Right move right

bindsym $mod+b workspace back_and_forth

# split in horizontal orientation
bindsym $mod+h split h

# split in vertical orientation
bindsym $mod+v split v

# enter fullscreen mode for the focused container
bindsym $mod+f fullscreen toggle

# change container layout (stacked, tabbed, toggle split)
bindsym $mod+s layout stacking
bindsym $mod+w layout tabbed
bindsym $mod+e layout toggle split

# focus the parent container
bindsym $mod+a focus parent

# reload the configuration file
bindsym $mod+Shift+c reload
# restart i3 inplace (preserves your layout/session, can be used to upgrade i3)
bindsym $mod+Shift+r restart
