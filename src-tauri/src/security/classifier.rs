//! Risk classification for command execution.
//!
//! Every command is classified into one of three tiers that determines how
//! the system gates execution:
//!
//! * [`Safe`](RiskTier::Safe) — auto-execute without user prompt
//! * [`Medium`](RiskTier::Medium) — show confirmation dialog
//! * [`Dangerous`](RiskTier::Dangerous) — require explicit approval + preview

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// RiskTier
// ---------------------------------------------------------------------------

/// Three-tier risk classification.
///
/// Maps to the `risk` field of a custom command and is also inferred
/// heuristically from the action type when the user does not set it
/// explicitly.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum RiskTier {
    /// Read-only or benign: auto-execute.
    Safe,
    /// Potentially destructive: show a confirmation dialog first.
    Medium,
    /// Full system access: require explicit approval with a preview.
    Dangerous,
}

// ---------------------------------------------------------------------------
// RiskClassifier
// ---------------------------------------------------------------------------

/// Heuristic classifier that maps a command or an action to a risk tier
/// and validates arguments against shell-injection patterns.
pub struct RiskClassifier;

impl RiskClassifier {
    /// Classify a command based on its action and the configured risk hint.
    ///
    /// If the command has an explicit `risk` other than the default, that
    /// value is honoured. Otherwise the action type determines the tier.
    pub fn classify(action: &crate::tools::commands::CommandAction) -> RiskTier {
        match action {
            // Shell execution is inherently Dangerous.
            crate::tools::commands::CommandAction::Exec { .. } => RiskTier::Dangerous,
            // Running an external script is also Dangerous.
            crate::tools::commands::CommandAction::Script { .. } => RiskTier::Dangerous,
            // API calls are Medium by default (network side effects).
            crate::tools::commands::CommandAction::Api { .. } => RiskTier::Medium,
        }
    }

    /// Classify a raw shell command string (used by [`super::CommandExecutor`]
    /// when executing inline shell commands).
    pub fn classify_shell(command: &str) -> RiskTier {
        let lower = command.to_lowercase();
        // Commands that only read or query are Safe.
        let safe_cmds = [
            "dir", "ls", "pwd", "whoami", "date", "time", "echo",
            "type", "cat", "more", "findstr", "grep", "where",
        ];
        if safe_cmds.iter().any(|c| lower.starts_with(c)) {
            return RiskTier::Safe;
        }

        // Commands that modify system state are Dangerous.
        let dangerous_cmds = [
            "rm", "del", "rd", "rmdir", "format", "diskpart",
            "reg", "regedit", "shutdown", "restart", "taskkill",
            "psshutdown", "psexec",
        ];
        if dangerous_cmds.iter().any(|c| lower.starts_with(c)) {
            return RiskTier::Dangerous;
        }

        // Everything else is Medium.
        RiskTier::Medium
    }

    /// Validate that interpolated arguments do not contain shell-injection
    /// patterns.
    ///
    /// Returns `Ok(())` if all arguments pass validation, or `Err` with a
    /// description of the first dangerous pattern found.
    pub fn validate_args(
        _cmd: &crate::tools::commands::Command,
        params: &HashMap<String, String>,
    ) -> Result<(), String> {
        for (key, value) in params {
            if let Some(problem) = Self::check_injection(value) {
                return Err(format!(
                    "Argument `{key}` contains a blocked pattern: {problem}"
                ));
            }
        }
        Ok(())
    }

    /// Check a single value for shell-injection patterns.
    fn check_injection(value: &str) -> Option<&'static str> {
        // Block command chaining / piping
        if value.contains(';') {
            return Some("semicolons are not allowed (`;`)");
        }
        if value.contains('|') {
            return Some("pipe characters are not allowed (`|`)");
        }
        // Block command substitution
        if value.contains("$(") {
            return Some("command substitution `$(...)` is not allowed");
        }
        if value.contains("`") {
            return Some("backticks are not allowed");
        }
        // Block redirection
        if value.contains(">") {
            return Some("output redirection (`>`) is not allowed");
        }
        if value.contains("<") {
            return Some("input redirection (`<`) is not allowed");
        }
        // Block newlines (can inject commands on both Unix and Windows)
        if value.contains('\n') || value.contains('\r') {
            return Some("newlines are not allowed");
        }
        None
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tools::commands::{Command, CommandAction};

    fn make_cmd(action: CommandAction) -> Command {
        Command {
            name: "test".into(),
            trigger: "test".into(),
            action,
            risk: RiskTier::Safe,
            confirm: None,
            enabled: true,
        }
    }

    #[test]
    fn test_exec_action_is_dangerous() {
        let action = CommandAction::Exec {
            command: "rm".into(),
            args: vec!["-rf".into(), "/".into()],
        };
        assert_eq!(RiskClassifier::classify(&action), RiskTier::Dangerous);
    }

    #[test]
    fn test_script_action_is_dangerous() {
        let action = CommandAction::Script {
            path: "script.sh".into(),
            args: vec![],
        };
        assert_eq!(RiskClassifier::classify(&action), RiskTier::Dangerous);
    }

    #[test]
    fn test_api_action_is_medium() {
        let action = CommandAction::Api {
            url: "https://api.example.com".into(),
            method: "GET".into(),
            body: None,
        };
        assert_eq!(RiskClassifier::classify(&action), RiskTier::Medium);
    }

    #[test]
    fn test_validate_clean_args_passes() {
        let mut params = HashMap::new();
        params.insert("app".into(), "firefox".into());
        params.insert("query".into(), "hello world".into());

        let cmd = make_cmd(CommandAction::Exec {
            command: "start".into(),
            args: vec!["{app}".into()],
        });
        assert!(RiskClassifier::validate_args(&cmd, &params).is_ok());
    }

    #[test]
    fn test_semicolon_blocked() {
        let mut params = HashMap::new();
        params.insert("x".into(), "echo hello; rm -rf /".into());
        let cmd = make_cmd(CommandAction::Exec {
            command: "echo".into(),
            args: vec!["{x}".into()],
        });
        let err = RiskClassifier::validate_args(&cmd, &params).unwrap_err();
        assert!(err.contains("semicolon"), "error should mention semicolons");
    }

    #[test]
    fn test_backtick_blocked() {
        let mut params = HashMap::new();
        params.insert("x".into(), "`rm -rf /`".into());
        let cmd = make_cmd(CommandAction::Exec {
            command: "echo".into(),
            args: vec!["{x}".into()],
        });
        assert!(RiskClassifier::validate_args(&cmd, &params).is_err());
    }

    #[test]
    fn test_dollar_paren_blocked() {
        let mut params = HashMap::new();
        params.insert("x".into(), "$(cat /etc/passwd)".into());
        let cmd = make_cmd(CommandAction::Exec {
            command: "echo".into(),
            args: vec!["{x}".into()],
        });
        assert!(RiskClassifier::validate_args(&cmd, &params).is_err());
    }

    #[test]
    fn test_newline_blocked() {
        let mut params = HashMap::new();
        params.insert("x".into(), "hello\nrm -rf /".into());
        let cmd = make_cmd(CommandAction::Exec {
            command: "echo".into(),
            args: vec!["{x}".into()],
        });
        assert!(RiskClassifier::validate_args(&cmd, &params).is_err());
    }

    #[test]
    fn test_classify_shell_safe() {
        assert_eq!(
            RiskClassifier::classify_shell("dir /s"),
            RiskTier::Safe
        );
        assert_eq!(
            RiskClassifier::classify_shell("echo hello"),
            RiskTier::Safe
        );
    }

    #[test]
    fn test_classify_shell_dangerous() {
        assert_eq!(
            RiskClassifier::classify_shell("rm -rf /"),
            RiskTier::Dangerous
        );
        assert_eq!(
            RiskClassifier::classify_shell("shutdown /s"),
            RiskTier::Dangerous
        );
    }

    #[test]
    fn test_classify_shell_medium() {
        assert_eq!(
            RiskClassifier::classify_shell("winget install firefox"),
            RiskTier::Medium
        );
    }

    // ── Additional edge cases ─────────────────────────────────────────

    #[test]
    fn test_pipe_blocked() {
        let mut params = HashMap::new();
        params.insert("x".into(), "echo hello | rm -rf /".into());
        let cmd = make_cmd(CommandAction::Exec {
            command: "echo".into(),
            args: vec!["{x}".into()],
        });
        let err = RiskClassifier::validate_args(&cmd, &params).unwrap_err();
        assert!(err.contains("pipe"), "error should mention pipe");
    }

    #[test]
    fn test_output_redirection_blocked() {
        let mut params = HashMap::new();
        params.insert("x".into(), "echo hello > /dev/null".into());
        let cmd = make_cmd(CommandAction::Exec {
            command: "echo".into(),
            args: vec!["{x}".into()],
        });
        let err = RiskClassifier::validate_args(&cmd, &params).unwrap_err();
        assert!(err.contains("redirection"), "error should mention redirection");
    }

    #[test]
    fn test_input_redirection_blocked() {
        let mut params = HashMap::new();
        params.insert("x".into(), "cat < /etc/passwd".into());
        let cmd = make_cmd(CommandAction::Exec {
            command: "cat".into(),
            args: vec!["{x}".into()],
        });
        let err = RiskClassifier::validate_args(&cmd, &params).unwrap_err();
        assert!(err.contains("redirection"), "error should mention redirection");
    }

    #[test]
    fn test_classify_shell_empty() {
        assert_eq!(
            RiskClassifier::classify_shell(""),
            RiskTier::Medium
        );
    }

    #[test]
    fn test_classify_shell_whitespace() {
        assert_eq!(
            RiskClassifier::classify_shell("  "),
            RiskTier::Medium
        );
    }

    #[test]
    fn test_multiple_injection_patterns_blocks_first() {
        let mut params = HashMap::new();
        params.insert("x".into(), "hello; rm -rf /".into());
        let cmd = make_cmd(CommandAction::Exec {
            command: "echo".into(),
            args: vec!["{x}".into()],
        });
        let err = RiskClassifier::validate_args(&cmd, &params).unwrap_err();
        // Should block semicolons (first detected)
        assert!(err.contains("semicolon"), "error should mention semicolons");
    }

    #[test]
    fn test_all_params_checked_independently() {
        let mut params = HashMap::new();
        params.insert("safe".into(), "hello".into());
        params.insert("bad".into(), "rm -rf /; echo pwned".into());
        let cmd = make_cmd(CommandAction::Exec {
            command: "echo".into(),
            args: vec!["{safe}".into(), "{bad}".into()],
        });
        let err = RiskClassifier::validate_args(&cmd, &params).unwrap_err();
        assert!(err.contains("bad"), "error should reference the bad key");
    }

    #[test]
    fn test_classify_exec_action_is_dangerous() {
        let action = CommandAction::Exec {
            command: "echo".into(),
            args: vec!["hello".into()],
        };
        // All Exec actions are Dangerous regardless of the command
        assert_eq!(RiskClassifier::classify(&action), RiskTier::Dangerous);
    }
}
