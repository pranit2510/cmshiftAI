#![deny(clippy::all)]

use napi_derive::napi;

// Include the main file_operations implementation
mod file_operations;
pub use file_operations::*;

// Other modules
pub mod search_engine;
pub mod performance_monitor;
pub mod ai_orchestrator;

// Re-export performance monitoring
pub use performance_monitor::{PerformanceMonitor, OperationType, RustPerformanceMetrics};

#[napi]
pub struct CmdShiftAI;

#[napi]
impl CmdShiftAI {
    #[napi(constructor)]
    pub fn new() -> Self {
        CmdShiftAI
    }

    #[napi]
    pub async fn get_version(&self) -> String {
        "1.0.0".to_string()
    }
}