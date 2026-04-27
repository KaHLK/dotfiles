# Alternative tools
* Use `rg` (ripgrep) over `grep`
* Use `fd` over `find`
* Use `rip` (rip2) over `rm`

* Use modern git: `switch`/`restore` not `checkout`

# Available tools
Available
* `fzf`
* `jq`

# General approach
ALWAYS tee + head/tail output: `some command | tee ~/.llm-output/some-path | tail -n 10`. Max `-n` 50. Not enough? Re-read tee'd file with offset (`bat ~/.llm-output/some-path | tail -n 100 | head -n 50`).

Temp output save in `~/.llm-output`, subdir named after repo/branch (whichever easiest to find again).

Fix issue: failing test replicating issue MUST come first, then fix (human input or human-done). Issue fixed only when test passes. Add more tests if new context appears.

ALWAYS ASK permission before running tests

Tsx files: EXPORTED component ALWAYS FIRST. Multiple exports? Sort by relevance to filename (ex. `Dropdown` in `Dropdown.tsx` first).

I ALWAYS want to inspect code before a commit. ALWAYS ASK permission before commit
