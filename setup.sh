#/bin/bash
echo "Looking for commands"
# TODO: Check for all "required" programs. Missing: htop, xfce4-terminal
if ! command -v nitrogen || ! command -v rofi
then
  echo "Please install 'nitrogen', 'rofi'"
  exit
fi
if [ -z "$(ls -A Vundle.vim)" ]
then
  set -x #Print commands
  git submodule init
  git submodule update
fi

set -x #Print commands

cd ./
mkdir -p ~/.vim/indent ~/.vim/bundle/ ~/.config/fish/functions
ln -svf ~/dotfiles/.vimrc ~/.vimrc

cd ~/.vim/bundle/
ln -svf ~/dotfiles/Vundle.vim ./

cd ~/.vim/indent
ln -svf ~/dotfiles/.vim/indent/* ./

cd ~/.config/fish
ln -svf ~/dotfiles/fish/config.fish config.fish

cd ~/.config/fish/functions
ln -svf ~/dotfiles/fish/functions/* ./

cd ~/.config/xfce4/terminal/
ln -svf ~/dotfiles/xfce4-terminal/* ./

cd ~/.config/htop/
ln -svf ~/dotfiles/htop/* ./

cd ~
ln -svf ~/dotfiles/.Xmodmap ./.Xmodmap

# TODO: Maybe move all .config related files into a .config sub-dir
# TODO: Split .i3/config and merge into .i3/config

# TODO: Add bg and set it up with nitrogen

vim +PluginInstall
