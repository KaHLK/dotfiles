# Alternative tools
* Use `rg` (ripgrep) in favor of `grep`
* Use `fd` in favor of `find`
* Use `rip` (rip2) in favor of `rm`

* Use modern git commands such as `switch` and `restore` instead of `checkout`

# Available tools
The following tools are available
* `fzf`
* `jq`

# General approach
A task should always be planned out first (even if the user forgets to ask for a plan).
Plans should always be written to a file before starting the implementation - to allow for referencing it if/when a process is interrupted. Save the file in the `~/.llm-output`.

All temporary output should be saved in `~/.llm-output`.

When fixing an issue, a failing test replicating the issue MUST ALWAYS be created first, then the issue fixed (with input from/completely by a human). An issue is only fixed once the test passes. Additional tests may be added during the fixing process if new context is found.
