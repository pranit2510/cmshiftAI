#!/bin/bash
#---------------------------------------------------------------------------------------------
#  Copyright (c) cmdshiftAI Team. All rights reserved.
#  Licensed under the MIT License. See License.txt in the project root for license information.
#---------------------------------------------------------------------------------------------

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo -e "${BLUE}🚀 cmdshiftAI Validation Suite${NC}"
echo "=================================="
echo "Project root: $PROJECT_ROOT"
echo ""

# Track overall status
VALIDATION_PASSED=true

# Function to print section headers
print_section() {
    echo ""
    echo -e "${BLUE}📋 $1${NC}"
    echo "----------------------------------------"
}

# Function to print test results
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
        VALIDATION_PASSED=false
    fi
}

# Function to measure time
measure_time() {
    local start_time=$(date +%s%N)
    eval "$1"
    local end_time=$(date +%s%N)
    local duration=$((($end_time - $start_time) / 1000000))
    echo $duration
}

# 1. Check Rust installation
print_section "Checking Rust Installation"

if command -v rustc &> /dev/null; then
    RUST_VERSION=$(rustc --version)
    print_result 0 "Rust installed: $RUST_VERSION"
else
    print_result 1 "Rust not installed"
    echo "Please install Rust from https://rustup.rs/"
    exit 1
fi

if command -v cargo &> /dev/null; then
    CARGO_VERSION=$(cargo --version)
    print_result 0 "Cargo installed: $CARGO_VERSION"
else
    print_result 1 "Cargo not installed"
    exit 1
fi

# 2. Compile Rust components
print_section "Compiling Rust Components"

cd "$PROJECT_ROOT/rust-components"

echo "Building in debug mode..."
if cargo build 2>&1 | grep -q "error"; then
    print_result 1 "Debug build failed"
else
    print_result 0 "Debug build successful"
fi

echo "Building in release mode..."
if cargo build --release 2>&1 | grep -q "error"; then
    print_result 1 "Release build failed"
else
    print_result 0 "Release build successful"
fi

# 3. Run Rust tests
print_section "Running Rust Unit Tests"

if cargo test --quiet; then
    print_result 0 "All Rust tests passed"
else
    print_result 1 "Rust tests failed"
fi

# 4. Verify N-API bindings
print_section "Verifying N-API Bindings"

BINDING_FILE="$PROJECT_ROOT/rust-components/cmdshiftai_core.node"
if [ -f "$BINDING_FILE" ]; then
    print_result 0 "N-API binding file exists"
    
    # Test loading the binding
    cd "$PROJECT_ROOT"
    if node -e "try { require('./rust-components'); console.log('success'); } catch(e) { console.error('failed:', e.message); process.exit(1); }" 2>&1 | grep -q "success"; then
        print_result 0 "N-API binding loads successfully"
    else
        print_result 1 "N-API binding failed to load"
    fi
else
    print_result 1 "N-API binding file not found"
    echo "Run: npm run rust:build"
fi

# 5. Test VS Code startup
print_section "Testing VS Code Startup"

if [ -f "$PROJECT_ROOT/scripts/code.sh" ]; then
    echo "Measuring startup time..."
    
    # Create a test script that starts VS Code and exits
    cat > /tmp/test-startup.sh << 'EOF'
#!/bin/bash
STARTUP_START=$(date +%s%N)
timeout 10 "$1" --version > /dev/null 2>&1
STARTUP_END=$(date +%s%N)
DURATION=$((($STARTUP_END - $STARTUP_START) / 1000000))
echo $DURATION
EOF
    chmod +x /tmp/test-startup.sh
    
    STARTUP_TIME=$(/tmp/test-startup.sh "$PROJECT_ROOT/scripts/code.sh")
    rm /tmp/test-startup.sh
    
    if [ -n "$STARTUP_TIME" ] && [ "$STARTUP_TIME" -lt 2000 ]; then
        print_result 0 "Startup time: ${STARTUP_TIME}ms (<2s target)"
    else
        print_result 1 "Startup time: ${STARTUP_TIME}ms (>2s target)"
    fi
else
    print_result 1 "VS Code launch script not found"
fi

# 6. Memory usage check
print_section "Checking Memory Usage"

# Get current memory usage
if command -v ps &> /dev/null; then
    CURRENT_MEM=$(ps aux | grep -E "node|electron" | awk '{sum += $6} END {print sum/1024}')
    CURRENT_MEM=${CURRENT_MEM%.*}  # Convert to integer
    
    if [ "$CURRENT_MEM" -lt 150 ]; then
        print_result 0 "Memory usage: ${CURRENT_MEM}MB (<150MB target)"
    else
        print_result 1 "Memory usage: ${CURRENT_MEM}MB (>150MB target)"
    fi
else
    echo -e "${YELLOW}⚠️  Could not measure memory usage${NC}"
fi

# 7. Performance benchmarks
print_section "Running Performance Benchmarks"

if [ -f "$PROJECT_ROOT/scripts/benchmark-file-ops.js" ]; then
    echo "Running quick benchmark..."
    cd "$PROJECT_ROOT"
    if timeout 30 node scripts/benchmark-file-ops.js 2>&1 | grep -q "PASS"; then
        print_result 0 "Performance benchmarks passed"
    else
        print_result 1 "Performance benchmarks failed"
    fi
else
    print_result 1 "Benchmark script not found"
fi

# 8. Extension compatibility check
print_section "Extension Compatibility Check"

# Check if key APIs are available
node -e "
const path = require('path');
process.env.VSCODE_DEV = '1';
try {
    // Check for key exports
    const rustComponents = require('$PROJECT_ROOT/rust-components');
    const checks = [
        'RustFileOperations' in rustComponents,
        'SearchEngine' in rustComponents,
        'PerformanceMonitor' in rustComponents,
        typeof rustComponents.isNative === 'function'
    ];
    
    if (checks.every(c => c)) {
        console.log('All APIs available');
        process.exit(0);
    } else {
        console.error('Missing APIs');
        process.exit(1);
    }
} catch (e) {
    console.error('API check failed:', e.message);
    process.exit(1);
}
" 2>&1

if [ $? -eq 0 ]; then
    print_result 0 "Extension APIs available"
else
    print_result 1 "Extension APIs missing"
fi

# 9. Integration test check
print_section "Integration Test Status"

if [ -f "$PROJECT_ROOT/test/integration/rustProvider.test.ts" ]; then
    print_result 0 "Integration tests present"
    
    # Check if tests can be compiled
    cd "$PROJECT_ROOT"
    if npx tsc --noEmit test/integration/rustProvider.test.ts 2>&1 | grep -q "error"; then
        print_result 1 "Integration tests have TypeScript errors"
    else
        print_result 0 "Integration tests compile successfully"
    fi
else
    print_result 1 "Integration tests not found"
fi

# 10. Build artifacts check
print_section "Build Artifacts Check"

REQUIRED_FILES=(
    "rust-components/Cargo.toml"
    "rust-components/src/lib.rs"
    "rust-components/src/file_operations/mod.rs"
    "rust-components/index.js"
    "rust-components/index.d.ts"
    "scripts/build-rust.js"
    "scripts/benchmark-file-ops.js"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$PROJECT_ROOT/$file" ]; then
        print_result 0 "Found: $file"
    else
        print_result 1 "Missing: $file"
    fi
done

# Summary
print_section "Validation Summary"

if [ "$VALIDATION_PASSED" = true ]; then
    echo -e "${GREEN}✅ All validations passed!${NC}"
    echo ""
    echo "cmdshiftAI is ready for development."
    echo ""
    echo "Next steps:"
    echo "  1. Run the full test suite: npm test"
    echo "  2. Run performance benchmarks: node scripts/benchmark-file-ops.js"
    echo "  3. Start development: npm run watch"
    exit 0
else
    echo -e "${RED}❌ Some validations failed${NC}"
    echo ""
    echo "Please fix the issues above before proceeding."
    exit 1
fi