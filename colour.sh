#!/bin/bash

wal -i $HOME/pic/bg.jpg
sleep 1
nitrogen --restore
sh ~/.config/polybar/launch.sh
