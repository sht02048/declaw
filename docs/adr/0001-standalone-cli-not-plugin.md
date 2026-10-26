# declaw is a standalone CLI, not a Claude Code plugin

declaw ships as an npm CLI that reads Claude Code's local files directly, even though it only makes sense to Claude Code users and a plugin would be the obvious packaging. A cleanup tool that lives inside Claude Code would itself occupy context in every session, would leave the counting to a model whose results can vary between runs, and could not run outside a Claude Code session. A plugin may later exist only as a thin wrapper that calls the CLI.
