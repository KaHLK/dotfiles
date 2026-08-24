function ftail-llm --description "ftail rooted at ~/.llm-output, where agents tee their long-running output"
    ftail "$HOME/.llm-output" $argv
end
