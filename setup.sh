#/bin/bash
cd ./
mkdir -p ~/.vim/colors/ ~/.vim/indent ~/.vim/autoload ~/.vim/bundle ~/.config/fish/functions
ln -svf ~/dotfiles/.vimrc ~/.vimrc

cd ~/.vim/autoload
ln -svf ~/dotfiles/pathogen/autoload/* ./

cd ~/.vim/bundle
ln -svf ~/dotfiles/vim_bundles/* ./

cd ~/.vim/indent
ln -svf ~/dotfiles/.vim/indent/* ./

cd ~/.config/fish
ln -svf ~/dotfiles/fish/config.fish config.fish

cd ~/.config/fish/functions
ln -svf ~/dotfiles/fish/functions/* ./
