#!/bin/bash
if [ $SHELL != $(which fish) ]; then
    echo "Changing shell to fish."
    chsh -s $(which fish)
else
    echo "Already using fish as default shell."
fi
