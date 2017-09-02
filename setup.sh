#/bin/bash
cd ../
mkdir -p .vim/colors/
mkdir -p .config/fish/functions
ln -svf dotfiles/.vimrc .vimrc

cd .vim/colors
ln -svf ../../dotfiles/.vim/colors/molokai.vim molokai.vim

cd ../../.config/fish
ln -svf ../../dotfiles/fish/config.fish config.fish

cd functions
ln -svf ../../../dotfiles/fish/functions/fish_prompt.fish fish_prompt.fish
ln -svf ../../../dotfiles/fish/functions/fish_right_prompt.fish fish_right_prompt.fish
