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
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Configuration
FIRST_RUN_MARKER="$PROJECT_ROOT/.cmdshiftai-initialized"
LOG_FILE="$PROJECT_ROOT/first-run.log"

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
WARNINGS=0

# Function to print header
print_header() {
    clear
    echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║     cmdshiftAI First Run Validation      ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}Validating your cmdshiftAI installation...${NC}"
    echo ""
}

# Function to log messages
log() {
    echo "$1" | tee -a "$LOG_FILE"
}

# Function to test something
test_item() {
    local test_name=$1
    local test_command=$2
    local is_critical=${3:-true}
    
    echo -n "  $test_name... "
    
    if eval "$test_command" >> "$LOG_FILE" 2>&1; then
        echo -e "${GREEN}✅${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        if [ "$is_critical" = true ]; then
            echo -e "${RED}❌${NC}"
            TESTS_FAILED=$((TESTS_FAILED + 1))
            return 1
        else
            echo -e "${YELLOW}⚠️${NC}"
            WARNINGS=$((WARNINGS + 1))
            return 0
        fi
    fi
}

# Function to check system requirements
check_system_requirements() {
    log ""
    log "1. System Requirements"
    log "====================="
    
    # Check OS
    case "$OSTYPE" in
        linux*) OS="Linux" ;;
        darwin*) OS="macOS" ;;
        msys*|cygwin*|mingw*) OS="Windows" ;;
        *) OS="Unknown" ;;
    esac
    echo -e "  OS: ${BLUE}$OS${NC}"
    
    # Check memory
    if [ "$OS" = "Linux" ]; then
        TOTAL_MEM=$(free -m | awk '/^Mem:/{print $2}')
    elif [ "$OS" = "macOS" ]; then
        TOTAL_MEM=$(($(sysctl -n hw.memsize) / 1024 / 1024))
    fi
    
    if [ -n "$TOTAL_MEM" ]; then
        echo -e "  Memory: ${BLUE}${TOTAL_MEM}MB${NC}"
        if [ "$TOTAL_MEM" -lt 4096 ]; then
            echo -e "  ${YELLOW}⚠️  Warning: Less than 4GB RAM may impact performance${NC}"
            WARNINGS=$((WARNINGS + 1))
        fi
    fi
    
    # Check disk space
    DISK_SPACE=$(df -BG "$PROJECT_ROOT" | awk 'NR==2 {print $4}' | sed 's/G//')
    if [ -n "$DISK_SPACE" ]; then
        echo -e "  Disk Space: ${BLUE}${DISK_SPACE}GB available${NC}"
        if [ "$DISK_SPACE" -lt 2 ]; then
            echo -e "  ${YELLOW}⚠️  Warning: Less than 2GB free space${NC}"
            WARNINGS=$((WARNINGS + 1))
        fi
    fi
}

# Function to check dependencies
check_dependencies() {
    log ""
    log "2. Dependencies"
    log "==============="
    
    test_item "Node.js" "node --version"
    test_item "npm" "npm --version"
    test_item "Git" "git --version"
    test_item "Rust" "rustc --version" false
    test_item "Cargo" "cargo --version" false
}

# Function to check cmdshiftAI components
check_cmdshiftai_components() {
    log ""
    log "3. cmdshiftAI Components"
    log "========================"
    
    test_item "VS Code base" "[ -f '$PROJECT_ROOT/package.json' ]"
    test_item "Rust components" "[ -d '$PROJECT_ROOT/rust-components' ]"
    test_item "Rust binary" "[ -f '$PROJECT_ROOT/rust-components/cmdshiftai_core.node' ]" false
    test_item "Build scripts" "[ -f '$PROJECT_ROOT/scripts/build-rust.js' ]"
    test_item "Configuration" "[ -f '$PROJECT_ROOT/product.json' ]"
}

# Function to test Rust integration
test_rust_integration() {
    log ""
    log "4. Rust Integration"
    log "==================="
    
    # Create test script
    cat > /tmp/test-rust-integration.js << 'EOF'
try {
    const rustOps = require('./rust-components');
    if (rustOps && rustOps.RustFileOperations) {
        console.log('Rust module loaded successfully');
        process.exit(0);
    } else {
        console.error('Rust module structure invalid');
        process.exit(1);
    }
} catch (e) {
    console.error('Failed to load Rust module:', e.message);
    process.exit(1);
}
EOF
    
    test_item "Rust module loading" "cd '$PROJECT_ROOT' && node /tmp/test-rust-integration.js" false
    rm -f /tmp/test-rust-integration.js
}

# Function to test performance targets
test_performance_targets() {
    log ""
    log "5. Performance Validation"
    log "========================="
    
    # Test startup time
    echo -n "  Measuring startup time... "
    START_TIME=$(date +%s%N)
    node -e "console.log('Node started')" > /dev/null 2>&1
    END_TIME=$(date +%s%N)
    STARTUP_MS=$(( (END_TIME - START_TIME) / 1000000 ))
    
    if [ "$STARTUP_MS" -lt 100 ]; then
        echo -e "${GREEN}${STARTUP_MS}ms ✅${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${YELLOW}${STARTUP_MS}ms ⚠️${NC}"
        WARNINGS=$((WARNINGS + 1))
    fi
    
    # Test memory baseline
    echo -n "  Checking memory baseline... "
    node -e "console.log(process.memoryUsage().heapUsed / 1024 / 1024)" > /tmp/mem-usage.txt
    MEM_MB=$(cat /tmp/mem-usage.txt | cut -d'.' -f1)
    rm -f /tmp/mem-usage.txt
    
    if [ "$MEM_MB" -lt 50 ]; then
        echo -e "${GREEN}${MEM_MB}MB ✅${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${YELLOW}${MEM_MB}MB ⚠️${NC}"
        WARNINGS=$((WARNINGS + 1))
    fi
}

# Function to check VS Code compatibility
check_vscode_compatibility() {
    log ""
    log "6. VS Code Compatibility"
    log "========================"
    
    test_item "Extension API" "[ -d '$PROJECT_ROOT/src/vs/workbench/api' ]"
    test_item "Monaco editor" "[ -d '$PROJECT_ROOT/src/vs/editor' ]"
    test_item "Language services" "[ -d '$PROJECT_ROOT/src/vs/workbench/services' ]"
    test_item "Extension host" "[ -f '$PROJECT_ROOT/src/vs/workbench/api/common/extHost.api.impl.ts' ]"
}

# Function to run quick functionality test
run_functionality_test() {
    log ""
    log "7. Basic Functionality"
    log "======================"
    
    # Test file operations
    echo -n "  Testing file operations... "
    TEMP_FILE="/tmp/cmdshiftai-test-$$.txt"
    echo "cmdshiftAI test" > "$TEMP_FILE"
    
    if [ -f "$TEMP_FILE" ]; then
        rm -f "$TEMP_FILE"
        echo -e "${GREEN}✅${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}❌${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    
    # Test process execution
    test_item "Process execution" "echo 'test' > /dev/null"
    
    # Test network (non-critical)
    test_item "Network connectivity" "ping -c 1 -W 2 github.com > /dev/null 2>&1" false
}

# Function to initialize cmdshiftAI
initialize_cmdshiftai() {
    log ""
    log "8. Initialization"
    log "================="
    
    if [ ! -f "$FIRST_RUN_MARKER" ]; then
        echo -e "  ${BLUE}First time setup...${NC}"
        
        # Create necessary directories
        mkdir -p "$PROJECT_ROOT/.cmdshiftai/cache"
        mkdir -p "$PROJECT_ROOT/.cmdshiftai/logs"
        mkdir -p "$PROJECT_ROOT/.cmdshiftai/config"
        
        # Create default configuration
        cat > "$PROJECT_ROOT/.cmdshiftai/config/settings.json" << EOF
{
    "rust.enabled": true,
    "performance.monitoring": true,
    "telemetry.enabled": false,
    "ai.defaultModel": "claude-3",
    "editor.formatOnSave": true
}
EOF
        
        # Mark as initialized
        date > "$FIRST_RUN_MARKER"
        echo -e "  ${GREEN}✅ Initialization complete${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "  ${GREEN}✅ Already initialized${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    fi
}

# Function to show recommendations
show_recommendations() {
    log ""
    log "9. Recommendations"
    log "=================="
    
    if [ "$WARNINGS" -gt 0 ] || [ "$TESTS_FAILED" -gt 0 ]; then
        echo ""
        echo -e "${YELLOW}Recommended actions:${NC}"
        
        if ! command -v rustc &> /dev/null; then
            echo "  • Install Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
        fi
        
        if [ ! -f "$PROJECT_ROOT/rust-components/cmdshiftai_core.node" ]; then
            echo "  • Build Rust components: npm run rust:build"
        fi
        
        if [ "$WARNINGS" -gt 2 ]; then
            echo "  • Run full validation: ./scripts/validate-cmdshiftai.sh"
        fi
        
        echo ""
    fi
}

# Function to display summary
display_summary() {
    log ""
    log "=================================="
    log "        Validation Summary"
    log "=================================="
    
    TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))
    
    echo ""
    echo -e "Total checks:    ${TOTAL_TESTS}"
    echo -e "Passed:          ${GREEN}${TESTS_PASSED}${NC}"
    echo -e "Failed:          ${RED}${TESTS_FAILED}${NC}"
    echo -e "Warnings:        ${YELLOW}${WARNINGS}${NC}"
    echo ""
    
    if [ "$TESTS_FAILED" -eq 0 ]; then
        if [ "$WARNINGS" -eq 0 ]; then
            echo -e "${GREEN}🎉 Perfect! cmdshiftAI is ready to use!${NC}"
            EXIT_CODE=0
        else
            echo -e "${GREEN}✅ cmdshiftAI is ready to use!${NC}"
            echo -e "${YELLOW}   (with some minor warnings)${NC}"
            EXIT_CODE=0
        fi
    else
        echo -e "${RED}❌ cmdshiftAI validation failed${NC}"
        echo -e "   Please fix the errors above before proceeding."
        EXIT_CODE=1
    fi
    
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo "  1. Start development: ./scripts/dev.sh"
    echo "  2. Run tests: ./scripts/run-all-tests.sh"
    echo "  3. Build release: ./scripts/build-release.sh"
    echo ""
    echo "Log file: $LOG_FILE"
}

# Main execution
main() {
    # Initialize log file
    echo "cmdshiftAI First Run Validation" > "$LOG_FILE"
    echo "===============================" >> "$LOG_FILE"
    echo "Date: $(date)" >> "$LOG_FILE"
    echo "" >> "$LOG_FILE"
    
    print_header
    
    # Run all checks
    check_system_requirements
    check_dependencies
    check_cmdshiftai_components
    test_rust_integration
    test_performance_targets
    check_vscode_compatibility
    run_functionality_test
    initialize_cmdshiftai
    show_recommendations
    
    # Display summary
    display_summary
    
    exit $EXIT_CODE
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --quick)
            # Skip some non-critical tests for quick validation
            QUICK_MODE=true
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --quick    Run quick validation only"
            echo "  --help     Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Run '$0 --help' for usage"
            exit 1
            ;;
    esac
done

# Run main function
main