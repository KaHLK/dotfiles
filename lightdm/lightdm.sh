#!/bin/bash

sudo cp lightdm/lightdm-gtk-greeter.conf /etc/lightdm/
sudo cp lightdm/lightdm.conf /etc/lightdm/

yay -S accountservice
sudo cp lightdm/kahlk /var/lib/AccountsService/users/
sudo cp pics/kahlk.png /var/lib/AccountsService/icons/