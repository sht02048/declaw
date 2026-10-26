# Plugin removal is delegated to `claude plugin uninstall`

declaw removes a Plugin by calling Claude Code's own `claude plugin uninstall` instead of deleting its files, even though declaw already reads those files and could delete them directly. The official command also cleans up plugin data and settings by Claude Code's own rules, and keeps working when the internal file layout changes. When the command fails, declaw shows its error as-is rather than falling back to deleting files. Old cached plugin versions are left for Claude Code's own sweep.
