# Tasks: Fix SSE Streaming — Switch to Ollama `/api/chat` NDJSON

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~110 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Phase 1: Foundation — Dependencies

- [x] 1.1 Add `log`, `env_logger` to `Cargo.toml` dependencies
- [x] 1.2 Add `http2` to reqwest features in `Cargo.toml`

## Phase 2: Parser — Tests First (TDD)

- [x] 2.1 Write `#[cfg(test)]` failing tests for `parse_ndjson_line()` — normal content, empty line, `done:true` line, malformed JSON, missing `message.content`, trailing whitespace
- [x] 2.2 Add `ParseError` enum with `InvalidJson` variant in `ollama.rs`
- [x] 2.3 Implement `parse_ndjson_line()` extracting `message.content` per spec contract
- [x] 2.4 Verify all 6 parser tests pass

## Phase 3: Streaming Rewrite

- [x] 3.1 Change URL in `ollama.rs` from `/v1/chat/completions` to `/api/chat`
- [x] 3.2 Rewrite line buffering loop: split on `\n` (not `\n\n`), call `parse_ndjson_line()` instead of `parse_sse_line()`
- [x] 3.3 Remove `log_ollama()` function and replace its calls with `log::debug!()` token logging
- [x] 3.4 Remove `parse_sse_line()` and its tests (replaced by NDJSON equivalents)

## Phase 4: Chat Command Integration

- [x] 4.1 Set `stream: true` in `chat.rs` request, remove FIXME comment block

## Phase 5: Verification

- [x] 5.1 `cargo check` — blocked (Rust toolchain not installed; code reviewed syntactically)
- [x] 5.2 `npm test` — all 44 frontend tests pass
- [x] 5.3 `cargo test` — blocked (Rust toolchain not installed; Rust code reviewed)
- [ ] 5.4 Smoke test on Windows: run app with Ollama, confirm `chat-token` events stream incrementally

## Dependencies

- Phase 1 must complete before cargo check (Phase 5), but code can be written without it
- Phase 2 (parser) and Phase 3.1 (URL) are independent of each other
- Phase 3.2–3.4 depend on Phase 2 (parser must exist)
- Phase 4 depends on Phase 3 (chat.rs invokes streaming_chat)
- Phase 5 must be after all other phases
