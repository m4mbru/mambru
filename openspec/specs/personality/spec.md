# Personality Specification

## Purpose

Personality defines Mambru's conversational character through a base system prompt with humor and sarcasm. Users can customize the prompt, switch between presets, and persist their choice across sessions.

## Requirements

### Requirement: Base Personality

The system MUST include a default system prompt that establishes Mambru's personality as humorous, sarcastic, and helpful.

#### Scenario: Default personality active

- GIVEN no custom personality has been configured
- WHEN the user sends a message
- THEN the LLM response reflects the default humorous and sarcastic style
- AND the response remains helpful and task-focused

#### Scenario: Default prompt is not offensive

- GIVEN the default personality prompt
- WHEN it is inspected
- THEN it does not contain profanity, slurs, or hateful content
- AND it maintains a respectful tone beneath the humor

### Requirement: System Prompt Customization

The system MUST allow the user to override the default system prompt with their own text.

#### Scenario: Custom prompt overrides default

- GIVEN the user has set a custom system prompt in Settings
- WHEN the user sends a message
- THEN the LLM uses the custom prompt instead of the default
- AND the default prompt is not prepended

#### Scenario: Empty custom prompt

- GIVEN the user clears the custom prompt field
- WHEN they save settings
- THEN the system reverts to the default personality prompt
- AND the custom prompt field shows empty until next edit

### Requirement: Persona Presets

The system SHOULD support at least three persona presets: `default` (humorous/sarcastic), `professional` (neutral/formal), and `custom` (user-defined).

#### Scenario: Switch to professional preset

- GIVEN the user selects the "professional" preset
- WHEN the preset is applied
- THEN the system prompt switches to a neutral, formal style
- AND subsequent responses are professional in tone

#### Scenario: Switching clears unsaved changes

- GIVEN the user has edited the custom prompt but not saved
- WHEN they switch to a different preset
- THEN the unsaved edits are lost
- AND the new preset is applied immediately
- AND a confirmation dialog SHOULD warn before discarding changes

### Requirement: Persistence

The system MUST store the active persona preset and any custom prompt in the settings configuration (`~/.config/mambru/settings.toml`).

#### Scenario: Personality persists across restarts

- GIVEN the user selected the "professional" preset
- WHEN the application restarts
- THEN the professional prompt is loaded
- AND the LLM responds in a professional tone

#### Scenario: Custom prompt persists

- GIVEN the user wrote and saved a custom system prompt
- WHEN the application restarts
- THEN the custom prompt is loaded from settings
- AND the LLM uses it without re-requesting
