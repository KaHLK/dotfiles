function fish_right_prompt --description "Write the right prompt"
  printf "%s%s%s@%s%s" (set_color ff005f) (whoami) (set_color fafafa) (set_color 999900) (hostname|cut -d . -f 1)
end
