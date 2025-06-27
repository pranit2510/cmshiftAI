use napi::bindgen_prelude::*;
use napi_derive::napi;
use tokio::sync::RwLock;
use std::sync::Arc;
use std::collections::HashMap;

#[napi]
pub struct AIOrchestrator {
    context_store: Arc<RwLock<ContextStore>>,
}

#[napi]
impl AIOrchestrator {
    #[napi(constructor)]
    pub fn new() -> Self {
        AIOrchestrator {
            context_store: Arc::new(RwLock::new(ContextStore::new())),
        }
    }

    #[napi]
    pub async fn prepare_context(&self, request: ContextRequest) -> Result<Context> {
        let start = std::time::Instant::now();

        // Gather file context
        let file_context = if let Some(ref file_path) = request.file_path {
            self.get_file_context(&file_path).await?
        } else {
            FileContext::default()
        };

        // Gather project context
        let project_context = if let Some(ref project_path) = request.project_path {
            self.get_project_context(&project_path).await?
        } else {
            ProjectContext::default()
        };

        // Build symbol context
        let symbol_context = self.get_symbol_context(&request).await?;

        let duration = start.elapsed();
        tracing::debug!("Context preparation took {:?}", duration);

        Ok(Context {
            file: file_context,
            project: project_context,
            symbols: symbol_context,
            metadata: ContextMetadata {
                preparation_time_ms: duration.as_millis() as f64,
                total_tokens: 0.0, // Would be calculated based on tokenizer
            },
        })
    }

    #[napi]
    pub async fn cache_context(&self, key: String, context: Context) -> Result<()> {
        let mut store = self.context_store.write().await;
        store.cache(key, context);
        Ok(())
    }

    #[napi]
    pub async fn get_cached_context(&self, key: String) -> Result<Option<Context>> {
        let store = self.context_store.read().await;
        Ok(store.get(&key))
    }

    #[napi]
    pub async fn route_to_model(&self, task: Task) -> Result<ModelSelection> {
        // Intelligent model routing based on task characteristics
        let model = match task.task_type.as_str() {
            "completion" => {
                if task.complexity < 0.3 {
                    "local-small".to_string()
                } else if task.complexity < 0.7 {
                    "cloud-medium".to_string()
                } else {
                    "cloud-large".to_string()
                }
            }
            "refactoring" => "cloud-large".to_string(),
            "explanation" => "cloud-medium".to_string(),
            "documentation" => "local-medium".to_string(),
            _ => "cloud-medium".to_string(),
        };

        Ok(ModelSelection {
            model_id: model.clone(),
            reasoning: format!("Selected {} based on task type '{}' with complexity {}",
                model, task.task_type, task.complexity),
        })
    }

    async fn get_file_context(&self, file_path: &str) -> Result<FileContext> {
        // In real implementation, would analyze the file
        Ok(FileContext {
            path: file_path.to_string(),
            content_preview: "// File content preview...".to_string(),
            language: "typescript".to_string(),
            imports: vec![],
            exports: vec![],
        })
    }

    async fn get_project_context(&self, project_path: &str) -> Result<ProjectContext> {
        // In real implementation, would analyze the project
        Ok(ProjectContext {
            root_path: project_path.to_string(),
            framework: "vscode-extension".to_string(),
            dependencies: vec!["vscode".to_string()],
            structure_summary: "Standard VS Code extension structure".to_string(),
        })
    }

    async fn get_symbol_context(&self, _request: &ContextRequest) -> Result<SymbolContext> {
        // In real implementation, would use language server
        Ok(SymbolContext {
            definitions: vec![],
            references: vec![],
            types: vec![],
        })
    }
}

struct ContextStore {
    cache: HashMap<String, Context>,
    max_size: usize,
}

impl ContextStore {
    fn new() -> Self {
        ContextStore {
            cache: HashMap::new(),
            max_size: 100,
        }
    }

    fn cache(&mut self, key: String, context: Context) {
        if self.cache.len() >= self.max_size {
            // Simple LRU: remove first (oldest) entry
            if let Some(first_key) = self.cache.keys().next().cloned() {
                self.cache.remove(&first_key);
            }
        }
        self.cache.insert(key, context);
    }

    fn get(&self, key: &str) -> Option<Context> {
        self.cache.get(key).cloned()
    }
}

#[napi(object)]
pub struct ContextRequest {
    pub file_path: Option<String>,
    pub project_path: Option<String>,
    pub cursor_position: Option<Position>,
    pub selected_text: Option<String>,
    pub include_symbols: Option<bool>,
}

#[napi(object)]
pub struct Position {
    pub line: f64,
    pub column: f64,
}

#[napi(object)]
#[derive(Clone)]
pub struct Context {
    pub file: FileContext,
    pub project: ProjectContext,
    pub symbols: SymbolContext,
    pub metadata: ContextMetadata,
}

#[napi(object)]
#[derive(Clone, Default)]
pub struct FileContext {
    pub path: String,
    pub content_preview: String,
    pub language: String,
    pub imports: Vec<String>,
    pub exports: Vec<String>,
}

#[napi(object)]
#[derive(Clone, Default)]
pub struct ProjectContext {
    pub root_path: String,
    pub framework: String,
    pub dependencies: Vec<String>,
    pub structure_summary: String,
}

#[napi(object)]
#[derive(Clone, Default)]
pub struct SymbolContext {
    pub definitions: Vec<String>,
    pub references: Vec<String>,
    pub types: Vec<String>,
}

#[napi(object)]
#[derive(Clone)]
pub struct ContextMetadata {
    pub preparation_time_ms: f64,
    pub total_tokens: f64,
}

#[napi(object)]
pub struct Task {
    pub task_type: String,
    pub complexity: f64,
    pub context_size: f64,
    pub requires_web: bool,
}

#[napi(object)]
pub struct ModelSelection {
    pub model_id: String,
    pub reasoning: String,
}
