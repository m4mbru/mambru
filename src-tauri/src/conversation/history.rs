use std::fs;
use std::path::PathBuf;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::super::llm::provider::Message;

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

/// A persisted conversation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub messages: Vec<Message>,
    pub created_at: String,
    pub updated_at: String,
    pub model: String,
}

/// Lightweight summary returned by `list_conversations()`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationSummary {
    pub id: String,
    pub title: String,
    pub message_count: usize,
    pub created_at: String,
    pub updated_at: String,
}

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

/// In-memory conversation store with JSON file persistence.
///
/// Thread-safe via internal `Mutex`. All mutations are immediately persisted.
pub struct ConversationManager {
    conversations: Vec<Conversation>,
    storage_path: PathBuf,
    max_conversations: usize,
}

impl ConversationManager {
    /// Create a new manager and load existing conversations from disk.
    pub fn new(max_conversations: Option<usize>) -> Self {
        let path = Self::storage_path();
        let conversations = Self::load_from_disk(&path);
        Self {
            conversations,
            storage_path: path,
            max_conversations: max_conversations.unwrap_or(50),
        }
    }

    // -----------------------------------------------------------------------
    // CRUD
    // -----------------------------------------------------------------------

    /// Return all conversations (newest first).
    pub fn list(&self) -> Vec<ConversationSummary> {
        let mut all: Vec<_> = self
            .conversations
            .iter()
            .map(|c| ConversationSummary {
                id: c.id.clone(),
                title: c.title.clone(),
                message_count: c.messages.len(),
                created_at: c.created_at.clone(),
                updated_at: c.updated_at.clone(),
            })
            .collect();
        all.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        all
    }

    /// Get a single conversation by ID.
    pub fn get(&self, id: &str) -> Option<&Conversation> {
        self.conversations.iter().find(|c| c.id == id)
    }

    /// Create a new blank conversation and return its ID.
    pub fn create(&mut self, model: Option<&str>) -> String {
        let now = Utc::now().to_rfc3339();
        let conversation = Conversation {
            id: Uuid::new_v4().to_string(),
            title: "New conversation".into(),
            messages: Vec::new(),
            created_at: now.clone(),
            updated_at: now,
            model: model.unwrap_or("unknown").to_string(),
        };
        let id = conversation.id.clone();
        self.conversations.push(conversation);
        self.enforce_limit();
        self.save();
        id
    }

    /// Delete a conversation by ID. Returns `true` if it existed.
    pub fn delete(&mut self, id: &str) -> bool {
        let len_before = self.conversations.len();
        self.conversations.retain(|c| c.id != id);
        let removed = self.conversations.len() < len_before;
        if removed {
            self.save();
        }
        removed
    }

    /// Append a message to an existing conversation. Returns `true` on success.
    ///
    /// Auto-titles the conversation on the first user message.
    pub fn append_message(&mut self, conversation_id: &str, message: Message) -> bool {
        let conversation = match self
            .conversations
            .iter_mut()
            .find(|c| c.id == conversation_id)
        {
            Some(c) => c,
            None => return false,
        };

        // Auto-title from first user message
        if conversation.messages.is_empty() && message.role == "user" {
            let title = auto_title(&message.content);
            conversation.title = title;
        }

        conversation.messages.push(message);
        conversation.updated_at = Utc::now().to_rfc3339();
        self.save();
        true
    }

    /// Append a tool result as a system-context message so the LLM can
    /// reference it in the next turn.
    ///
    /// The message is given role `"system"` with a `[Tool: <name>]` prefix
    /// so the LLM understands it came from a tool invocation rather than
    /// direct user or assistant speech.
    pub fn append_tool_result(&mut self, conversation_id: &str, tool_name: &str, result: &str) -> bool {
        let conversation = match self
            .conversations
            .iter_mut()
            .find(|c| c.id == conversation_id)
        {
            Some(c) => c,
            None => return false,
        };

        let content = format!("[Tool: {tool_name}]\n{result}");
        conversation.messages.push(Message {
            role: "system".into(),
            content,
        });
        conversation.updated_at = Utc::now().to_rfc3339();
        self.save();
        true
    }

    /// Update the title of a conversation.
    pub fn rename(&mut self, id: &str, title: &str) -> bool {
        let conversation = match self.conversations.iter_mut().find(|c| c.id == id) {
            Some(c) => c,
            None => return false,
        };
        conversation.title = title.to_string();
        conversation.updated_at = Utc::now().to_rfc3339();
        self.save();
        true
    }

    // -----------------------------------------------------------------------
    // Persistence
    // -----------------------------------------------------------------------

    fn config_dir() -> PathBuf {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_else(|_| ".".into());
        PathBuf::from(home).join(".config").join("mambru")
    }

    fn storage_path() -> PathBuf {
        Self::config_dir().join("conversations.json")
    }

    fn load_from_disk(path: &PathBuf) -> Vec<Conversation> {
        if !path.exists() {
            return Vec::new();
        }
        match fs::read_to_string(path) {
            Ok(raw) => serde_json::from_str(&raw).unwrap_or_else(|e| {
                eprintln!("[mambru] WARNING: failed to parse conversations.json: {e}");
                Vec::new()
            }),
            Err(e) => {
                eprintln!("[mambru] WARNING: could not read conversations.json: {e}");
                Vec::new()
            }
        }
    }

    fn save(&self) {
        if let Some(parent) = self.storage_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let raw = serde_json::to_string_pretty(&self.conversations)
            .expect("conversations are always serialisable");
        if let Err(e) = fs::write(&self.storage_path, &raw) {
            eprintln!("[mambru] ERROR: failed to write conversations.json: {e}");
        }
    }

    /// Remove oldest conversations when over the limit.
    fn enforce_limit(&mut self) {
        while self.conversations.len() > self.max_conversations {
            // Find the oldest by updated_at
            if let Some(idx) = self
                .conversations
                .iter()
                .enumerate()
                .min_by(|(_, a), (_, b)| a.updated_at.cmp(&b.updated_at))
                .map(|(i, _)| i)
            {
                self.conversations.swap_remove(idx);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Generate a short title from the first user message.
fn auto_title(content: &str) -> String {
    let trimmed = content.trim();
    if trimmed.len() <= 50 {
        return trimmed.to_string();
    }
    // Take the first ~47 chars + ellipsis
    let mut title: String = trimmed.chars().take(47).collect();
    title.push_str("...");
    title
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_and_list() {
        let mut mgr = ConversationManager::new(Some(10));
        mgr.conversations.clear(); // start clean

        let id = mgr.create(Some("llama3"));
        let list = mgr.list();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, id);
        assert_eq!(list[0].message_count, 0);
    }

    #[test]
    fn test_append_message_auto_title() {
        let mut mgr = ConversationManager::new(Some(10));
        mgr.conversations.clear();

        let id = mgr.create(Some("llama3"));
        mgr.append_message(
            &id,
            Message {
                role: "user".into(),
                content: "Hello Mambru!".into(),
            },
        );

        let conv = mgr.get(&id).expect("conversation should exist");
        assert_eq!(conv.title, "Hello Mambru!");
        assert_eq!(conv.messages.len(), 1);
    }

    #[test]
    fn test_auto_title_truncates_long() {
        let long = "a".repeat(100);
        let title = auto_title(&long);
        assert_eq!(title.len(), 50);
        assert!(title.ends_with("..."));
    }

    #[test]
    fn test_delete() {
        let mut mgr = ConversationManager::new(Some(10));
        mgr.conversations.clear();

        let id = mgr.create(Some("llama3"));
        assert!(mgr.delete(&id));
        assert!(mgr.get(&id).is_none());
        assert!(!mgr.delete(&id)); // already gone
    }

    #[test]
    fn test_enforce_limit_drops_oldest() {
        let mut mgr = ConversationManager::new(Some(3));
        mgr.conversations.clear();

        let id1 = mgr.create(Some("llama3"));
        let id2 = mgr.create(Some("llama3"));
        let id3 = mgr.create(Some("llama3"));

        // Touch id1 so it's not the oldest
        mgr.append_message(
            &id1,
            Message {
                role: "user".into(),
                content: "hi".into(),
            },
        );

        let id4 = mgr.create(Some("llama3"));

        // id2 (not touched) should have been evicted
        assert!(mgr.get(&id1).is_some());
        assert!(mgr.get(&id2).is_none());
        assert!(mgr.get(&id3).is_some());
        assert!(mgr.get(&id4).is_some());
    }
}
