# Tasks: Mambru Desktop Assistant v1

## Review Workload Forecast

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

~3,100+ lines across 48 new files. Way over 400-line budget.

### Suggested Work Units

1. **Foundation** — Cargo.toml, tauri.conf.json, main.rs stubs, settings.rs, Svelte scaffold, stores, mod.rs stubs
2. **Core Backend** — LLMProvider trait, Ollama/OpenAI providers, conversation history, personality, chat/settings IPC
3. **Voice Pipeline** — VAD, STT, TTS, VoicePipeline, voice IPC
4. **Tools & Security** — commands registry/matcher/builder, classifier/audit, executor, search
5. **User Interface** — Chat, MessageBubble, Settings, VoiceControls, ConfirmationDialog
6. **Tests** — unit + integration + frontend

## Phase 1: Foundation

- [x] 1.1 Create `src-tauri/Cargo.toml`
- [x] 1.2 Create `src-tauri/tauri.conf.json`
- [x] 1.3 Create `src-tauri/src/main.rs`
- [x] 1.4 Create `src-tauri/src/config/settings.rs`
- [x] 1.5 Create `package.json`
- [x] 1.6 Create `src/main.ts`, `src/app.css`, `tsconfig.json`, `vite.config.ts`
- [x] 1.7 Create `src/lib/stores/settings.ts`, `src/lib/stores/conversation.ts`
- [x] 1.8 Create mod.rs stubs: llm, voice, tools, tools/commands, security, conversation, commands

## Phase 2: Core Backend

- [x] 2.1 Create `src-tauri/src/llm/provider.rs`
- [x] 2.2 Update `src-tauri/src/llm/mod.rs` — LLMProvider trait with chat() stream + factory
- [x] 2.3 Create `src-tauri/src/llm/ollama.rs`
- [x] 2.4 Create `src-tauri/src/llm/openai.rs`
- [x] 2.5 Create `src-tauri/src/conversation/history.rs`
- [x] 2.6 Create `src-tauri/src/conversation/personality.rs`
- [x] 2.7 Create `src-tauri/src/commands/chat.rs`
- [x] 2.8 Create `src-tauri/src/commands/settings.rs`
- [x] 2.9 Create `src/lib/api/llm.ts`
- [x] 2.10 Wire provider factory into AppState

## Phase 3: Voice Pipeline

- [x] 3.1 Create `src-tauri/src/voice/vad.rs`
- [x] 3.2 Create `src-tauri/src/voice/stt.rs`
- [x] 3.3 Create `src-tauri/src/voice/tts.rs`
- [x] 3.4 Create `src-tauri/src/voice/mod.rs` — VoicePipeline
- [x] 3.5 Create `src-tauri/src/commands/voice.rs`
- [x] 3.6 Create `src/lib/api/voice.ts`, `src/lib/stores/voice.ts`

## Phase 4: Tools & Security

- [x] 4.1 Create `src-tauri/src/tools/commands/mod.rs`
- [x] 4.2 Create `src-tauri/src/tools/commands/registry.rs`
- [x] 4.3 Create `src-tauri/src/tools/commands/matcher.rs`
- [x] 4.4 Create `src-tauri/src/tools/commands/builder.rs`
- [x] 4.5 Create `src-tauri/src/security/classifier.rs`
- [x] 4.6 Create `src-tauri/src/security/audit.rs`
- [x] 4.7 Create `src-tauri/src/tools/executor.rs`
- [x] 4.8 Create `src-tauri/src/tools/search.rs`
- [x] 4.9 Create `src-tauri/src/tools/mod.rs` — ToolCall enum
- [x] 4.10 Create `src/lib/api/tools.ts`

## Phase 5: User Interface

- [x] 5.1 Replace `src/App.svelte` (full layout with sidebar, chat area, settings toggle, keyboard shortcuts, error boundary)
- [x] 5.2 Create `src/lib/components/Chat.svelte` (message list, input bar, streaming, loading/empty states, auto-scroll)
- [x] 5.3 Create `src/lib/components/MessageBubble.svelte` (markdown rendering, syntax highlighting, copy button, streaming cursor, timestamps)
- [x] 5.4 Create `src/lib/components/VoiceControls.svelte` (PTT button, recording indicator, TTS toggle, audio level, keyboard shortcut)
- [x] 5.5 Create `src/lib/components/ConfirmationDialog.svelte` (modal overlay, risk badge, approve/deny/always-allow, expandable preview)
- [x] 5.6 Create `src/lib/components/Settings.svelte` (5-tab settings: Provider, Voice, Commands, Personality, Appearance)
- [x] 5.7 Wire all components in App.svelte (sidebar + chat + settings + confirmation dialog, keyboard shortcuts, error boundary, theme)

## Phase 6: Testing

- [x] 6.1 Test: LLMProvider trait mock
- [x] 6.2 Test: CommandMatcher table-driven
- [x] 6.3 Test: RiskClassifier tiers + validation
- [x] 6.4 Test: Settings round-trip serde
- [x] 6.5 Test: IPC via tauri::test harness
- [x] 6.6 Test: Svelte components via Vitest
