# Colors
set $fg  #ffffff
set $bg2 #222222
set $bg  #964058
#b84b6a

# class                 border  backgr. text indicator child_border
client.focused          $bg      $bg    $fg  $bg       $bg
client.focused_inactive $bg2     $bg2   $fg  $bg2      $bg2
client.unfocused        $bg2     $bg2   $fg  $bg2      $bg2
client.urgent           $bg      $bg    $fg  $bg       $bg
client.placeholder      $bg      $bg    $fg  $bg       $bg

client.background       $bg

exec_always colour.sh
