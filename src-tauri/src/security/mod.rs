//! Security and permission system.
//!
//! Implements a three-tier risk classification (Safe / Medium / Dangerous)
//! that gates command execution. Each tier determines whether the action
//! runs automatically, requires user confirmation, or needs explicit
//! approval with a command preview.
//!
//! # Submodules
//!
//! - `classifier` — [`RiskTier`] enum, [`RiskClassifier`], argument validation
//! - `audit` — append-only JSON audit log for all executed commands

pub mod audit;
pub mod classifier;

pub use audit::{AuditEntry, AuditLog};
pub use classifier::{RiskClassifier, RiskTier};
