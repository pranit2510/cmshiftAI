# Contributing to cmdshiftAI

Welcome to cmdshiftAI! We're excited that you're interested in contributing to the AI-first code editor that's revolutionizing development workflows.

## 🚀 Quick Start

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/cmshiftAI.git`
3. **Install** dependencies: `npm install`
4. **Build** Rust components: `npm run rust:build`
5. **Compile**: `npm run compile`
6. **Test** your setup: `./scripts/code.sh`

## 🎯 Ways to Contribute

### 🐛 Bug Reports
- Use the bug report template when available
- Include reproduction steps, expected vs actual behavior
- Add performance metrics if relevant
- Test with both Rust and Node.js fallback modes

### ✨ Feature Requests
- Use the feature request template when available
- Explain the use case and expected behavior
- Consider performance implications
- Align with AI-first principles

### 🔧 Code Contributions
- Performance improvements (our specialty!)
- Rust component enhancements
- AI integration features
- Bug fixes
- Documentation improvements

## 🏗 Development Setup

### Prerequisites
- **Node.js** 22.x or higher
- **Rust** 1.70+ with cargo
- **Git**
- **Python** 3.x (for some build tools)

### Environment Setup

```bash
# Clone and setup
git clone https://github.com/pranit2510/cmshiftAI.git
cd cmshiftAI

# Install dependencies
npm install

# Build Rust components
npm run rust:build:debug

# Start development watch mode
npm run watch

# In another terminal, launch cmdshiftAI
export VSCODE_DEV=1
./scripts/code.sh
```

## 📋 Development Guidelines

### 🦀 Rust Components

**Performance Requirements:**
- All Rust operations must be async (use tokio)
- Target specific performance improvements:
  - File reads: 10x improvement
  - File writes: 5x improvement
  - Directory scans: 10x improvement
- Memory overhead <5MB for Rust components

### 📝 TypeScript Components

**Mandatory Fallback Pattern:**
```typescript
// Always implement fallback pattern
async performOperation(input: string): Promise<Result> {
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
    return this.nodeImplementation(input);
}
```

**Requirements:**
- Use strict TypeScript mode
- No `any` types allowed
- Import types from VS Code interfaces
- Use VS Code's dependency injection
- Comprehensive error handling

### 🎨 Code Style

**Git Commit Standards:**
```
type(scope): message

Types:
- feat: New feature
- perf: Performance improvement
- fix: Bug fix
- refactor: Code restructuring
- test: Test additions/changes
- docs: Documentation updates
- build: Build system changes

Example: perf(files): implement Rust-based file operations for 10x speed
```

## 🧪 Testing

### Running Tests

```bash
# Unit tests
npm run test-node

# Browser tests
npm run test-browser

# Performance benchmarks
node scripts/validate-performance.js

# Rust integration tests
node scripts/validate-rust-integration.js
```

## 🚦 Pull Request Process

### Before Submitting

1. **Test thoroughly**:
   ```bash
   npm run compile
   npm run test-node
   node scripts/validate-performance.js
   ```

2. **Performance validation**:
   - Run benchmarks: `node scripts/validate-performance.js`
   - Ensure no performance regressions
   - Document performance improvements

### PR Requirements

- [ ] **Clear description** of changes and motivation
- [ ] **Performance benchmarks** if applicable
- [ ] **Tests added/updated** for new functionality
- [ ] **Documentation updated** if needed
- [ ] **Breaking changes documented**
- [ ] **Follows commit message format**

## 🎯 Performance Focus Areas

### High-Priority Improvements
- **File I/O operations** (current focus)
- **Search and indexing** (next milestone)
- **Memory optimization** (ongoing)
- **Startup time** (continuous improvement)

### Benchmarking
- Always compare against VS Code baseline
- Use consistent test environments
- Document hardware specifications
- Measure real-world scenarios

## 🤖 AI Integration Guidelines

### MCP Protocol
- Follow Model Context Protocol standards
- Implement context-aware features
- Maintain privacy and security
- Document AI capabilities

### AI-First Principles
- Intelligent defaults over configuration
- Context-aware suggestions
- Proactive assistance
- Learning from user patterns

## 📚 Resources

### Documentation
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Rust Integration Guide](docs/RUST_INTEGRATION.md)
- [Performance Guidelines](docs/PERFORMANCE.md)

### Community
- [GitHub Discussions](https://github.com/pranit2510/cmshiftAI/discussions)
- [GitHub Issues](https://github.com/pranit2510/cmshiftAI/issues)

## 🆘 Getting Help

### Development Issues
1. Check [existing issues](https://github.com/pranit2510/cmshiftAI/issues)
2. Search [discussions](https://github.com/pranit2510/cmshiftAI/discussions)
3. Create a new issue with detailed information

### Performance Questions
- Include benchmark results
- Specify hardware configuration
- Provide reproduction steps
- Compare with VS Code baseline

## 🙏 Recognition

Contributors are recognized in:
- Release notes
- Contributors section in README
- Special recognition for significant contributions

---

**Thank you for contributing to cmdshiftAI!** Together, we're building the future of AI-first development tools.

<div align="center">

Made with ❤️ by the cmdshiftAI Community

</div>
