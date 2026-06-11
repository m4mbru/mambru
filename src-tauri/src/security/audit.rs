//! Append-only audit log for command execution.
//!
//! Every command execution (whether approved, rejected, or auto-executed) is
//! recorded as a JSON line in `~/.config/mambru/audit.jsonl`.
//!
//! The log is **append-only** — entries are never modified or deleted by the
//! application. The user may delete the file manually, but the audit module
//! itself never truncates or rewrites existing entries.

use std::fs;
use std::io::Write;
use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::classifier::RiskTier;

// ---------------------------------------------------------------------------
// AuditEntry
// ---------------------------------------------------------------------------

/// A single recorded command execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    /// ISO 8601 timestamp of the execution.
    pub timestamp: DateTime<Utc>,
    /// The command name or the raw shell command that was executed.
    pub command: String,
    /// Risk tier at the time of classification.
    pub risk: RiskTier,
    /// Parameters that were interpolated (empty if none).
    pub params: HashMap<String, String>,
    /// Whether the execution was approved by the user.
    /// `true` = approved and ran, `false` = rejected/denied.
    pub approved: bool,
    /// Exit status or outcome description.
    /// For successful executions: `"exit: 0"`.
    /// For failures: `"exit: <code>"` or `"error: <description>"`.
    /// For rejected executions: `"rejected"`.
    pub result: String,
}

// ---------------------------------------------------------------------------
// AuditLog
// ---------------------------------------------------------------------------

/// Append-only audit log persisted as JSON lines.
pub struct AuditLog;

impl AuditLog {
    /// Return the path to the audit log file.
    pub fn path() -> PathBuf {
        Self::config_dir().join("audit.jsonl")
    }

    /// Append a single entry to the audit log.
    ///
    /// Creates the parent directory and the file if they do not exist.
    /// Always opens in append mode so previous entries are never touched.
    pub fn append(entry: &AuditEntry) -> Result<(), String> {
        let path = Self::path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("failed to create audit directory: {e}"))?;
        }

        let line =
            serde_json::to_string(entry).map_err(|e| format!("failed to serialise audit entry: {e}"))?;

        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|e| format!("failed to open audit log: {e}"))?;

        writeln!(file, "{line}")
            .map_err(|e| format!("failed to write audit entry: {e}"))?;

        Ok(())
    }

    /// Read the most recent `limit` entries (newest first).
    #[allow(dead_code)]
    pub fn list(limit: usize) -> Result<Vec<AuditEntry>, String> {
        let path = Self::path();
        if !path.exists() {
            return Ok(Vec::new());
        }

        let content =
            fs::read_to_string(&path).map_err(|e| format!("failed to read audit log: {e}"))?;

        let mut entries: Vec<AuditEntry> = content
            .lines()
            .filter_map(|line| {
                if line.trim().is_empty() {
                    return None;
                }
                serde_json::from_str(line).ok()
            })
            .collect();

        // Newest first
        entries.reverse();
        entries.truncate(limit);
        Ok(entries)
    }

    /// Return the total number of entries in the log.
    #[allow(dead_code)]
    pub fn count() -> Result<usize, String> {
        let path = Self::path();
        if !path.exists() {
            return Ok(0);
        }
        let content = fs::read_to_string(&path)
            .map_err(|e| format!("failed to read audit log: {e}"))?;
        Ok(content.lines().filter(|l| !l.trim().is_empty()).count())
    }

    /// Resolve the config directory (`~/.config/mambru`).
    fn config_dir() -> PathBuf {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_else(|_| ".".into());
        PathBuf::from(home).join(".config").join("mambru")
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    /// Serializes audit file access so parallel test runs don't
    /// interfere with each other (all tests share ~/.config/mambru/audit.jsonl).
    static AUDIT_LOCK: Mutex<()> = Mutex::new(());

    fn sample_entry() -> AuditEntry {
        AuditEntry {
            timestamp: Utc::now(),
            command: "abrir firefox".into(),
            risk: RiskTier::Safe,
            params: [("app".into(), "firefox".into())].into(),
            approved: true,
            result: "exit: 0".into(),
        }
    }

    #[test]
    fn test_append_and_list() {
        let _lock = AUDIT_LOCK.lock().unwrap();
        let path = AuditLog::path();
        // Clean up any previous test file
        let _ = fs::remove_file(&path);

        let entry = sample_entry();
        AuditLog::append(&entry).unwrap();

        let entries = AuditLog::list(10).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].command, "abrir firefox");
        assert!(entries[0].approved);

        // Cleanup
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn test_list_empty_when_no_file() {
        let _lock = AUDIT_LOCK.lock().unwrap();
        let path = AuditLog::path();
        let _ = fs::remove_file(&path);

        let entries = AuditLog::list(10).unwrap();
        assert!(entries.is_empty());
    }

    #[test]
    fn test_count() {
        let _lock = AUDIT_LOCK.lock().unwrap();
        let path = AuditLog::path();
        let _ = fs::remove_file(&path);

        assert_eq!(AuditLog::count().unwrap(), 0);

        AuditLog::append(&sample_entry()).unwrap();
        assert_eq!(AuditLog::count().unwrap(), 1);

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn test_list_respects_limit() {
        let _lock = AUDIT_LOCK.lock().unwrap();
        let path = AuditLog::path();
        let _ = fs::remove_file(&path);

        for _ in 0..5 {
            AuditLog::append(&sample_entry()).unwrap();
        }

        let entries = AuditLog::list(3).unwrap();
        assert_eq!(entries.len(), 3);

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn test_rejected_entry() {
        let _lock = AUDIT_LOCK.lock().unwrap();
        let path = AuditLog::path();
        let _ = fs::remove_file(&path);

        let entry = AuditEntry {
            approved: false,
            result: "rejected".into(),
            ..sample_entry()
        };
        AuditLog::append(&entry).unwrap();

        let entries = AuditLog::list(10).unwrap();
        assert!(!entries[0].approved);
        assert_eq!(entries[0].result, "rejected");

        let _ = fs::remove_file(&path);
    }
}
