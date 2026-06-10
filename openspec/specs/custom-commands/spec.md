# Custom Commands Specification

## Purpose

Custom commands allow the user to define reusable, parameterized triggers that execute actions. Commands are stored in `~/.config/mambru/commands.toml`, loaded on startup, and watched for live changes.

## Requirements

### Requirement: TOML Configuration File

The system MUST load custom command definitions from `~/.config/mambru/commands.toml`.

#### Scenario: Commands load on startup

- GIVEN a valid `commands.toml` file exists with defined commands
- WHEN the application starts
- THEN all commands are loaded into the command registry
- AND they are available for matching against user messages

#### Scenario: File not found on first launch

- GIVEN no `commands.toml` file exists
- WHEN the application starts
- THEN an empty command registry is created
- AND no errors are shown
- AND the file is created when the first command is added

### Requirement: Command Structure

Each command MUST define a trigger pattern (regex or natural language), an action type (exec, script, or api), a risk level, and an optional confirmation flag.

#### Scenario: Command matches by regex

- GIVEN a command with trigger pattern `abrí (?P<app>\w+)`
- WHEN the user sends "abrí Firefox"
- THEN the command matches
- AND `{app}` is extracted as "Firefox"

#### Scenario: Command does not match

- GIVEN a command with trigger pattern `abrí (?P<app>\w+)`
- WHEN the user sends "cerrá todo"
- THEN no command matches
- AND the message is processed as a normal chat query

### Requirement: Named Parameter Extraction

The system MUST extract named parameters from matched triggers and substitute them into the command action.

#### Scenario: Parameters substituted into exec action

- GIVEN a command with trigger `buscá (?P<query>.+)` and action `exec: start chrome "https://google.com/search?q={query}"`
- WHEN the user says "buscá gatos"
- THEN the command executes `start chrome "https://google.com/search?q=gatos"`

#### Scenario: Missing parameter in trigger

- GIVEN a command requiring `{url}` in the trigger
- WHEN the user's message does not provide a URL
- THEN the command does not match
- AND the message falls through to normal chat

### Requirement: Live Config Reload

The system MUST watch `~/.config/mambru/commands.toml` for file changes and reload the registry without requiring a restart.

#### Scenario: File edit triggers reload

- GIVEN Mambru is running with loaded commands
- WHEN the user edits and saves `commands.toml` externally
- THEN the registry reloads automatically
- AND the updated commands are immediately available

### Requirement: AI-Assisted Creation

The system MUST allow users to create commands through natural language, e.g., "cuando diga X hacé Y".

#### Scenario: AI creates command from description

- GIVEN the user says "cuando diga abrí Firefox abrí el navegador"
- WHEN the LLM interprets this as a command creation request
- THEN a new command entry is proposed with trigger `abrí (?P<app>\w+)` and action `exec: start {app}`
- AND the system asks for user confirmation before persisting

#### Scenario: User rejects AI-proposed command

- GIVEN the AI proposes a command from natural language
- WHEN the user rejects it
- THEN no command is saved
- AND the conversation continues normally

### Requirement: Command Manager UI

The system SHOULD provide a Command Manager sub-panel within Settings for listing, searching, filtering, creating, editing, and deleting commands.

#### Scenario: Create command via UI

- GIVEN the user opens the Command Manager in Settings
- WHEN they fill in trigger, action, risk level, and save
- THEN the command is persisted to `commands.toml`
- AND appears in the command list immediately

#### Scenario: Delete command via UI

- GIVEN a command exists in the list
- WHEN the user deletes it
- THEN the command is removed from `commands.toml`
- AND removed from the registry

### Requirement: Import and Export

The system SHOULD support importing and exporting commands as standalone TOML files.

#### Scenario: Export selected commands

- GIVEN the user selects commands to export
- WHEN export is triggered
- THEN a valid TOML file is written to the chosen location
- AND the file can be shared or re-imported later

#### Scenario: Import with conflicts

- GIVEN the user imports a TOML file with commands
- WHEN a command name conflicts with an existing command
- THEN the user is prompted to skip, overwrite, or rename
