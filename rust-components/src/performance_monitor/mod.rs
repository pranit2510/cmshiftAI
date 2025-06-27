use napi::bindgen_prelude::*;
use napi_derive::napi;
use metrics::{counter, gauge, histogram, describe_counter, describe_gauge, describe_histogram};
use std::time::Instant;
use std::sync::Mutex;
use std::collections::HashMap;

lazy_static::lazy_static! {
    static ref OPERATIONS: Mutex<HashMap<String, OperationMetrics>> = Mutex::new(HashMap::new());
}

pub fn init() {
    // Initialize metrics descriptions
    describe_counter!("cmdshiftai_operations_total", "Total number of operations");
    describe_gauge!("cmdshiftai_memory_usage_bytes", "Current memory usage in bytes");
    describe_histogram!("cmdshiftai_operation_duration_seconds", "Operation duration in seconds");

    // Start background metrics collector
    std::thread::spawn(|| {
        loop {
            collect_system_metrics();
            std::thread::sleep(std::time::Duration::from_secs(10));
        }
    });
}

fn collect_system_metrics() {
    // Collect memory usage
    if let Some(usage) = memory_stats::memory_stats() {
        gauge!("cmdshiftai_memory_usage_bytes").set(usage.physical_mem as f64);
    }
}

#[napi]
pub struct PerformanceMonitor;

#[napi]
impl PerformanceMonitor {
    #[napi(constructor)]
    pub fn new() -> Self {
        PerformanceMonitor
    }

    #[napi]
    pub fn start_operation(&self, name: String) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        let mut ops = OPERATIONS.lock().unwrap();

        ops.insert(id.clone(), OperationMetrics {
            name: name.clone(),
            start_time: Instant::now(),
            memory_before: get_current_memory(),
        });

        counter!("cmdshiftai_operations_total", "operation" => name).increment(1);

        id
    }

    #[napi]
    pub fn end_operation(&self, operation_id: String) -> Result<OperationResult> {
        let mut ops = OPERATIONS.lock().unwrap();

        let metrics = ops.remove(&operation_id)
            .ok_or_else(|| Error::from_reason("Operation not found"))?;

        let duration = metrics.start_time.elapsed();
        let memory_after = get_current_memory();
        let memory_delta = memory_after as i64 - metrics.memory_before as i64;

        histogram!("cmdshiftai_operation_duration_seconds", "operation" => metrics.name.clone())
            .record(duration.as_secs_f64());

        Ok(OperationResult {
            name: metrics.name,
            duration_ms: duration.as_millis() as f64,
            memory_delta_bytes: memory_delta as f64,
        })
    }

    #[napi]
    pub async fn benchmark_file_read(&self, path: String) -> Result<BenchmarkResult> {
        use tokio::fs;
        use std::fs as sync_fs;

        // Benchmark Rust async read
        let rust_start = Instant::now();
        let _ = fs::read(&path).await
            .map_err(|e| Error::from_reason(format!("Failed to read file: {}", e)))?;
        let rust_duration = rust_start.elapsed();

        // Benchmark Node.js sync read (simulated)
        let node_start = Instant::now();
        let _ = sync_fs::read(&path)
            .map_err(|e| Error::from_reason(format!("Failed to read file: {}", e)))?;
        let node_duration = node_start.elapsed();

        Ok(BenchmarkResult {
            rust_time_ms: rust_duration.as_millis() as f64,
            node_time_ms: node_duration.as_millis() as f64,
            speedup: node_duration.as_secs_f64() / rust_duration.as_secs_f64(),
        })
    }

    #[napi]
    pub fn get_metrics_summary(&self) -> MetricsSummary {
        MetricsSummary {
            memory_usage_mb: (get_current_memory() as f64) / 1_048_576.0,
            active_operations: OPERATIONS.lock().unwrap().len() as f64,
        }
    }
}

fn get_current_memory() -> u64 {
    memory_stats::memory_stats()
        .map(|stats| stats.physical_mem as u64)
        .unwrap_or(0)
}

struct OperationMetrics {
    name: String,
    start_time: Instant,
    memory_before: u64,
}

#[napi(object)]
pub struct OperationResult {
    pub name: String,
    pub duration_ms: f64,
    pub memory_delta_bytes: f64,
}

#[napi(object)]
pub struct BenchmarkResult {
    pub rust_time_ms: f64,
    pub node_time_ms: f64,
    pub speedup: f64,
}

#[napi(object)]
pub struct MetricsSummary {
    pub memory_usage_mb: f64,
    pub active_operations: f64,
}
