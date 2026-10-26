# declaw

declaw shows how a Claude Code user's installed plugins and skills are actually used, so the user can remove the ones they don't use.

## Language

### What gets cleaned up

**Installation**:
The unit the user can remove: a single Plugin or a single Standalone Skill.
_Avoid_: item, entry, asset, extension

**Plugin**:
A Claude Code plugin installed from a marketplace, bundling one or more Components.
_Avoid_: extension, package

**Component**:
One part of a Plugin: a skill, command, agent, hook, or MCP server. A Component is never removed on its own, only with its Plugin.
_Avoid_: feature, module, sub-item

**Standalone Skill**:
A skill the user installed directly, outside any Plugin.
_Avoid_: user skill, loose skill, local skill

**Linked Skill**:
A Standalone Skill whose files belong to somewhere else, such as another tool's skill folder or a personal repository. Removing it removes only the link.
_Avoid_: symlinked skill, external skill

**Synced Skill**:
A skill managed by the user's claude.ai account. It is shown but never removed, because the account would restore it.
_Avoid_: cloud skill, remote skill

**User Scope**:
Installed for the user across every project, as opposed to installed for a single project.
_Avoid_: global, home

### What the user sees

**Use**:
One deliberate invocation of a Component: a skill or command being invoked, an agent being run, or an MCP tool being called. A hook running is not a Use.
_Avoid_: hit, call, activation

**Usage Stats**:
The record of when and how often each Installation and its Components saw a Use, aggregated across all of the user's projects.
_Avoid_: stat, state, metrics, telemetry

**Install Status**:
Whether an Installation is installed and whether it is enabled, plus facts that affect the user's judgement, such as how many hooks a Plugin runs every session.
_Avoid_: state, stat

**Unused**:
Having no Use during the period the Usage Stats cover.
_Avoid_: useless, dead, stale

**Too New**:
Installed more recently than the start of the period the Usage Stats cover, so there is not enough history to call it Unused.
_Avoid_: recent, fresh, new

### What the user does

**Cleanup**:
Removing the Installations the user selected after reviewing Usage Stats. declaw never removes anything the user did not select.
_Avoid_: purge, prune, auto-clean
