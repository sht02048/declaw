# declaw

See which Claude Code plugins and skills you actually use, so you can remove the ones you don't.

declaw reads Claude Code's local files and reports Usage Stats for each Installation in User Scope: how many Uses it had in the period your transcripts cover, and when it was last used. It never changes anything while reporting.

Status: early development. Plugins and Standalone Skills are reported; for Plugins, only Skill tool calls count as Uses so far.

## Usage

Requires Node 22 or later on macOS or Linux.

```sh
npx declaw stats          # print Usage Stats as a table
npx declaw stats --json   # print the same Report as JSON
```

declaw reads the Claude Code config directory from `CLAUDE_CONFIG_DIR` when set, otherwise from `~/.claude`, the same place Claude Code reads.

The covered period starts at the earliest timestamp in your session transcripts. Claude Code deletes old transcripts (30 days by default), so a skill with zero Uses means no Use in that period, not that it was never used. A skill's last Use can still reach further back: declaw also reads the `skillUsage` counter in Claude Code's config file (`~/.claude.json`, or `.claude.json` inside `CLAUDE_CONFIG_DIR` when set). The counter never adds Uses to the period's count, and declaw reads no other key from that file.

These files are internal to Claude Code and can change without notice. Both outputs show the read status of each source: `readable`, `partial` (some lines or records were skipped), or `unreadable`. A number that depends on an unreadable source is shown as `unknown` instead of zero or `never`.

## Development

```sh
npm install          # install dev dependencies
npm test             # run the test suite once (Vitest)
npm run test:watch   # rerun tests on change
npm run typecheck    # type-check sources and tests
npm run build        # compile to dist/ with tsc
node dist/cli.js stats   # run the built CLI
```

Tests go through the engine's `report` operation and build a fake Claude Code config directory in a temp folder with the helpers in `test/support/fake-config-dir.ts`. Never point tests at a real `~/.claude`.

Domain terms are defined in [GLOSSARY.md](GLOSSARY.md), and design decisions are recorded in [docs/adr](docs/adr).

## License

[MIT](LICENSE)
