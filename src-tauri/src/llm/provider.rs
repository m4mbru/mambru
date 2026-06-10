use async_trait::async_trait;
use futures::Stream;
use serde::{Deserialize, Serialize};
use std::pin::Pin;

// ---------------------------------------------------------------------------
// Core types for the LLM provider abstraction
// ---------------------------------------------------------------------------

/// A dynamic stream of result tokens from an LLM.
pub type ChatStream = Pin<Box<dyn Stream<Item = Result<String, LlmError>> + Send>>;

/// A single message in a chat conversation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    /// One of `"user"`, `"assistant"`, `"system"`.
    pub role: String,
    pub content: String,
}

/// Request payload sent to every provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub messages: Vec<Message>,
    pub model: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub stream: bool,
}

/// Errors that can originate from any provider.
#[derive(Debug, thiserror::Error)]
pub enum LlmError {
    #[error("API error: {0}")]
    Api(String),
    #[error("Request failed: {0}")]
    Request(#[from] reqwest::Error),
    #[error("Provider not configured: {0}")]
    NotConfigured(String),
    #[error("Stream canceled")]
    Canceled,
}

// ---------------------------------------------------------------------------
// Provider trait
// ---------------------------------------------------------------------------

/// Every LLM backend (Ollama, OpenAI, Anthropic) implements this trait.
///
/// # Contract
/// - `chat()` must return a stream of `Result<String, LlmError>`.
/// - The stream may yield any number of tokens and must complete when done.
/// - On error the stream yields `Err(LlmError)` and terminates.
/// - `name()` returns a short identifier for diagnostics / UI.
#[async_trait]
pub trait LLMProvider: Send + Sync {
    /// Send a chat request and return a stream of response tokens.
    async fn chat(&self, request: ChatRequest) -> Result<ChatStream, LlmError>;

    /// Short human-readable provider name (e.g. `"ollama"`, `"openai"`).
    fn name(&self) -> &'static str;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use futures::StreamExt;

    /// A mock provider that returns a fixed stream of tokens.
    struct MockProvider;

    #[async_trait]
    impl LLMProvider for MockProvider {
        async fn chat(&self, _request: ChatRequest) -> Result<ChatStream, LlmError> {
            let stream = futures::stream::iter(vec![
                Ok("Hello ".to_string()),
                Ok("from ".to_string()),
                Ok("Mambru!".to_string()),
            ]);
            Ok(Box::pin(stream))
        }

        fn name(&self) -> &'static str {
            "mock"
        }
    }

    /// Mock provider that always returns an error.
    struct MockErrorProvider;

    #[async_trait]
    impl LLMProvider for MockErrorProvider {
        async fn chat(&self, _request: ChatRequest) -> Result<ChatStream, LlmError> {
            Err(LlmError::Api("simulated error".into()))
        }

        fn name(&self) -> &'static str {
            "mock-error"
        }
    }

    fn make_request() -> ChatRequest {
        ChatRequest {
            messages: vec![Message {
                role: "user".into(),
                content: "Hi".into(),
            }],
            model: None,
            temperature: None,
            max_tokens: None,
            stream: true,
        }
    }

    #[tokio::test]
    async fn test_mock_provider_returns_tokens() {
        let provider = MockProvider;
        let request = make_request();
        let mut stream = provider.chat(request).await.unwrap();

        let mut result = String::new();
        while let Some(token) = stream.next().await {
            result.push_str(&token.unwrap());
        }
        assert_eq!(result, "Hello from Mambru!");
    }

    #[tokio::test]
    async fn test_mock_provider_name() {
        let provider = MockProvider;
        assert_eq!(provider.name(), "mock");
    }

    #[tokio::test]
    async fn test_error_propagates() {
        let provider = MockErrorProvider;
        let request = make_request();
        let result = provider.chat(request).await;

        assert!(result.is_err());
        match result {
            Err(LlmError::Api(msg)) => assert_eq!(msg, "simulated error"),
            _ => panic!("expected LlmError::Api"),
        }
    }

    #[tokio::test]
    async fn test_empty_messages_ok() {
        let provider = MockProvider;
        let request = ChatRequest {
            messages: vec![],
            model: None,
            temperature: None,
            max_tokens: None,
            stream: true,
        };
        let mut stream = provider.chat(request).await.unwrap();
        let mut count = 0;
        while let Some(token) = stream.next().await {
            count += 1;
            assert!(token.is_ok());
        }
        assert_eq!(count, 3, "should yield 3 tokens even with empty messages");
    }

    #[tokio::test]
    async fn test_stream_completes() {
        let provider = MockProvider;
        let request = make_request();
        let mut stream = provider.chat(request).await.unwrap();

        let mut results = Vec::new();
        while let Some(token) = stream.next().await {
            results.push(token.unwrap());
        }
        assert_eq!(results, vec!["Hello ", "from ", "Mambru!"]);
    }

    #[test]
    fn test_chat_request_serialization() {
        let request = make_request();
        let json = serde_json::to_string(&request).expect("should serialise");
        let deserialized: ChatRequest = serde_json::from_str(&json).expect("should deserialise");
        assert_eq!(deserialized.messages.len(), 1);
        assert_eq!(deserialized.messages[0].role, "user");
        assert_eq!(deserialized.messages[0].content, "Hi");
        assert!(deserialized.stream);
    }

    #[test]
    fn test_message_serialization() {
        let msg = Message {
            role: "assistant".into(),
            content: "Hello!".into(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        let deserialized: Message = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.role, "assistant");
        assert_eq!(deserialized.content, "Hello!");
    }
}
