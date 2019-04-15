#function fish_prompt --description 'Write out the prompt'
#  printf '%s%s%s> ' (set_color 00afff) (prompt_pwd) (set_color normal)
#end

function fish_prompt
  printf '%s%s%s' (set_color ffb3ba) (prompt_pwd) (set_color normal)

  echo -n '> '
  set_color normal
end
