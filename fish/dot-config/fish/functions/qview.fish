function qview --description "Open images in qView"
    if test (count $argv) -eq 0
        echo "Usage: qview <file>..."
        return 1
    end

    switch (uname)
        case Darwin
            open -a qView $argv
        case '*'
            # detached so the terminal stays free; `command` skips this function
            command qview $argv >/dev/null 2>&1 &
            disown
    end
end
