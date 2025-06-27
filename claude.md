# CmdShiftAI - Claude Code Context

## Project Overview

**CmdShiftAI** is an AI-first development platform built as an enhanced fork of VS Code (Code - OSS) with native Rust performance components. The project aims to revolutionize code editing by combining VS Code's extensive ecosystem with Rust's superior performance and advanced AI capabilities through MCP (Model Context Protocol) integration.

### Current Status: Week 1, Day 1 Complete ✓
- **Day 1**: Project setup, branding, and initial architecture complete
- **Day 2**: File system integration with Rust (current focus)
- **Day 3**: Search implementation
- **Day 4**: Memory optimization
- **Day 5**: Polish and validation

## Three-Layer Architecture

### 1. Presentation Layer (TypeScript/Electron)
- **Base**: VS Code's existing UI and extension system
- **Location**: `/src/vs/workbench/` and `/src/vs/editor/`
- **Purpose**: Maintains 95%+ extension compatibility while providing familiar UI
- **Key Components**:
  - Workbench services and contributions
  - Editor widgets and decorations
  - Extension host and API surface
  - MCP UI integrations

### 2. Performance Layer (Rust/N-API)
- **Base**: Native Rust modules via N-API bindings
- **Location**: `/cli/` directory and future `/rust/` modules
- **Purpose**: 2-10x performance improvements for I/O operations
- **Key Components**:
  - File system operations (10x faster reads)
  - Search and indexing (parallel processing)
  - Memory-mapped file access
  - Native diff algorithms

### 3. Intelligence Layer (MCP/AI)
- **Base**: Model Context Protocol integration
- **Location**: `/src/vs/platform/mcp/` and `/src/vs/workbench/contrib/mcp/`
- **Purpose**: Deep AI integration with multiple model support
- **Key Components**:
  - MCP server management
  - Resource and tool coordination
  - Multi-model routing
  - Context aggregation

## Code Organization Map

```
/Users/pranitsharma/Desktop/CmdShiftAI/vscode/
├── src/
│   ├── vs/
│   │   ├── platform/                 # Core platform services
│   │   │   ├── mcp/                 # MCP platform integration
│   │   │   │   ├── common/          # Shared MCP interfaces
│   │   │   │   ├── node/            # Node.js MCP implementation
│   │   │   │   └── browser/         # Browser MCP implementation
│   │   │   └── files/               # File service (integration point)
│   │   ├── workbench/               # UI and features
│   │   │   ├── contrib/
│   │   │   │   └── mcp/             # MCP UI contributions
│   │   │   └── services/
│   │   │       └── filesConfiguration/ # File service config
│   │   └── base/                    # Base utilities
│   └── cli/                         # Rust CLI implementation
│       ├── Cargo.toml               # Rust dependencies
│       ├── src/
│       │   ├── bin/code/main.rs     # CLI entry point
│       │   └── lib.rs               # Rust library exports
│       └── build.rs                 # Rust build script
├── build/
│   ├── gulpfile.cli.js              # Rust build integration
│   └── lib/compilation.ts           # TypeScript compilation
├── .cursor/
│   ├── mcp.json                     # MCP server configuration
│   └── rules/
│       └── cmdshiftai-rules.mdc     # Project-specific rules
└── claude.md                        # This file
```

## Key Integration Points

### 1. File System Bridge
**Location**: `/src/vs/platform/files/node/diskFileSystemProvider.ts`
**Line**: ~50-100 (service registration)
**Pattern**:
```typescript
export class RustFileSystemProvider extends DiskFileSystemProvider {
    // Rust acceleration with fallback
    async readFile(resource: URI): Promise<Uint8Array> {
        try {
            return await this.rustBridge.readFile(resource.fsPath);
        } catch (e) {
            return super.readFile(resource); // Fallback
        }
    }
}
```

### 2. Service Registration
**Location**: `/src/vs/workbench/services/filesConfiguration/electron-sandbox/filesConfigurationService.ts`
**Line**: ~30-50
**Pattern**:
```typescript
registerSingleton(IFileService, RustFileService, InstantiationType.Eager);
```

### 3. MCP Integration
**Location**: `/src/vs/platform/mcp/common/mcp.ts`
**Key Interfaces**:
- `IMcpService`: Core MCP service interface
- `IMcpServer`: Individual server management
- `IMcpResource`: Resource access patterns
- `IMcpTool`: Tool execution interface

### 4. Rust Bridge
**Location**: `/cli/src/lib.rs` (to be extended)
**Pattern**:
```rust
#[napi]
pub async fn read_file_fast(path: String) -> Result<Buffer> {
    // Tokio-based async file read
    let contents = tokio::fs::read(path).await?;
    Ok(Buffer::from(contents))
}
```

## Performance Targets

| Operation | VS Code (Baseline) | CmdShiftAI Target | Improvement |
|-----------|-------------------|-------------------|-------------|
| Startup Time | 2-4 seconds | <2 seconds | 2x faster |
| Memory Usage | 200MB baseline | <150MB baseline | 25% reduction |
| File Read (1MB) | 10ms | 1ms | 10x faster |
| File Write | 20ms | 4ms | 5x faster |
| Directory Scan (10k files) | 500ms | 50ms | 10x faster |
| Search (regex, 1GB) | 5s | 500ms | 10x faster |
| Extension Load | 100ms/ext | 100ms/ext | Maintained |
| Rust Overhead | N/A | <5MB | Minimal |

## Development Patterns

### TypeScript → Rust Bridge Pattern
```typescript
// TypeScript side
class RustAcceleratedService {
    private rustBridge?: RustBridge;
    
    async performOperation(input: string): Promise<Result> {
        // Always implement fallback
        if (this.rustBridge?.isAvailable()) {
            try {
                const result = await this.rustBridge.operation(input);
                this.telemetryService.log('rust.success', { op: 'operation' });
                return result;
            } catch (e) {
                this.logService.warn('Rust operation failed, using fallback', e);
                this.telemetryService.log('rust.fallback', { op: 'operation' });
            }
        }
        
        // Node.js fallback implementation
        return this.nodeImplementation(input);
    }
}
```

### Rust Implementation Pattern
```rust
use napi::bindgen_prelude::*;
use napi_derive::napi;
use tokio::fs;

#[napi]
pub struct FileOperations;

#[napi]
impl FileOperations {
    #[napi]
    pub async fn read_file_async(&self, path: String) -> Result<Buffer> {
        let contents = fs::read(&path)
            .await
            .map_err(|e| Error::from_reason(e.to_string()))?;
        
        Ok(Buffer::from(contents))
    }
}
```

## Known Constraints and Limitations

### Technical Constraints
1. **Extension Compatibility**: Must maintain 95%+ compatibility with existing VS Code extensions
2. **API Surface**: Cannot modify public VS Code APIs
3. **Memory Budget**: Total overhead must stay under 150MB
4. **Platform Support**: Must work on Windows, macOS, and Linux
5. **Electron Limitations**: Still bound by Chromium process model

### Architectural Constraints
1. **Service Injection**: Must use VS Code's dependency injection system
2. **Async Patterns**: Must maintain Promise-based APIs for compatibility
3. **IPC Overhead**: Electron ↔ Rust communication has serialization cost
4. **Build Complexity**: Dual build system (npm + cargo)

### MCP Constraints
1. **Protocol Version**: Must support MCP v1.0 specification
2. **Security**: MCP servers run in separate processes
3. **Resource Limits**: MCP operations have timeout constraints

## Testing Strategy

### Unit Tests
- **TypeScript**: Jest tests in `/src/vs/*/test/`
- **Rust**: Cargo tests in `/cli/src/` with `#[cfg(test)]`
- **Coverage Target**: 80% for new code

### Integration Tests
- **TS-Rust Bridge**: Test fallback mechanisms
- **MCP Integration**: Test server lifecycle
- **File Operations**: Compare performance vs baseline
- **Location**: `/test/integration/`

### Performance Tests
- **Benchmarks**: Rust criterion benchmarks
- **Profiling**: Chrome DevTools for TypeScript
- **Metrics**: Automated performance regression tests
- **Location**: `/test/performance/`

### Compatibility Tests
- **Extension Testing**: Top 50 VS Code extensions
- **API Coverage**: Validate all public APIs work
- **Platform Testing**: Windows, macOS, Linux CI
- **Location**: `/test/compatibility/`

## Build Commands

### Development
```bash
# Install dependencies
npm install
cd cli && cargo build

# Run in development
npm run watch  # TypeScript compilation
cargo watch -x build  # Rust hot reload
npm run dev  # Launch dev instance

# Run with MCP server
MCP_DEV=1 npm run dev
```

### Production
```bash
# Full build
npm run compile
cd cli && cargo build --release

# Platform-specific packaging
npm run package-win32-x64
npm run package-darwin-x64
npm run package-linux-x64

# Run tests
npm test
cd cli && cargo test
npm run test-integration
```

### MCP Development
```bash
# Start MCP server locally
node cmdshiftai-mcp.js

# Test MCP integration
npm run test-mcp
```

## Recent Architectural Decisions

### 1. Rust Integration via N-API (Not WASM)
**Rationale**: N-API provides better performance and direct system access compared to WASM
**Impact**: 10x file operation improvements possible

### 2. MCP as First-Class Citizen
**Rationale**: AI capabilities need deep integration, not bolt-on
**Impact**: Richer context and better model coordination

### 3. Fallback Pattern Mandatory
**Rationale**: Ensures 100% reliability and extension compatibility
**Impact**: Slightly more code but guaranteed stability

### 4. Maintain VS Code Architecture
**Rationale**: Preserve ecosystem and developer familiarity
**Impact**: Constraints on changes but faster adoption

### 5. Performance Telemetry Built-in
**Rationale**: Data-driven optimization decisions
**Impact**: Can prove performance gains quantitatively

## MCP Integration Benefits

### 1. Multi-Model Support
- Route to different models based on task type
- Local models for privacy-sensitive code
- Cloud models for complex reasoning
- Seamless switching without code changes

### 2. Rich Context Aggregation
- File system state
- Git history and blame
- Symbol definitions
- Runtime information
- Test results

### 3. Tool Execution
- Direct code modifications
- Terminal command execution
- File operations
- Search and replace
- Refactoring operations

### 4. Extensibility
- Extensions can provide MCP servers
- Custom tools and resources
- Domain-specific intelligence

## Success Metrics Checklist

### Performance Metrics ✓
- [ ] Startup time <2 seconds
- [ ] Memory usage <150MB baseline
- [ ] File operations 10x faster
- [ ] Search operations 10x faster
- [ ] Rust overhead <5MB

### Compatibility Metrics ✓
- [ ] 95%+ extension compatibility
- [ ] All public APIs maintained
- [ ] No breaking changes
- [ ] Platform parity (Win/Mac/Linux)

### User Experience Metrics ✓
- [ ] Improved responsiveness feel
- [ ] AI suggestions <100ms
- [ ] Smooth large file handling
- [ ] Instant project search

### Developer Metrics ✓
- [ ] 80% test coverage
- [ ] <5% performance regression
- [ ] Build time <5 minutes
- [ ] Clear error messages

### Adoption Metrics ✓
- [ ] Easy migration from VS Code
- [ ] Better than Cursor performance
- [ ] Positive developer feedback
- [ ] Active community growth

## Important Notes

1. **Always Test Fallbacks**: Every Rust operation must gracefully fall back
2. **Measure Everything**: Performance improvements must be quantified
3. **Preserve Compatibility**: Extension ecosystem is our moat
4. **Think Holistically**: Changes impact the entire system
5. **Security First**: MCP servers run with limited permissions

---

*Last Updated: Week 1, Day 1 - Project setup and architecture complete*