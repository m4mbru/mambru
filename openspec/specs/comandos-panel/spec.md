# Comandos Panel Specification

## Purpose

The comandos panel provides quick access to Mambru's command system — custom commands, built-in actions, and shortcuts — within the holographic HUD.

## Requirements

### Requirement: Command List Display

The panel MUST list available commands in a searchable, scannable format.

#### Scenario: Panel shows commands

- GIVEN the HUD is in orbital view
- WHEN the user sees the Comandos panel
- THEN the panel SHALL display a list of available commands
- AND each command SHALL show: trigger phrase, brief description, and whether it is active

#### Scenario: Search/filter commands

- GIVEN the Comandos panel is visible
- WHEN the user types in a search field
- THEN the command list SHALL filter in real time to matching entries

### Requirement: Command Execution

The panel MUST support triggering commands directly from the HUD.

#### Scenario: Execute command from panel

- GIVEN the Comandos panel is expanded
- WHEN the user clicks on a command or presses Enter on a selected command
- THEN the command SHALL execute
- AND the HUD SHALL show brief feedback that the command ran

### Requirement: Integration with Existing Command System

The panel MUST read from the same command registry used by `custom-commands` and `command-execution` specs.

#### Scenario: Commands stay in sync

- GIVEN a command is added or modified in Settings
- WHEN the Comandos panel is viewed
- THEN it SHALL reflect the updated command list
- AND no separate configuration is needed
