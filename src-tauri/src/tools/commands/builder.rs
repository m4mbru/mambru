//! AI-assisted command creation from natural language.
//!
//! The [`CommandBuilder`] parses natural-language descriptions into
//! [`Command`] structs, suggests trigger patterns, and automatically
//! detects the risk tier from the action type.
//!
//! # Future
//!
//! In a future phase the LLM itself can interpret user intents like
//! "cuando diga abrí Firefox abrí el navegador" and produce structured
//! command definitions. For v1 we use heuristic rules that cover the
//! most common patterns.

use crate::security::RiskTier;
use crate::tools::commands::{Command, CommandAction};

// ---------------------------------------------------------------------------
// CommandBuilder
// ---------------------------------------------------------------------------

/// Helpers for building commands from natural language descriptions.
pub struct CommandBuilder;

impl CommandBuilder {
    /// Attempt to build a [`Command`] from a natural language description.
    ///
    /// The input is typically what the user typed in the "new command" UI,
    /// e.g. "when I say 'open mail' it opens gmail.com".
    ///
    /// Returns a best-effort [`Command`] that the user can review and
    /// adjust before saving. Some fields (like `name`) may need manual
    /// refinement.
    pub fn build_from_nl(nl_description: &str) -> Result<Command, String> {
        let lower = nl_description.to_lowercase();

        // Try to extract a trigger phrase
        let trigger = Self::suggest_trigger(nl_description);

        // Try to extract the action
        let (action, risk) = Self::suggest_action(&lower)?;

        // Generate a name from the description
        let name = Self::suggest_name(nl_description);

        Ok(Command {
            name,
            trigger,
            action,
            risk,
            confirm: None,
            enabled: true,
        })
    }

    /// Suggest a regex trigger pattern from a description.
    ///
    /// Heuristics:
    /// - If description starts with "when I say X" or "cuando diga X",
    ///   use X as the trigger (with word-boundary anchor).
    /// - Otherwise use the first meaningful phrase as a literal trigger.
    pub fn suggest_trigger(description: &str) -> String {
        let trimmed = description.trim();

        // English patterns
        if let Some(rest) = trimmed
            .strip_prefix("when i say ")
            .or_else(|| trimmed.strip_prefix("when I say "))
        {
            return Self::phrase_to_trigger(rest);
        }
        if let Some(rest) = trimmed
            .strip_prefix("when I say ")
            .or_else(|| trimmed.strip_prefix("when i say "))
        {
            return Self::phrase_to_trigger(rest);
        }

        // Spanish patterns
        if let Some(rest) = trimmed
            .strip_prefix("cuando diga ")
            .or_else(|| trimmed.strip_prefix("cuando digo "))
        {
            return Self::phrase_to_trigger(rest);
        }
        if let Some(rest) = trimmed.strip_prefix("decí ") {
            return Self::phrase_to_trigger(rest);
        }

        // Default: escape the entire input as a literal
        regex::escape(trimmed)
    }

    /// Suggest what action the command should perform.
    ///
    /// Heuristic: look for keywords in the description to infer the action
    /// type and extract the target.
    fn suggest_action(lower: &str) -> Result<(CommandAction, RiskTier), String> {
        // Open / launch an app or URL
        if lower.contains("open ")
            || lower.contains("abrí ")
            || lower.contains("abrir ")
            || lower.contains("launch ")
            || lower.contains("start ")
        {
            // Try to extract the target
            let target = Self::extract_target(lower, &["open ", "abrí ", "abrir ", "launch ", "start "]);
            return Ok((
                CommandAction::Exec {
                    command: "start".into(),
                    args: vec![target],
                },
                RiskTier::Safe,
            ));
        }

        // Search the web
        if lower.contains("search ")
            || lower.contains("buscá ")
            || lower.contains("buscar ")
            || lower.contains("google ")
        {
            return Ok((
                CommandAction::Exec {
                    command: "start".into(),
                    args: vec![
                        "https://google.com/search?q={query}".into(),
                    ],
                },
                RiskTier::Safe,
            ));
        }

        // Run a shell command
        if lower.contains("run ")
            || lower.contains("ejecutá ")
            || lower.contains("execute ")
            || lower.contains("run ")
        {
            let rest = Self::extract_target(lower, &["run ", "ejecutá ", "execute "]);
            return Ok((
                CommandAction::Exec {
                    command: rest,
                    args: vec![],
                },
                RiskTier::Dangerous,
            ));
        }

        // API call
        if lower.contains("api ")
            || lower.contains("fetch ")
            || lower.contains("get ")
        {
            return Ok((
                CommandAction::Api {
                    url: "https://api.example.com/endpoint".into(),
                    method: "GET".into(),
                    body: None,
                },
                RiskTier::Medium,
            ));
        }

        Err(format!(
            "Could not infer an action from: `{lower}`. \
             Try phrases like 'open Firefox', 'search cats', or 'run npm update'."
        ))
    }

    /// Generate a short name from the description.
    fn suggest_name(description: &str) -> String {
        let cleaned = description
            .trim()
            .chars()
            .take(40)
            .collect::<String>()
            .trim()
            .to_string();

        if cleaned.len() <= 30 {
            cleaned
        } else {
            format!("{}...", &cleaned[..27])
        }
    }

    /// Turn a phrase after the trigger prefix into a regex pattern.
    ///
    /// E.g. "open Firefox" → `open (?P<target>Firefox)`.
    /// E.g. "open {app}" → `open (?P<app>\w+)`.
    fn phrase_to_trigger(phrase: &str) -> String {
        let phrase = phrase.trim().trim_matches('.').trim();

        // If the phrase already contains {param} style patterns, preserve them
        if phrase.contains('{') {
            // This is already a template — use as-is with word boundary
            return format!(r"(?i)\b{phrase}\b");
        }

        // Escape the literal parts and wrap in word boundaries
        let escaped = regex::escape(phrase);
        format!(r"(?i)\b{escaped}\b")
    }

    /// Extract the target from a description after removing known verbs.
    fn extract_target(lower: &str, prefixes: &[&str]) -> String {
        for prefix in prefixes {
            if let Some(rest) = lower.strip_prefix(prefix) {
                let trimmed = rest.trim();
                if !trimmed.is_empty() {
                    // Take up to the first clause-ending punctuation
                    let end = trimmed
                        .find(|c: char| c == '.' || c == ',' || c == ';' || c == '!')
                        .unwrap_or(trimmed.len());
                    return trimmed[..end].trim().to_string();
                }
            }
        }
        "{target}".into()
    }

    /// Suggest what params a trigger + action pair expects.
    ///
    /// Examines the action args/URL for `{param}` placeholders and returns
    /// the list of expected parameter names.
    pub fn suggest_params(trigger: &str, action: &CommandAction) -> Vec<String> {
        let mut params: Vec<String> = Vec::new();

        // Check args for {param} patterns
        let param_texts = match action {
            CommandAction::Exec { args, .. } => args.clone(),
            CommandAction::Script { args, .. } => args.clone(),
            CommandAction::Api { url, body, .. } => {
                let mut texts = vec![url.clone()];
                if let Some(b) = body {
                    texts.push(b.clone());
                }
                texts
            }
        };

        for text in &param_texts {
            // Match {parameter_name} patterns
            let re = regex::Regex::new(r"\{(\w+)\}").unwrap();
            for cap in re.captures_iter(text) {
                if let Some(name) = cap.get(1) {
                    let name_str = name.as_str().to_string();
                    if !params.contains(&name_str) {
                        params.push(name_str);
                    }
                }
            }
        }

        // Also extract params from the trigger itself
        let trigger_re = regex::Regex::new(r"\(\?P<(\w+)>").unwrap();
        for cap in trigger_re.captures_iter(trigger) {
            if let Some(name) = cap.get(1) {
                let name_str = name.as_str().to_string();
                if !params.contains(&name_str) {
                    params.push(name_str);
                }
            }
        }

        params
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_open_command() {
        let cmd = CommandBuilder::build_from_nl("when I say open mail it opens gmail").unwrap();
        assert!(cmd.trigger.contains("open"));
        assert!(matches!(cmd.action, CommandAction::Exec { .. }));
        assert_eq!(cmd.risk, RiskTier::Safe);
    }

    #[test]
    fn test_build_search_command() {
        let cmd = CommandBuilder::build_from_nl("cuando diga buscá gatos busca en google").unwrap();
        assert_eq!(cmd.risk, RiskTier::Safe);
    }

    #[test]
    fn test_build_empty_action_returns_error() {
        let err = CommandBuilder::build_from_nl("hello world").unwrap_err();
        assert!(err.contains("Could not infer"));
    }

    #[test]
    fn test_suggest_trigger_english() {
        let trigger = CommandBuilder::suggest_trigger("when I say open Firefox");
        assert!(trigger.contains("open"));
    }

    #[test]
    fn test_suggest_trigger_spanish() {
        let trigger = CommandBuilder::suggest_trigger("cuando diga abrí Firefox");
        assert!(trigger.contains("abrí"));
    }

    #[test]
    fn test_suggest_params_empty() {
        let action = CommandAction::Exec {
            command: "echo".into(),
            args: vec!["hello".into()],
        };
        let params = CommandBuilder::suggest_params("test", &action);
        assert!(params.is_empty());
    }

    #[test]
    fn test_suggest_params_with_placeholders() {
        let action = CommandAction::Exec {
            command: "start".into(),
            args: vec!["https://google.com/search?q={query}".into()],
        };
        let params = CommandBuilder::suggest_params("test (?P<query>.+)", &action);
        assert!(params.contains(&"query".to_string()));
    }

    #[test]
    fn test_suggest_name_truncates() {
        let long = "a".repeat(50);
        let name = CommandBuilder::suggest_name(&long);
        assert!(name.len() <= 30);
    }

    #[test]
    fn test_extract_target() {
        let lower = "open Firefox and search";
        let target = CommandBuilder::extract_target(lower, &["open "]);
        assert_eq!(target, "firefox");
    }
}
