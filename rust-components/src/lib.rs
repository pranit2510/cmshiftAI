#![deny(clippy::all)]

use napi_derive::napi;

// Include the main file_operations implementation
mod file_operations;
pub use file_operations::*;

// Other modules
pub mod search_engine;
pub mod performance_monitor;
pub mod ai_orchestrator;

#[napi]
pub struct CmdShiftAI;

#[napi]
impl CmdShiftAI {
    #[napi(constructor)]
    pub fn new() -> Self {
        // Initialize performance monitoring
        performance_monitor::init();
        
        CmdShiftAI
    }

    #[napi]
    pub async fn get_version(&self) -> String {
        "1.0.0".to_string()
    }
}