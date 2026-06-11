//! Command registry — load / save / reload `commands.toml`.
//!
//! Commands are persisted as a TOML array at `~/.config/mambru/commands.toml`.
//! The registry loads them on construction and validates each command's
//! trigger regex and action before exposing them to the matcher.

use std::fs;
use std::path::PathBuf;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use super::Command;

// ---------------------------------------------------------------------------
// TOML wrapper
// ---------------------------------------------------------------------------

/// Top-level TOML structure matching the file format.
#[derive(Debug, Serialize, Deserialize)]
struct CommandsFile {
    /// The list of user-defined commands.
    command: Vec<Command>,
}

// ---------------------------------------------------------------------------
// CommandRegistry
// ---------------------------------------------------------------------------

/// In-memory command store backed by `~/.config/mambru/commands.toml`.
///
/// # Thread safety
///
/// `CommandRegistry` contains no interior mutability — the caller is
/// responsible for synchronisation (typically via `Mutex<AppState>`).
#[derive(Debug, Clone)]
pub struct CommandRegistry {
    commands: Vec<Command>,
}

impl CommandRegistry {
    /// Load commands from disk, returning an empty registry if the file
    /// does not exist or cannot be parsed.
    pub fn load() -> Self {
        let path = Self::storage_path();
        if !path.exists() {
            return Self {
                commands: Vec::new(),
            };
        }

        let raw = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[mambru] WARNING: could not read commands.toml: {e}");
                return Self {
                    commands: Vec::new(),
                };
            }
        };

        let parsed: CommandsFile = match toml::from_str(&raw) {
            Ok(f) => f,
            Err(e) => {
                eprintln!("[mambru] WARNING: failed to parse commands.toml: {e}");
                return Self {
                    commands: Vec::new(),
                };
            }
        };

        // Validate each command
        // Capture length BEFORE consuming parsed.command via into_iter().
        let total = parsed.command.len();
        let valid: Vec<Command> = parsed
            .command
            .into_iter()
            .filter(|cmd| {
                if cmd.name.is_empty() {
                    eprintln!("[mambru] WARNING: skipping command with empty name");
                    return false;
                }
                if cmd.trigger.is_empty() {
                    eprintln!(
                        "[mambru] WARNING: command `{}` has empty trigger, skipping",
                        cmd.name
                    );
                    return false;
                }
                // Validate regex compiles
                if regex::Regex::new(&cmd.trigger).is_err() {
                    eprintln!(
                        "[mambru] WARNING: command `{}` has invalid trigger regex, skipping",
                        cmd.name
                    );
                    return false;
                }
                true
            })
            .collect();

        if valid.len() < total {
            eprintln!(
                "[mambru] WARNING: {}/{} commands loaded ({} had errors)",
                valid.len(),
                total,
                total - valid.len()
            );
        }

        Self { commands: valid }
    }

    /// Persist the current command list to disk.
    pub fn save(commands: &[Command]) -> Result<()> {
        let path = Self::storage_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("failed to create config directory `{}`", parent.display()))?;
        }

        let file = CommandsFile {
            command: commands.to_vec(),
        };
        let raw = toml::to_string_pretty(&file)
            .context("failed to serialise commands to TOML")?;
        fs::write(&path, &raw)
            .with_context(|| format!("failed to write commands to `{}`", path.display()))?;

        Ok(())
    }

    /// Add a command to the in-memory list and persist.
    ///
    /// Returns an error if a command with the same name already exists.
    #[allow(dead_code)]
    pub fn add(commands: &mut Vec<Command>, cmd: Command) -> Result<()> {
        if commands.iter().any(|c| c.name == cmd.name) {
            anyhow::bail!("A command named `{}` already exists", cmd.name);
        }
        commands.push(cmd);
        Self::save(commands)
    }

    /// Remove a command by name from the in-memory list and persist.
    ///
    /// Returns `true` if the command existed and was removed.
    pub fn remove(commands: &mut Vec<Command>, name: &str) -> Result<bool> {
        let len_before = commands.len();
        commands.retain(|c| c.name != name);
        let removed = commands.len() < len_before;
        if removed {
            Self::save(commands)?;
        }
        Ok(removed)
    }

    /// Return a reference to the full command list.
    pub fn all(&self) -> &[Command] {
        &self.commands
    }

    /// Replace the in-memory list (used after a reload).
    #[allow(dead_code)]
    pub fn set_commands(&mut self, commands: Vec<Command>) {
        self.commands = commands;
    }

    // -----------------------------------------------------------------------
    // Path helpers
    // -----------------------------------------------------------------------

    fn config_dir() -> PathBuf {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_else(|_| ".".into());
        PathBuf::from(home).join(".config").join("mambru")
    }

    fn storage_path() -> PathBuf {
        Self::config_dir().join("commands.toml")
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::security::RiskTier;
    use crate::tools::commands::CommandAction;
    use std::sync::Mutex;

    /// Serializes registry file access so parallel test runs don't
    /// corrupt the shared ~/.config/mambru/commands.toml.
    static REGISTRY_LOCK: Mutex<()> = Mutex::new(());

    fn sample_cmd(name: &str) -> Command {
        Command {
            name: name.into(),
            trigger: format!("test {name}"),
            action: CommandAction::Exec {
                command: "echo".into(),
                args: vec!["hello".into()],
            },
            risk: RiskTier::Safe,
            confirm: None,
            enabled: true,
        }
    }

    #[test]
    fn test_add_and_remove() {
        let _lock = REGISTRY_LOCK.lock().unwrap();
        let path = CommandRegistry::storage_path();
        let _ = fs::remove_file(&path);

        let mut cmds = Vec::new();
        CommandRegistry::add(&mut cmds, sample_cmd("test1")).unwrap();
        assert_eq!(cmds.len(), 1);

        CommandRegistry::add(&mut cmds, sample_cmd("test2")).unwrap();
        assert_eq!(cmds.len(), 2);

        let removed = CommandRegistry::remove(&mut cmds, "test1").unwrap();
        assert!(removed);
        assert_eq!(cmds.len(), 1);
        assert_eq!(cmds[0].name, "test2");

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn test_add_duplicate_fails() {
        let _lock = REGISTRY_LOCK.lock().unwrap();
        let path = CommandRegistry::storage_path();
        let _ = fs::remove_file(&path);

        let mut cmds = Vec::new();
        CommandRegistry::add(&mut cmds, sample_cmd("dup")).unwrap();
        let err = CommandRegistry::add(&mut cmds, sample_cmd("dup")).unwrap_err();
        assert!(
            err.to_string().contains("already exists"),
            "error should mention duplicate: {}",
            err
        );

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn test_remove_nonexistent() {
        let _lock = REGISTRY_LOCK.lock().unwrap();
        let path = CommandRegistry::storage_path();
        let _ = fs::remove_file(&path);

        let mut cmds = Vec::new();
        CommandRegistry::add(&mut cmds, sample_cmd("exists")).unwrap();
        let removed = CommandRegistry::remove(&mut cmds, "nope").unwrap();
        assert!(!removed);

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn test_toml_round_trip() {
        let _lock = REGISTRY_LOCK.lock().unwrap();
        let path = CommandRegistry::storage_path();
        let _ = fs::remove_file(&path);

        let cmds = vec![sample_cmd("roundtrip")];
        CommandRegistry::save(&cmds).unwrap();

        let registry = CommandRegistry::load();
        assert_eq!(registry.all().len(), 1);
        assert_eq!(registry.all()[0].name, "roundtrip");

        // Cleanup
        let _ = fs::remove_file(&path);
    }
}
