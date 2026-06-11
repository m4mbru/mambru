use async_trait::async_trait;
use futures::StreamExt;
use reqwest::Client;
use serde_json::Value;

use super::provider::{ChatRequest, ChatStream, LLMProvider, LlmError};

// ---------------------------------------------------------------------------
// Ollama provider — talks to a local Ollama instance via its
// OpenAI-compatible HTTP API.
// ---------------------------------------------------------------------------

pub struct OllamaProvider {
    client: Client,
    base_url: String,
    model: String,
}

impl OllamaProvider {
    pub fn new(base_url: String, model: String) -> Self {
        Self {
            client: Client::new(),
            base_url,
            model,
        }
    }

    /// Build the request body shared by streaming and non-streaming paths.
    fn build_body(&self, request: &ChatRequest) -> Value {
        serde_json::json!({
            "model": request.model.as_deref().unwrap_or(&self.model),
            "messages": request.messages.iter().map(|m| {
                serde_json::json!({ "role": m.role, "content": m.content })
            }).collect::<Vec<_>>(),
            "stream": request.stream,
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
        })
    }

    /// The endpoint URL (OpenAI-compatible).
    fn url(&self) -> String {
        format!(
            "{}/v1/chat/completions",
            self.base_url.trim_end_matches('/')
        )
    }
}

#[async_trait]
impl LLMProvider for OllamaProvider {
    fn name(&self) -> &'static str {
        "ollama"
    }

    async fn chat(&self, request: ChatRequest) -> Result<ChatStream, LlmError> {
        let url = self.url();
        let body = self.build_body(&request);
        let client = self.client.clone();

        if request.stream {
            Self::streaming_chat(client, url, body).await
        } else {
            Self::non_streaming_chat(client, url, body).await
        }
    }
}

// ---------------------------------------------------------------------------
// Private helpers (behind the trait impl so they can return ChatStream)
// ---------------------------------------------------------------------------

impl OllamaProvider {
    /// Non-streaming path: collect the full response and yield it as a single
    /// item stream so callers don't need to branch.
    /// Log a debug message to the ollama provider log file.
    fn log_ollama(msg: &str) {
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(r"C:\Users\JAJKA\AppData\Roaming\com.mambru.desktop\mambru-ollama.log")
        {
            use std::io::Write;
            let ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let _ = writeln!(f, "[{ts}] {msg}");
        }
    }

    async fn non_streaming_chat(
        client: Client,
        url: String,
        body: Value,
    ) -> Result<ChatStream, LlmError> {
        let resp = client.post(&url).json(&body).send().await?;
        let status = resp.status();
        let text = resp.text().await?;

        Self::log_ollama(&format!("status={status}, text.len()={}", text.len()));
        Self::log_ollama(&format!("raw body: {}", &text[..text.len().min(1000)]));

        let content = extract_content(&text).unwrap_or_default();
        Self::log_ollama(&format!("extract_content returned: len={}, empty={}", content.len(), content.is_empty()));

        let stream = async_stream::stream! {
            yield Ok(content);
        };
        Ok(Box::pin(stream))
    }

    /// Streaming path: parse SSE events and yield each content delta.
    async fn streaming_chat(
        client: Client,
        url: String,
        body: Value,
    ) -> Result<ChatStream, LlmError> {
        let resp = client.post(&url).json(&body).send().await?;

        let stream = async_stream::stream! {
            let mut byte_stream = resp.bytes_stream();
            let mut buf = String::new();

            while let Some(chunk) = byte_stream.next().await {
                let chunk = match chunk {
                    Ok(c) => c,
                    Err(e) => {
                        yield Err(LlmError::Request(e));
                        return;
                    }
                };

                // Accumulate bytes and parse SSE lines
                let chunk_str = String::from_utf8_lossy(&chunk);
                buf.push_str(&chunk_str);

                // Process complete SSE events (delimited by double newline)
                while let Some(pos) = buf.find("\n\n") {
                    let event = buf[..pos].to_string();
                    buf = buf[pos + 2..].to_string();
                    for line in event.lines() {
                        if let Some(delta) = parse_sse_line(line) {
                            yield Ok(delta);
                        }
                    }
                }
            }

            // Process any remaining data in the buffer
            for line in buf.lines() {
                if let Some(delta) = parse_sse_line(line) {
                    yield Ok(delta);
                }
            }
        };

        Ok(Box::pin(stream))
    }
}

// ---------------------------------------------------------------------------
// SSE parsing helpers
// ---------------------------------------------------------------------------

/// Parse a single SSE line from the OpenAI-compatible format:
///
/// ```text
/// data: {"id":"...","choices":[{"delta":{"content":"Hello"}}]}
/// ```
///
/// Returns `Some(content)` if the line contains a content delta, `None` for
/// no-content deltas, `[DONE]` signals, or other non-content events.
fn parse_sse_line(line: &str) -> Option<String> {
    let line = line.trim();

    // Ignore non-data lines or the termination signal
    if !line.starts_with("data: ") || line == "data: [DONE]" {
        return None;
    }

    // Strip the "data: " prefix and parse JSON
    let json_str = &line[6..];
    let value: Value = serde_json::from_str(json_str).ok()?;

    // Navigate to choices[0].delta.content
    let content = value
        .get("choices")?
        .as_array()?
        .first()?
        .get("delta")?
        .get("content")?
        .as_str()?
        .to_string();

    if content.is_empty() {
        None
    } else {
        Some(content)
    }
}

/// Fallback: extract content from a non-streaming JSON response.
fn extract_content(body: &str) -> Option<String> {
    let value: Value = serde_json::from_str(body).ok()?;

    // Try OpenAI format: choices[0].message.content
    if let Some(content) = value
        .get("choices")
        .and_then(|c| c.as_array())
        .and_then(|c| c.first())
        .and_then(|c| c.get("message"))
        .and_then(|c| c.get("content"))
        .and_then(|c| c.as_str())
    {
        return Some(content.to_string());
    }

    // Try Ollama native format: message.content
    if let Some(content) = value
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
    {
        return Some(content.to_string());
    }

    // Try response field (some providers use this)
    if let Some(content) = value.get("response").and_then(|c| c.as_str()) {
        return Some(content.to_string());
    }

    None
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_sse_line_with_content() {
        let line = r#"data: {"id":"1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}"#;
        assert_eq!(parse_sse_line(line), Some("Hello".into()));
    }

    #[test]
    fn test_parse_sse_line_no_content() {
        let line = r#"data: {"id":"1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}"#;
        assert_eq!(parse_sse_line(line), None);
    }

    #[test]
    fn test_parse_sse_line_done_signal() {
        assert_eq!(parse_sse_line("data: [DONE]"), None);
    }

    #[test]
    fn test_parse_sse_line_non_data_line() {
        assert_eq!(parse_sse_line(": heartbeat"), None);
    }

    #[test]
    fn test_extract_content_openai_format() {
        let body = r#"{"choices":[{"message":{"content":"Hello world"}}]}"#;
        assert_eq!(extract_content(body), Some("Hello world".into()));
    }

    #[test]
    fn test_extract_content_ollama_format() {
        let body = r#"{"message":{"content":"Hello from Ollama"}}"#;
        assert_eq!(extract_content(body), Some("Hello from Ollama".into()));
    }

    #[test]
    fn test_extract_content_empty() {
        assert_eq!(extract_content("{}"), None);
        assert_eq!(extract_content("not json"), None);
    }
}
