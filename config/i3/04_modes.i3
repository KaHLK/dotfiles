
# resize window
bindsym $mod+r mode "resize"
mode "resize" {
        # Pressing left will shrink the window’s width.
        # Pressing right will grow the window’s width.
        # Pressing up will shrink the window’s height.
        # Pressing down will grow the window’s height.
        bindsym Left resize shrink width 10 px or 10 ppt
        bindsym Down resize grow height 10 px or 10 ppt
        bindsym Up resize shrink height 10 px or 10 ppt
        bindsym Right resize grow width 10 px or 10 ppt
	
	bindsym Shift+Left resize shrink width 5 px or 5 ppt
	bindsym Shift+Down resize grow height 5 px or 5 ppt
	bindsym Shift+Up resize shrink height 5 px or 5 ppt
	bindsym Shift+Right resize grow width 5 px or 5 ppt

        # Exit mode: Enter or Escape or $mod+r
        bindsym Return mode "default"
        bindsym Escape mode "default"
        bindsym $mod+r mode "default"
}

bindsym $mod+Escape mode "$mode_system"
set $mode_system (l)ock, (e)xit, (s)uspend, (r)eboot, (Shift+s)hutdown
mode "$mode_system" {
        bindsym l exec --no-startup-id i3exit lock, mode "default"
        bindsym e exec --no-startup-id i3exit logout, mode "default"
        bindsym s exec --no-startup-id i3exit suspend, mode "default"
        bindsym r exec --no-startup-id i3exit reboot, mode "default"
        bindsym Shift+s exec --no-startup-id i3exit shutdown, mode "default"

        # exit system mode: "Enter" or "Escape"
        bindsym Return mode "default"
        bindsym Escape mode "default"
}
