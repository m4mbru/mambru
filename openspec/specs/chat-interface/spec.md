# Chat Interface Specification

## Purpose

The chat interface is Mambru's primary interaction surface. It provides a streaming, Markdown-rendered conversational UI where the user exchanges messages with the LLM through a Tauri IPC bridge.

## Requirements

### Requirement: IPC Bridge

The system MUST stream LLM response tokens from the Rust backend to the Svelte frontend using a Server-Sent Events pattern through Tauri event emission.

#### Scenario: Streaming tokens arrive in real time

- GIVEN the user has sent a message
- WHEN the LLM begins responding
- THEN tokens are emitted via Tauri events as they arrive
- AND the frontend appends each token to the active message without blocking the UI

#### Scenario: Stream cancellation

- GIVEN an LLM response is streaming
- WHEN the user starts a new conversation or presses stop
- THEN the in-flight stream is cancelled
- AND the partial message is discarded or preserved per user preference

### Requirement: Markdown Rendering

The system MUST render all messages as Markdown, including syntax-highlighted code blocks, inline code, lists, and links.

#### Scenario: Code block renders with syntax highlighting

- GIVEN a message contains a fenced code block with a language tag (e.g., ````python`)
- WHEN the message is rendered
- THEN the code block displays with syntax highlighting for that language
- AND a copy-to-clipboard button is available

#### Scenario: Malformed Markdown does not crash the UI

- GIVEN a message contains malformed Markdown (e.g., unclosed tags, broken fences)
- WHEN the renderer processes it
- THEN it renders gracefully without crashing
- AND raw text is shown where Markdown parsing fails

### Requirement: Message History

The system MUST persist conversation history as JSON files on disk and restore them on startup.

#### Scenario: History restores after restart

- GIVEN a saved conversation history file exists
- WHEN the application loads
- THEN previous messages are restored in the chat view
- AND the conversation list includes the restored conversation

#### Scenario: Empty history on first launch

- GIVEN no history files exist
- WHEN the application loads
- THEN the chat opens with a blank conversation
- AND no errors are shown

### Requirement: Streaming Display

The system MUST display tokens incrementally as they arrive, without blocking the input field.

#### Scenario: Token-by-token display

- GIVEN the user is waiting for a response
- WHEN tokens stream in
- THEN each token appears immediately in the message bubble
- AND the user can continue typing or send a follow-up message

### Requirement: Conversation Management

The system MUST maintain an in-memory list of conversations, auto-scroll to the bottom on new content, and support switching between conversations.

#### Scenario: Auto-scroll on new message

- GIVEN the chat view is scrolled up
- WHEN a new message or token arrives
- THEN the view auto-scrolls to the bottom
- AND manual scroll-up pauses auto-scroll temporarily

#### Scenario: Switch conversations

- GIVEN two or more conversations exist in memory
- WHEN the user selects a different conversation
- THEN the chat view loads that conversation's message history
- AND the streaming state resets for the previous conversation

### Requirement: Chat in Orbital Panel

The chat interface MUST now render inside a holographic panel that expands from orbit.

#### Scenario: Chat opens as expanded panel

- GIVEN the user is viewing the orbital HUD
- WHEN they click the Chat panel
- THEN the Chat panel SHALL expand to center with fluid animation
- AND the full chat interface SHALL be available (input field, message history, streaming)
- AND all existing chat behaviour SHALL work unchanged

#### Scenario: Chat closes

- GIVEN the user is interacting with an expanded Chat panel
- WHEN they click the close button or press Escape
- THEN the panel SHALL collapse back to orbital position
- AND the conversation state SHALL be preserved

#### Scenario: Switch conversations in panel

- GIVEN the Chat panel is expanded
- WHEN the user clicks a conversation selector
- THEN a dropdown SHALL show available conversations
- AND selecting one SHALL load that conversation
