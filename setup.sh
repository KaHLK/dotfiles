#/bin/bash
cd ../
mkdir -p .vim/colors/
mkdir -p .config/fish/functions
ln -svf dotfiles/.vimrc .vimrc

cd .vim/colors
ln -svf ../../dotfiles/.vim/colors/* ./

cd ../indent
ln -svf ../../dotfiles/.vim/indent/* ./

cd ../../.config/fish
ln -svf ../../dotfiles/fish/config.fish config.fish

cd functions
ln -svf ../../../dotfiles/fish/functions/* ./
