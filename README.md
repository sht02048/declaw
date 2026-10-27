# declaw

See which Claude Code plugins, skills, and MCP servers you actually use, so you can remove the ones you don't.

declaw reads Claude Code's local files and reports Usage Stats for each Installation in User Scope: how many Uses it had in the period your transcripts cover, and when it was last used. It never changes anything while reporting.

Status: early development. Plugins, Standalone Skills, and Standalone MCP Servers are reported, and a Cleanup removes the selected ones.

A Use is a Skill tool call, a slash command you typed that names a known skill or command, an Agent or Task call to a Plugin's subagent type, or a call to one of a Plugin's or a Standalone MCP Server's MCP tools. Uses inside subagents count. Hook runs never count, and built-in commands and subagent types are left out.

## Usage

Requires Node 22 or later on macOS or Linux.

```sh
npx declaw                # choose Installations to clean up, interactively
npx declaw --dry-run      # the same, ending at the confirmation screen
npx declaw stats          # print Usage Stats as a table
npx declaw stats --json   # print the same Report as JSON
```

`declaw` opens a full-screen list of every Installation under the covered period, grouped by Usage Status, with the number of Installations per Usage Status, how many are recommended, and how many are selected. Each row shows the kind, the Uses in the covered period, how long ago the last Use was, and for a Plugin how many hooks it runs every session. Every line fits on one terminal row: long names end in an ellipsis, and narrow terminals drop the hooks column and then the kind column. A panel under the list describes the Installation under the cursor: its Usage Status and why, when it was installed, where a Linked Skill links to, how a Standalone MCP Server connects, and what a Cleanup would do to it.

Move with the arrow keys, select with space (`◉` selected, `○` not selected), press `r` to select the recommended set (marked `★`), and press right or left to expand or collapse a Plugin's per-Component Uses. Synced Skills are listed with `·` and cannot be selected. Enter opens a confirmation screen that groups the selection by what will happen, then lists how to undo each:

| Installation | What happens | Undo |
|---|---|---|
| Plugin | `claude plugin uninstall <plugin> --scope user` | `claude plugin install <plugin> --scope user` |
| Linked Skill | the link is removed; its target is kept | recreate the link with `ln -s` |
| Standalone Skill | its folder moves to the system trash | restore it from the trash |
| Standalone MCP Server | its registration is backed up, then `claude mcp remove <name> --scope user` | `claude mcp add-json <name> "$(cat <backup file>)" --scope user` |

Esc goes back to the list without changing anything, and q quits. Press y on the confirmation screen to run the Cleanup. One failure does not stop the rest, and a summary then marks each Installation removed (`✔`) or failed (`✖`), with the reason for a failure (a failed uninstall's output as-is), followed by how to undo each removal. After you quit, the same summary is printed to the terminal, so the undo commands stay in your scrollback. With `--dry-run` the confirmation screen is the end, y does nothing, and no backup is written. There is no flag that skips the confirmation screen.

declaw reads the Claude Code config directory from `CLAUDE_CONFIG_DIR` when set, otherwise from `~/.claude`, the same place Claude Code reads.

The covered period starts at the earliest timestamp in your session transcripts. Claude Code deletes old transcripts (30 days by default), so a skill with zero Uses means no Use in that period, not that it was never used. A skill's last Use can still reach further back: declaw also reads the `skillUsage` counter in Claude Code's config file (`~/.claude.json`, or `.claude.json` inside `CLAUDE_CONFIG_DIR` when set). The counter never adds Uses to the period's count. declaw reads only two keys from that file: `skillUsage`, and the User Scope `mcpServers` to list Standalone MCP Servers. Of a server's registration, only its name and transport (`stdio`, `http`, or `sse`) are reported; its URL, command, arguments, environment, and headers never appear on screen or in `stats` output.

These files are internal to Claude Code and can change without notice. Both outputs show the read status of each source (the plugin install records, `settings.json`, the other plugin files such as manifests and hook configurations, the transcripts, the skill counter, and the MCP server registrations): `readable`, `partial` (some lines, records, or Plugins were skipped), or `unreadable`. A number that depends on an unreadable source is shown as `unknown` instead of zero or `never`, and a corrupt file of one Plugin makes only that Plugin's numbers `unknown`.

A Standalone Skill is a folder in the skills folder that holds a `SKILL.md`; other folders and dot-folders are left out. A Linked Skill whose target no longer exists is still listed, flagged as a broken link.

Each Installation's Usage Status is judged only from its Uses, whenever it was installed: Used when a last Use is known, in the covered period or from the skill counter, and Unused otherwise, including when no transcripts exist yet. When only an unreadable source could know an Installation's last Use, it is marked Unknown instead and never called Unused. Unused Installations are listed first, oldest install first (by the install record for a Plugin, the folder's creation time for a Standalone Skill, or the link's own time for a Linked Skill; the modification time stands in only where the filesystem records no creation time), followed by the rest, oldest last Use first; the interactive list keeps that order within its groups, which run Unused, Used, then Unknown. Installations marked `★` are recommended for Cleanup: every Unused or disabled one, except Synced Skills.

## Standalone MCP Servers

A Standalone MCP Server is an MCP server you added yourself in User Scope, for example with `claude mcp add --scope user`, listed with the kind `mcp`. Servers registered for one project and a repository's `.mcp.json` are left out, and so are claude.ai connectors.

Any call to one of a server's tools, named `mcp__<server>__<tool>` in the transcripts, is a Use of that server, where `<server>` is the server's name with every character other than letters, digits, `_`, and `-` replaced by `_`, as Claude Code names its tools. When a Plugin's MCP tools share that prefix, the longer prefix wins, so Plugin Usage Stats stay as they were. Calls to servers that are not registered in User Scope are ignored. A server of the same name registered for one project produces the same tool names, so its calls also count toward the User Scope server; declaw cannot tell them apart.

There is no long-term counter for MCP servers, so a server's last Use comes from the transcripts alone: Unused means no Use in the covered period. Claude Code records no install time for a server either, so Unused servers are listed first among Unused Installations.

A Cleanup never edits the config file itself. For each selected server, declaw first reads its registration again and copies it as-is to `~/.declaw/backups/<run time>/<name>.json`, one folder per interactive run, readable only by you (the file is `0600` and the folders `0700`), because the registration can hold tokens. Only then does it run `claude mcp remove <name> --scope user`. If the registration is gone or the backup cannot be written, the server is left in place and the removal is reported as failed. declaw never deletes old backups. The confirmation screen and the summary show the backup file and the command that adds the server back, `claude mcp add-json <name> "$(cat <backup file>)" --scope user`, which reads the backup itself, so no token has to be pasted. A server that signs in with OAuth needs a new login in `/mcp` after it is added back, since Claude Code keeps its OAuth tokens elsewhere and they are not part of the backup.

## Development

To run declaw from a clone, each of these builds first:

```sh
npm start                  # interactive Cleanup, same as `declaw`
npm run dry-run            # interactive, ending at the confirmation screen
npm run stats              # Usage Stats table
npm start -- stats --json  # pass any other arguments after --
```

```sh
npm install          # install dev dependencies
npm test             # run the test suite once (Vitest)
npm run test:watch   # rerun tests on change
npm run typecheck    # type-check sources and tests
npm run build        # compile to dist/ with tsc
node dist/cli.js stats   # run the built CLI
```

Tests go through the engine's `report`, `planCleanup`, and `cleanup` operations and build a fake Claude Code config directory in a temp folder with the helpers in `test/support/fake-config-dir.ts`. `cleanup` takes its trash mover and `claude` CLI runner as arguments, so its tests pass the fakes in `test/support/fake-effects.ts` and check the moves and calls they recorded instead of using the real system trash or running the real `claude plugin uninstall` or `claude mcp remove`. Its tests also pass a temporary backup folder, never `~/.declaw`. The real trash mover uses the [trash](https://github.com/sindresorhus/trash) package and lives in `src/system-effects.ts`. Never point tests at a real `~/.claude`. Fixtures set creation times through `test/support/birth-times.ts`, which the setup file feeds into `lstat`, because Node cannot set a file's birth time. The interactive list is built with [Ink](https://github.com/vadimdemedes/ink), and its tests in `test/tui` render it from a fixture with `ink-testing-library`, so they need no real terminal.

Domain terms are defined in [GLOSSARY.md](GLOSSARY.md), and design decisions are recorded in [docs/adr](docs/adr).

## License

[MIT](LICENSE)
