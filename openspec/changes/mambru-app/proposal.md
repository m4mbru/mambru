# Proposal: Mambru — Versatile Desktop Assistant (v1)

## Intent

Native desktop AI assistant with hybrid LLM, voice I/O, file access, web search, and humorous personality. Deliver v1 with core chat, voice, and commands.

## Scope

### In Scope
- Chat UI with streaming responses (Svelte + Tauri IPC)
- Hybrid LLM: local (Ollama) + cloud (OpenAI/Anthropic)
- Push-to-talk → whisper.cpp STT → Piper TTS output
- Custom commands in `~/.config/mambru/commands.toml`
- Command execution with 3 security tiers (safe/medium/dangerous)
- Web search via Tavily/SerpAPI
- Conversation history (in-memory + JSON file)
- Settings panel (provider, voice, API keys, commands)
- Customizable personality via system prompt
- Public GitHub repo

### Out of Scope
- Always-listening (v2), macros (v2), headless browser (v2)
- Plugin system (v3), cloud sync (v2+), mobile (future)
- Multi-language beyond EN/ES (v2)

## Capabilities

### New Capabilities
- `chat-interface`, `llm-provider`, `voice-pipeline`
- `custom-commands`, `command-execution`, `web-search`
- `user-settings`, `personality`

### Modified Capabilities
None — greenfield project.

## Approach

Tauri v2 (Rust) + Svelte. Hexagonal architecture: LLM, voice, tools, executor as independent modules behind a unified trait. Tauri IPC bridges UI ↔ backend. Security via Tauri capabilities + custom risk classifier.

## Affected Areas

| Area | Impact |
|------|--------|
| `src-tauri/src/` | New — Rust backend |
| `src/` | New — Svelte frontend |
| `Cargo.toml` | New — dependencies |
| `tauri.conf.json` | New — app config + permissions |
| `package.json` | New — JS deps |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Voice threading complexity | High | Push-to-talk only v1 |
| whisper.cpp CPU perf | Med | Cloud STT fallback |
| Rust learning curve | Med | Established crates, incremental |
| Ollama dependency | Med | Install guide + doc |

## Rollback Plan

Greenfield — no existing system. Core Rust modules are standalone; can rehost in Electron if Tauri fails. No data migration needed.

## Dependencies

Rust toolchain, Tauri v2 CLI, Ollama (user-installed), Whisper + Piper models (downloaded at launch), Tavily/SerpAPI key (user-provided).

## Success Criteria

- [ ] Streaming LLM response renders in chat (both providers)
- [ ] Push-to-talk → transcription → LLM → audio playback works end-to-end
- [ ] Custom TOML command triggers and executes with correct security gate
- [ ] Web search returns summarized results inline
- [ ] Conversation history persists across restarts
- [ ] Settings UI switches provider, toggles voice, manages API keys
