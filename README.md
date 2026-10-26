# declaw

See which Claude Code plugins and skills you actually use, so you can remove the ones you don't.

declaw reads Claude Code's local files and reports Usage Stats for each Installation in User Scope: how many Uses it had in the period your transcripts cover, and when it was last used. It never changes anything while reporting.

Status: early development. Plugins and Standalone Skills are reported, and a Cleanup removes the selected ones.

A Use is a Skill tool call, a slash command you typed that names a known skill or command, an Agent or Task call to a Plugin's subagent type, or a call to one of a Plugin's MCP tools. Uses inside subagents count. Hook runs never count, and built-in commands and subagent types are left out.

## Usage

Requires Node 22 or later on macOS or Linux.

```sh
npx declaw                # choose Installations to clean up, interactively
npx declaw --dry-run      # the same, ending at the confirmation screen
npx declaw stats          # print Usage Stats as a table
npx declaw stats --json   # print the same Report as JSON
```

`declaw` opens a full-screen list of every Installation under the covered period, grouped by Usage Status, with the number of Installations per Usage Status, how many are recommended, and how many are selected. Each row shows the kind, the Uses in the covered period, how long ago the last Use was, and for a Plugin how many hooks it runs every session. Every line fits on one terminal row: long names end in an ellipsis, and narrow terminals drop the hooks column and then the kind column. A panel under the list describes the Installation under the cursor: its Usage Status and why, when it was installed, where a Linked Skill links to, and what a Cleanup would do to it.

Move with the arrow keys, select with space (`◉` selected, `○` not selected), press `r` to select the recommended set (marked `★`), and press right or left to expand or collapse a Plugin's per-Component Uses. Synced Skills are listed with `·` and cannot be selected. Enter opens a confirmation screen that groups the selection by what will happen, then lists how to undo each:

| Installation | What happens | Undo |
|---|---|---|
| Plugin | `claude plugin uninstall <plugin> --scope user` | `claude plugin install <plugin> --scope user` |
| Linked Skill | the link is removed; its target is kept | recreate the link with `ln -s` |
| Standalone Skill | its folder moves to the system trash | restore it from the trash |

Esc goes back to the list without changing anything, and q quits. Press y on the confirmation screen to run the Cleanup. One failure does not stop the rest, and a summary then marks each Installation removed (`✔`) or failed (`✖`), with the reason for a failure (a failed uninstall's output as-is), followed by how to undo each removal. After you quit, the same summary is printed to the terminal, so the undo commands stay in your scrollback. With `--dry-run` the confirmation screen is the end and y does nothing. There is no flag that skips the confirmation screen.

declaw reads the Claude Code config directory from `CLAUDE_CONFIG_DIR` when set, otherwise from `~/.claude`, the same place Claude Code reads.

The covered period starts at the earliest timestamp in your session transcripts. Claude Code deletes old transcripts (30 days by default), so a skill with zero Uses means no Use in that period, not that it was never used. A skill's last Use can still reach further back: declaw also reads the `skillUsage` counter in Claude Code's config file (`~/.claude.json`, or `.claude.json` inside `CLAUDE_CONFIG_DIR` when set). The counter never adds Uses to the period's count, and declaw reads no other key from that file.

These files are internal to Claude Code and can change without notice. Both outputs show the read status of each source (the plugin install records, `settings.json`, the other plugin files such as manifests and hook configurations, the transcripts, and the skill counter): `readable`, `partial` (some lines, records, or Plugins were skipped), or `unreadable`. A number that depends on an unreadable source is shown as `unknown` instead of zero or `never`, and a corrupt file of one Plugin makes only that Plugin's numbers `unknown`.

A Standalone Skill is a folder in the skills folder that holds a `SKILL.md`; other folders and dot-folders are left out. A Linked Skill whose target no longer exists is still listed, flagged as a broken link.

Each Installation's Usage Status is judged only from its Uses, whenever it was installed: Used when a last Use is known, in the covered period or from the skill counter, and Unused otherwise, including when no transcripts exist yet. When only an unreadable source could know an Installation's last Use, it is marked Unknown instead and never called Unused. Unused Installations are listed first, oldest install first (by the install record for a Plugin, the folder's creation time for a Standalone Skill, or the link's own time for a Linked Skill; the modification time stands in only where the filesystem records no creation time), followed by the rest, oldest last Use first; the interactive list keeps that order within its groups, which run Unused, Used, then Unknown. Installations marked `★` are recommended for Cleanup: every Unused or disabled one, except Synced Skills.

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

Tests go through the engine's `report`, `planCleanup`, and `cleanup` operations and build a fake Claude Code config directory in a temp folder with the helpers in `test/support/fake-config-dir.ts`. `cleanup` takes its trash mover and `claude` CLI runner as arguments, so its tests pass the fakes in `test/support/fake-effects.ts` and check the moves and calls they recorded instead of using the real system trash or running the real `claude plugin uninstall`. The real trash mover uses the [trash](https://github.com/sindresorhus/trash) package and lives in `src/system-effects.ts`. Never point tests at a real `~/.claude`. Fixtures set creation times through `test/support/birth-times.ts`, which the setup file feeds into `lstat`, because Node cannot set a file's birth time. The interactive list is built with [Ink](https://github.com/vadimdemedes/ink), and its tests in `test/tui` render it from a fixture with `ink-testing-library`, so they need no real terminal.

Domain terms are defined in [GLOSSARY.md](GLOSSARY.md), and design decisions are recorded in [docs/adr](docs/adr).

## License

[MIT](LICENSE)
