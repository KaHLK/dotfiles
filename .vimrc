set nocompatible
filetype off

set rtp+=~/.vim/bundle/Vundle.vim
call vundle#begin()

Plugin 'VundleVim/Vundle.vim'

Plugin 'flazz/vim-colorschemes'
Plugin 'wakatime/vim-wakatime'
Plugin 'sheerun/vim-polyglot'

Plugin 'townk/vim-autoclose'

Plugin 'itchyny/lightline.vim'

Plugin 'majutsushi/tagbar'
Plugin 'scrooloose/nerdtree'
Plugin 'jistr/vim-nerdtree-tabs'

call vundle#end()

colorscheme molokai   " Colorscheme

syntax enable         " syntax processing
set number relativenumber   " Set relative numbers
augroup numbertoggle        " change between to not relative numbers when in insert mode and back when not
  autocmd!
  autocmd BufEnter,FocusGained,InsertLeave * set relativenumber
  autocmd BufLeave,FocusLost,InsertEnter   * set norelativenumber
augroup END
set showcmd           " show the last command
set cursorline        " higlight the current line

filetype on           " enable file type detection 
filetype indent on    " load filetype-specific indent files

set wildmenu          " visual autocomplete for command menu
set lazyredraw        " redraw only when needed
set showmatch         " Higlight matching [{()}]

set tabstop=2         " number of vusial spaces per tab
set softtabstop=2     " number of spaces in tab when editing
set shiftwidth=0      " Number of spaces for (auto)indent
set expandtab         " tabs are spaces

set backupdir=~/.vim/swapfiles
set dir=~/.vim/swapfiles

" Lightline
set laststatus=2
let g:lightline = {
  \ 'colorscheme': 'seoul256'
  \ }

" Tagbar
nmap <F8> :TagbarToggle<CR>

" Nerdtree
nmap <C-N> :NERDTreeTabsToggle<CR>
