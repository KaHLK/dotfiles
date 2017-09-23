#/bin/bash
cd ./
mkdir -p ~/.vim/indent ~/.vim/bundle/ ~/.config/fish/functions
ln -svf ~/dotfiles/.vimrc ~/.vimrc

cd ~/.vim/bundle/
ln -svf ~/dotfiles/vundle Vundle.vim

cd ~/.vim/indent
ln -svf ~/dotfiles/.vim/indent/* ./

cd ~/.config/fish
ln -svf ~/dotfiles/fish/config.fish config.fish

cd ~/.config/fish/functions
ln -svf ~/dotfiles/fish/functions/* ./

vim +PluginInstall
