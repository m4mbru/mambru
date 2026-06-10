# Command Execution Specification

## Purpose

Command execution handles running user-defined and built-in commands securely through Tauri's shell plugin. Each command is classified by risk into one of three tiers: safe (auto-execute), medium (confirm dialog), or dangerous (approval + preview).

## Requirements

### Requirement: Risk Classification

The system MUST classify every command into one of three risk tiers before execution: safe, medium, or dangerous.

#### Scenario: Safe command auto-executes

- GIVEN a command classified as safe (e.g., read file, web search)
- WHEN the trigger matches
- THEN the command executes immediately without user prompt
- AND the result is shown in chat

#### Scenario: Medium command shows confirmation

- GIVEN a command classified as medium (e.g., write file, known command with args)
- WHEN the trigger matches
- THEN a confirmation dialog appears with the command details
- AND execution proceeds only if the user confirms

#### Scenario: Dangerous command requires approval and preview

- GIVEN a command classified as dangerous (e.g., shell script, system modification)
- WHEN the trigger matches
- THEN a dialog shows the full command preview and risk explanation
- AND execution requires explicit user approval
- AND the command does NOT run if the user dismisses the dialog

### Requirement: Tauri Shell Plugin

The system MUST use the Tauri shell plugin for managed command execution, with restricted scope per Tauri capabilities configuration.

#### Scenario: Command runs through Tauri shell

- GIVEN a confirmed command with a valid action
- WHEN the Tauri shell plugin executes it
- THEN stdout and stderr are captured
- AND the output is returned to the command execution module

#### Scenario: Command blocked by Tauri capability

- GIVEN the Tauri capabilities config does not permit the requested shell command
- WHEN execution is attempted
- THEN the command is rejected
- AND a security violation message is logged

### Requirement: Audit Log

The system MUST log all executed commands, including timestamp, command text, risk tier, and exit status.

#### Scenario: Successful command logged

- GIVEN a command executes successfully
- WHEN execution completes
- THEN an audit entry is written with the timestamp, command, risk tier, and exit code 0

#### Scenario: Failed command logged

- GIVEN a command fails with a non-zero exit code
- WHEN execution completes
- THEN an audit entry is written with the timestamp, command, risk tier, and non-zero exit code
- AND the error output is included in the log

### Requirement: Argument Validation

The system MUST validate command arguments against regex patterns before execution, rejecting arguments that do not match.

#### Scenario: Valid arguments pass validation

- GIVEN a command with a regex validator `^[a-zA-Z0-9_.-]+$` for `{filename}`
- WHEN the argument value is `report.pdf`
- THEN validation passes
- AND execution proceeds

#### Scenario: Invalid arguments blocked

- GIVEN a command with a regex validator for `{filename}`
- WHEN the argument value contains special shell characters like `; rm -rf /`
- THEN validation fails
- AND execution is blocked
- AND a validation error is displayed

### Requirement: Sidecar Support

The system MAY support sidecar binaries for trusted commands, bundled with the application.

#### Scenario: Sidecar command executes

- GIVEN a sidecar binary is bundled and configured
- WHEN a command references the sidecar
- THEN the sidecar executes with the provided arguments
- AND its output is returned as the command result
