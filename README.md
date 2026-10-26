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

`declaw` lists every Installation with its Usage Stats under the covered period. Move with the arrow keys, select with space, press `r` to select the recommended set, and press right or left to expand or collapse a Plugin's per-Component Uses. Synced Skills are listed but cannot be selected. Enter opens a confirmation screen that shows, for each selection, what will happen and how to undo it:

| Installation | What happens | Undo |
|---|---|---|
| Plugin | `claude plugin uninstall <plugin> --scope user` | `claude plugin install <plugin> --scope user` |
| Linked Skill | the link is removed; its target is kept | recreate the link with `ln -s` |
| Standalone Skill | its folder moves to the system trash | restore it from the trash |

Esc goes back to the list without changing anything, and q quits. Press y on the confirmation screen to run the Cleanup. One failure does not stop the rest, and a summary then lists each Installation as removed or failed, with the reason for a failure (a failed uninstall's output as-is), followed by how to undo each removal. With `--dry-run` the confirmation screen is the end and y does nothing. There is no flag that skips the confirmation screen.

declaw reads the Claude Code config directory from `CLAUDE_CONFIG_DIR` when set, otherwise from `~/.claude`, the same place Claude Code reads.

The covered period starts at the earliest timestamp in your session transcripts. Claude Code deletes old transcripts (30 days by default), so a skill with zero Uses means no Use in that period, not that it was never used. A skill's last Use can still reach further back: declaw also reads the `skillUsage` counter in Claude Code's config file (`~/.claude.json`, or `.claude.json` inside `CLAUDE_CONFIG_DIR` when set). The counter never adds Uses to the period's count, and declaw reads no other key from that file.

These files are internal to Claude Code and can change without notice. Both outputs show the read status of each source (the plugin install records, the transcripts, and the skill counter): `readable`, `partial` (some lines or records were skipped), or `unreadable`. A number that depends on an unreadable source is shown as `unknown` instead of zero or `never`.

Each Installation is marked Unused, Used, or Too New. Too New means it was installed after the covered period began (by the install record for a Plugin, the folder's creation time for a Standalone Skill, or the link's own time for a Linked Skill), so there is not enough history to judge it. When only an unreadable source could know an Installation's last Use, it is marked Unknown instead and never called Unused. Unused Installations are listed first, oldest install first, followed by the rest, oldest last Use first. Installations marked `*` are recommended for Cleanup: every Unused or disabled one, except Too New and Synced Skills.

## Development

```sh
npm install          # install dev dependencies
npm test             # run the test suite once (Vitest)
npm run test:watch   # rerun tests on change
npm run typecheck    # type-check sources and tests
npm run build        # compile to dist/ with tsc
node dist/cli.js stats   # run the built CLI
```

Tests go through the engine's `report`, `planCleanup`, and `cleanup` operations and build a fake Claude Code config directory in a temp folder with the helpers in `test/support/fake-config-dir.ts`. `cleanup` takes its trash mover and `claude` CLI runner as arguments, so its tests pass the fakes in `test/support/fake-effects.ts` and check the moves and calls they recorded instead of using the real system trash or running the real `claude plugin uninstall`. The real trash mover uses the [trash](https://github.com/sindresorhus/trash) package and lives in `src/system-effects.ts`. Never point tests at a real `~/.claude`. The interactive list is built with [Ink](https://github.com/vadimdemedes/ink), and its tests in `test/tui` render it from a fixture with `ink-testing-library`, so they need no real terminal.

Domain terms are defined in [GLOSSARY.md](GLOSSARY.md), and design decisions are recorded in [docs/adr](docs/adr).

## License

[MIT](LICENSE)
