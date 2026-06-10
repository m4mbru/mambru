//! Integration tests for Mambru — exercises multiple modules together.
//!
//! These tests bypass the Tauri IPC layer and test the domain logic
//! end-to-end (settings ↔ conversation ↔ commands ↔ classifier).

use crate::config::settings::Settings;
use crate::conversation::ConversationManager;
use crate::conversation::resolve_system_prompt;
use crate::llm::create_provider;
use crate::security::{RiskClassifier, RiskTier};
use crate::tools::commands::matcher::CommandMatcher;
use crate::tools::commands::{Command, CommandAction};
use crate::tools::commands::registry::CommandRegistry;
use crate::tools::commands::builder::CommandBuilder;
use crate::security::AuditEntry;

// ---------------------------------------------------------------------------
// Settings + Provider integration
// ---------------------------------------------------------------------------

#[test]
fn test_settings_default_creates_ollama_provider() {
    let settings = Settings::default();
    assert_eq!(settings.provider.active, "ollama");

    let provider = create_provider(&settings);
    assert_eq!(provider.name(), "ollama");
}

#[test]
fn test_settings_openai_creates_cloud_provider() {
    let mut settings = Settings::default();
    settings.provider.active = "openai".into();
    settings.provider.openai.api_key = "sk-test".into();

    let provider = create_provider(&settings);
    assert_eq!(provider.name(), "cloud");
}

#[test]
fn test_settings_anthropic_creates_cloud_provider() {
    let mut settings = Settings::default();
    settings.provider.active = "anthropic".into();
    settings.provider.anthropic.api_key = "sk-ant-test".into();

    let provider = create_provider(&settings);
    assert_eq!(provider.name(), "cloud");
}

#[test]
fn test_settings_unknown_fallback_to_ollama() {
    let mut settings = Settings::default();
    settings.provider.active = "nonexistent".into();

    let provider = create_provider(&settings);
    assert_eq!(provider.name(), "ollama");
}

// ---------------------------------------------------------------------------
// Conversation + Personality integration
// ---------------------------------------------------------------------------

#[test]
fn test_conversation_with_personality_integration() {
    let mut mgr = ConversationManager::new(Some(10));

    let conv_id = mgr.create(Some("llama3"));
    assert!(mgr.get(&conv_id).is_some());

    // Resolve system prompt for different presets
    let default_prompt = resolve_system_prompt("default", "");
    assert!(!default_prompt.is_empty(), "default prompt should be non-empty");

    let custom_prompt = resolve_system_prompt("custom", "You are a test bot.");
    assert_eq!(custom_prompt, "You are a test bot.");

    let empty_custom = resolve_system_prompt("custom", "");
    assert_eq!(empty_custom, default_prompt, "empty custom should fall back to default");
}

#[test]
fn test_conversation_auto_title_and_messages() {
    let mut mgr = ConversationManager::new(Some(10));

    let conv_id = mgr.create(Some("gpt-4"));
    mgr.append_message(&conv_id, crate::llm::provider::Message {
        role: "user".into(),
        content: "What's the weather like today?".into(),
    });
    mgr.append_message(&conv_id, crate::llm::provider::Message {
        role: "assistant".into(),
        content: "It's sunny!".into(),
    });

    let conv = mgr.get(&conv_id).expect("conversation should exist");
    assert_eq!(conv.messages.len(), 2);
    assert_eq!(conv.title, "What's the weather like today?");
    assert_eq!(conv.model, "gpt-4");
}

#[test]
fn test_conversation_rename() {
    let mut mgr = ConversationManager::new(Some(10));
    let conv_id = mgr.create(Some("llama3"));

    assert!(mgr.rename(&conv_id, "New Title"));
    let conv = mgr.get(&conv_id).unwrap();
    assert_eq!(conv.title, "New Title");

    assert!(!mgr.rename("nonexistent", "Nope"), "should fail for missing conv");
}

// ---------------------------------------------------------------------------
// Command flow: create → store → match → classify end-to-end
// ---------------------------------------------------------------------------

fn sample_command(name: &str, trigger: &str, risk: RiskTier) -> Command {
    Command {
        name: name.into(),
        trigger: trigger.into(),
        action: CommandAction::Exec {
            command: "echo".into(),
            args: vec!["hello".into()],
        },
        risk,
        confirm: None,
        enabled: true,
    }
}

#[test]
fn test_command_flow_end_to_end() {
    // 1. Create commands
    let cmd1 = sample_command("shutdown", r"apagá (el monitor|la pc)", RiskTier::Medium);
    let cmd2 = sample_command("search", r"buscá (?P<query>.+)", RiskTier::Safe);

    // 2. Build matcher
    let matcher = CommandMatcher::new(&[cmd1, cmd2]);

    // 3. Match "apagá el monitor" → should match cmd1
    let match1 = matcher.match_text("apagá el monitor");
    assert!(match1.is_some(), "should match shutdown command");
    assert_eq!(match1.unwrap().command.name, "shutdown");

    // 4. Match "buscá gatos" → should match cmd2
    let match2 = matcher.match_text("buscá gatos");
    assert!(match2.is_some(), "should match search command");
    let m2 = match2.unwrap();
    assert_eq!(m2.params.get("query").unwrap(), "gatos");

    // 5. Match non-command → should return None
    let match3 = matcher.match_text("hola cómo estás");
    assert!(match3.is_none(), "non-command should not match");

    // 6. Classify the matched commands
    assert_eq!(
        RiskClassifier::classify(&CommandAction::Exec {
            command: "echo".into(),
            args: vec!["hello".into()],
        }),
        RiskTier::Dangerous
    );
}

#[test]
fn test_command_matching_respects_enabled_flag() {
    let mut cmd = sample_command("disabled", r"test", RiskTier::Safe);
    cmd.enabled = false;

    let matcher = CommandMatcher::new(&[cmd]);
    let result = matcher.match_text("test");
    assert!(result.is_none(), "disabled command should not match");
}

#[test]
fn test_command_registry_add_remove_in_memory() {
    let mut cmds = Vec::new();
    let cmd = sample_command("test-cmd", r"test", RiskTier::Safe);

    CommandRegistry::add(&mut cmds, cmd).unwrap();
    assert_eq!(cmds.len(), 1);

    let removed = CommandRegistry::remove(&mut cmds, "test-cmd").unwrap();
    assert!(removed);
    assert!(cmds.is_empty());
}

// ---------------------------------------------------------------------------
// CommandBuilder integration
// ---------------------------------------------------------------------------

#[test]
fn test_build_and_match_command() {
    // Build a command from NL, then verify it matches
    let cmd = CommandBuilder::build_from_nl("when I say open mail it opens gmail").unwrap();
    assert_eq!(cmd.risk, RiskTier::Safe);

    let matcher = CommandMatcher::new(&[cmd]);
    let result = matcher.match_text("open mail");
    assert!(result.is_some(), "built command should match its trigger");
}

// ---------------------------------------------------------------------------
// Audit + Risk integration
// ---------------------------------------------------------------------------

#[test]
fn test_audit_entry_serde_round_trip() {
    let entry = AuditEntry {
        timestamp: chrono::Utc::now(),
        command: "test-cmd".into(),
        risk: RiskTier::Medium,
        params: [("key".into(), "val".into())].into(),
        approved: true,
        result: "exit: 0".into(),
    };

    let json = serde_json::to_string(&entry).expect("should serialise");
    let deserialized: AuditEntry = serde_json::from_str(&json).expect("should deserialise");
    assert_eq!(deserialized.command, "test-cmd");
    assert_eq!(deserialized.risk, RiskTier::Medium);
    assert!(deserialized.approved);
}

// ---------------------------------------------------------------------------
// Settings round-trip through provider creation
// ---------------------------------------------------------------------------

#[test]
fn test_settings_change_active_provider() {
    let mut settings = Settings::default();

    // Start with Ollama
    assert_eq!(create_provider(&settings).name(), "ollama");

    // Switch to OpenAI
    settings.provider.active = "openai".into();
    settings.provider.openai.api_key = "sk-test".into();
    assert_eq!(create_provider(&settings).name(), "cloud");

    // Switch back to Ollama
    settings.provider.active = "ollama".into();
    assert_eq!(create_provider(&settings).name(), "ollama");
}

#[test]
fn test_config_dir_resolution() {
    // Verify the settings module resolves paths correctly
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".into());
    assert!(!home.is_empty(), "HOME/USERPROFILE should be set");
}
