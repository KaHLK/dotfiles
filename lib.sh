# Shared helpers for install scripts.
# Requires $INSTALL_CMD to be set before sourcing, e.g.:
#   INSTALL_CMD="yay -S --noconfirm"
#   INSTALL_CMD="sudo port install"

install() {
    local cmd=${2:-$1}
    if ! [ -x "$(command -v $cmd)" ]; then
        echo ""
        echo "Installing '$1'"
        $INSTALL_CMD $1
    fi
}
