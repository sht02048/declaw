<p align="center"><img src="docs/assets/mascot.svg" width="160" alt="declaw mascot, a small teal pixel crab"></p>

<h1 align="center">declaw</h1>

<p align="center">See which Claude Code plugins, skills, and MCP servers you actually use.<br>Remove the rest, with a way back for each.</p>

```sh
npx declaw
```

```
declaw  Usage Stats 2026-09-28 – 2026-10-26 · 29 days
Plugins 3  Skills 4  MCP Servers 2  All 9
2 Unused  1 Used · 2 recommended                   0 selected
      name                      kind    uses  last use  hooks
  Unused  2
› ○ ★ pdf-tools@acme-plugins    plugin     0  never         0
  ○ ★ standup@acme-plugins      plugin     0  never         1

  Used  1
  ○   deploy-kit@acme-plugins   plugin    14  2d ago        2
```

Plugins pile up. Each one can bring skills, commands, subagents, MCP servers, and hooks that run every session, and nothing tells you which of them you still use. declaw reads Claude Code's local transcripts and shows, for every Installation, how many Uses it had and when you last used it. Then you pick what goes.

Status: early development. Requires Node 22 or later on macOS or Linux.

## Usage

```sh
npx declaw                # choose Installations to clean up, interactively
npx declaw --dry-run      # the same, ending at the confirmation screen
npx declaw stats          # print Usage Stats as a table
npx declaw stats --json   # print the same Report as JSON
```

| Key | On the list |
|---|---|
| `↑` `↓` | move |
| `←` `→` | show one kind at a time: Plugins, Skills, MCP Servers, All |
| `space` | select (`◉`) or unselect (`○`) |
| `r` | select the recommended set (`★`) in the shown kind |
| `tab` | expand or collapse a Plugin's per-Component Uses |
| `enter` | review the selection |
| `esc` | quit |

Enter opens a confirmation screen that lists what will happen to each selected Installation and how to undo it. Press enter (or `y`) there to run the Cleanup, or esc to go back. Nothing is removed before that screen, and no flag skips it.

## What counts as a Use

- Claude invoking a skill, or a slash command you typed that names a known skill or command
- A Plugin's subagent being run
- A call to one of a Plugin's or a Standalone MCP Server's MCP tools
- Any of these inside a subagent

Hooks running never count, and neither do built-in commands and subagent types.

An Installation is **Used** when its last Use is known, **Unused** when it has none, and **Unknown** when a file it depends on could not be read. Unknown is never called Unused. Every Unused or disabled Installation is recommended (`★`), except skills synced from your claude.ai account.

## Every removal has a way back

| Installation | What happens | Undo |
|---|---|---|
| Plugin | `claude plugin uninstall <plugin> --scope user` | `claude plugin install <plugin> --scope user` |
| Standalone Skill | its folder moves to the system trash | restore it from the trash |
| Linked Skill | the link is removed; its target is kept | recreate the link with `ln -s` |
| Standalone MCP Server | its registration is backed up, then `claude mcp remove <name> --scope user` | `claude mcp add-json <name> "$(cat <backup file>)" --scope user` |
| Synced Skill | listed with `·`, never removed | nothing to undo |

declaw calls Claude Code's own commands and never edits its config file. When you quit, the undo commands are printed to the terminal, so they stay in your scrollback.

## What declaw reads

Everything runs on your machine, from the Claude Code config directory (`CLAUDE_CONFIG_DIR` when set, otherwise `~/.claude`):

- session transcripts
- plugin install records, `settings.json`, manifests, and hook configurations
- two keys of `~/.claude.json`: the `skillUsage` counter and the User Scope `mcpServers`

Of an MCP server's registration, only its name and transport are shown. Its URL, command, arguments, environment, and headers never appear on screen or in `stats` output.

<details>
<summary><strong>Details</strong></summary>

### The covered period

The covered period starts at the earliest timestamp in your session transcripts. Claude Code deletes old transcripts (30 days by default), so a skill with zero Uses means no Use in that period, not that it was never used. A skill's last Use can still reach further back through the `skillUsage` counter in Claude Code's config file (`~/.claude.json`, or `.claude.json` inside `CLAUDE_CONFIG_DIR` when set). The counter never adds Uses to the period's count.

### Read status

The files declaw reads are internal to Claude Code and can change without notice. Both outputs show the read status of each source (the plugin install records, `settings.json`, the other plugin files such as manifests and hook configurations, the transcripts, the skill counter, and the MCP server registrations): `readable`, `partial` (some lines, records, or Plugins were skipped), or `unreadable`. A number that depends on an unreadable source is shown as `unknown` instead of zero or `never`, and a corrupt file of one Plugin makes only that Plugin's numbers `unknown`.

### The list

Each row shows the kind, the Uses in the covered period, how long ago the last Use was, and for a Plugin how many hooks it runs every session. Every line fits on one terminal row: long names end in an ellipsis, and narrow terminals drop the hooks column and then the kind column. A panel under the list describes the Installation under the cursor: its Usage Status and why, when it was installed, where a Linked Skill links to, how a Standalone MCP Server connects, and what a Cleanup would do to it. The list opens on Plugins, and the selection is kept when you switch kinds.

Usage Status is judged only from Uses, whenever an Installation was installed, including when no transcripts exist yet. Unused Installations are listed first, oldest install first (by the install record for a Plugin, the folder's creation time for a Standalone Skill, or the link's own time for a Linked Skill; the modification time stands in only where the filesystem records no creation time), followed by the rest, oldest last Use first. The interactive list keeps that order within its groups, which run Unused, Used, then Unknown.

A Standalone Skill is a folder in the skills folder that holds a `SKILL.md`; other folders and dot-folders are left out. A Linked Skill whose target no longer exists is still listed, flagged as a broken link.

### After a Cleanup

One failure does not stop the rest. A summary marks each Installation removed (`✔`) or failed (`✖`), with the reason for a failure (a failed uninstall's output as-is), followed by how to undo each removal. Esc goes back to the list without the removed Installations and with nothing selected, so you can clean up more, and q quits. After you quit, the summary of every Cleanup in the session is printed to the terminal. With `--dry-run` the confirmation screen is the end, enter and `y` do nothing, and no backup is written.

### Standalone MCP Servers

A Standalone MCP Server is an MCP server you added yourself in User Scope, for example with `claude mcp add --scope user`, listed with the kind `mcp`. Servers registered for one project and a repository's `.mcp.json` are left out, and so are claude.ai connectors.

Any call to one of a server's tools, named `mcp__<server>__<tool>` in the transcripts, is a Use of that server, where `<server>` is the server's name with every character other than letters, digits, `_`, and `-` replaced by `_`, as Claude Code names its tools. When a Plugin's MCP tools share that prefix, the longer prefix wins, so Plugin Usage Stats stay as they were. Calls to servers that are not registered in User Scope are ignored. A server of the same name registered for one project produces the same tool names, so its calls also count toward the User Scope server; declaw cannot tell them apart.

There is no long-term counter for MCP servers, so a server's last Use comes from the transcripts alone: Unused means no Use in the covered period. Claude Code records no install time for a server either, so Unused servers are listed first among Unused Installations.

For each selected server, declaw first reads its registration again and copies it as-is to `~/.declaw/backups/<run time>/<name>.json`, one folder per interactive run, readable only by you (the file is `0600` and the folders `0700`), because the registration can hold tokens. Only then does it run `claude mcp remove <name> --scope user`. If the registration is gone or the backup cannot be written, the server is left in place and the removal is reported as failed. declaw never deletes old backups. The undo command reads the backup itself, so no token has to be pasted. A server that signs in with OAuth needs a new login in `/mcp` after it is added back, since Claude Code keeps its OAuth tokens elsewhere and they are not part of the backup.

</details>

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

The landing page is a single static file, `site/index.html`. Domain terms are defined in [GLOSSARY.md](GLOSSARY.md), and design decisions are recorded in [docs/adr](docs/adr).

## License

[MIT](LICENSE)
