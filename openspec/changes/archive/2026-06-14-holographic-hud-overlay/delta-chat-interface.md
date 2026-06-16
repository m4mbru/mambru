# Delta: chat-interface

## Change Type

Modified — the chat interface moves from the main layout area into an expandable orbital holographic panel.

## Modified Requirements

### Requirement: IPC Bridge (unchanged)

The IPC bridge, streaming, Markdown rendering, message history, and conversation management requirements remain unchanged. All existing chat behaviour is preserved.

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

### Removed Requirements

| ID | Reason |
|----|--------|
| Conversation sidebar | The sidebar is removed — conversation switching moves inside the expanded Chat panel as a dropdown or tab |

#### Scenario: Switch conversations in panel

- GIVEN the Chat panel is expanded
- WHEN the user clicks a conversation selector
- THEN a dropdown SHALL show available conversations
- AND selecting one SHALL load that conversation
