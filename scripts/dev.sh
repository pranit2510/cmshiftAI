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
ENABLE_HOT_RELOAD=${ENABLE_HOT_RELOAD:-true}
ENABLE_PERF_MONITOR=${ENABLE_PERF_MONITOR:-true}
RUST_WATCH=${RUST_WATCH:-true}
VERBOSE=${VERBOSE:-false}

# PID tracking for cleanup
PIDS=()

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Cleaning up development processes...${NC}"
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done
    exit 0
}

trap cleanup EXIT INT TERM

# Function to print header
print_header() {
    clear
    echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║     cmdshiftAI Development Mode          ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}Project:${NC} $PROJECT_ROOT"
    echo -e "${BLUE}Node:${NC}    $(node --version)"
    echo -e "${BLUE}Rust:${NC}    $(rustc --version | cut -d' ' -f2)"
    echo ""
}

# Function to check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js not found${NC}"
        exit 1
    fi
    
    # Check Rust
    if ! command -v cargo &> /dev/null; then
        echo -e "${RED}❌ Rust not found${NC}"
        exit 1
    fi
    
    # Check cargo-watch for hot reload
    if [ "$RUST_WATCH" = true ] && ! command -v cargo-watch &> /dev/null; then
        echo -e "${YELLOW}Installing cargo-watch for hot reload...${NC}"
        cargo install cargo-watch
    fi
    
    echo -e "${GREEN}✅ All prerequisites met${NC}\n"
}

# Function to build Rust components
build_rust() {
    echo -e "${BLUE}Building Rust components (debug mode)...${NC}"
    cd "$PROJECT_ROOT/rust-components"
    
    if [ "$VERBOSE" = true ]; then
        cargo build
    else
        cargo build --quiet
    fi
    
    # Copy the built library
    cd "$PROJECT_ROOT"
    node scripts/build-rust.js --debug
    
    echo -e "${GREEN}✅ Rust components built${NC}\n"
}

# Function to start Rust watcher
start_rust_watcher() {
    if [ "$RUST_WATCH" = true ]; then
        echo -e "${BLUE}Starting Rust component watcher...${NC}"
        cd "$PROJECT_ROOT/rust-components"
        
        # Create a watch script for hot reload
        cat > /tmp/rust-watch.sh << 'EOF'
#!/bin/bash
echo -e "\033[0;33mRust files changed, rebuilding...\033[0m"
if cargo build --quiet; then
    cd ..
    node scripts/build-rust.js --debug --quiet
    echo -e "\033[0;32m✅ Rust rebuild complete\033[0m"
    
    # Send reload signal if cmdshiftAI is running
    if [ -f /tmp/cmdshiftai.pid ]; then
        kill -USR1 $(cat /tmp/cmdshiftai.pid) 2>/dev/null || true
    fi
else
    echo -e "\033[0;31m❌ Rust build failed\033[0m"
fi
EOF
        chmod +x /tmp/rust-watch.sh
        
        cargo-watch -x 'check' -s /tmp/rust-watch.sh &
        RUST_WATCH_PID=$!
        PIDS+=($RUST_WATCH_PID)
        echo -e "${GREEN}✅ Rust watcher started (PID: $RUST_WATCH_PID)${NC}\n"
    fi
}

# Function to start TypeScript watcher
start_typescript_watcher() {
    echo -e "${BLUE}Starting TypeScript watcher...${NC}"
    cd "$PROJECT_ROOT"
    
    npm run watch &
    TS_WATCH_PID=$!
    PIDS+=($TS_WATCH_PID)
    
    echo -e "${GREEN}✅ TypeScript watcher started (PID: $TS_WATCH_PID)${NC}\n"
}

# Function to start performance monitor
start_perf_monitor() {
    if [ "$ENABLE_PERF_MONITOR" = true ]; then
        echo -e "${BLUE}Starting performance monitor...${NC}"
        
        # Create performance monitoring script
        cat > /tmp/perf-monitor.js << 'EOF'
const { PerformanceMonitor } = require('./rust-components');
const fs = require('fs');
const path = require('path');

const monitor = new PerformanceMonitor();
const logFile = path.join(__dirname, 'dev-performance.log');

setInterval(() => {
    const stats = monitor.getMetricsSummary();
    const timestamp = new Date().toISOString();
    const log = `${timestamp} | Memory: ${stats.memoryUsageMb.toFixed(2)}MB | Active Ops: ${stats.activeOperations}\n`;
    
    fs.appendFileSync(logFile, log);
    
    // Alert if memory usage is high
    if (stats.memoryUsageMb > 200) {
        console.error('\x1b[31m⚠️  High memory usage:', stats.memoryUsageMb.toFixed(2), 'MB\x1b[0m');
    }
}, 5000);

console.log('Performance monitor started. Logs: dev-performance.log');
EOF
        
        cd "$PROJECT_ROOT"
        node /tmp/perf-monitor.js &
        PERF_PID=$!
        PIDS+=($PERF_PID)
        
        echo -e "${GREEN}✅ Performance monitor started (PID: $PERF_PID)${NC}\n"
    fi
}

# Function to launch cmdshiftAI
launch_cmdshiftai() {
    echo -e "${MAGENTA}Launching cmdshiftAI...${NC}"
    cd "$PROJECT_ROOT"
    
    # Set development environment variables
    export VSCODE_DEV=1
    export NODE_ENV=development
    export CMDSHIFTAI_DEV=1
    export RUST_LOG=debug
    
    # Enable performance tracking
    if [ "$ENABLE_PERF_MONITOR" = true ]; then
        export CMDSHIFTAI_PERF_TRACKING=1
    fi
    
    # Save PID for hot reload
    echo $$ > /tmp/cmdshiftai.pid
    
    # Launch with specific flags for development
    if [ "$VERBOSE" = true ]; then
        ./scripts/code.sh \
            --verbose \
            --log trace \
            --disable-gpu-sandbox \
            --disable-updates \
            --skip-release-notes \
            --disable-workspace-trust
    else
        ./scripts/code.sh \
            --disable-updates \
            --skip-release-notes \
            --disable-workspace-trust
    fi
}

# Function to show development tips
show_tips() {
    echo -e "\n${CYAN}💡 Development Tips:${NC}"
    echo -e "  • Rust files auto-rebuild on change"
    echo -e "  • TypeScript compilation runs in watch mode"
    echo -e "  • Performance logs: ${BLUE}dev-performance.log${NC}"
    echo -e "  • Press ${YELLOW}Ctrl+C${NC} to stop all processes"
    echo -e "  • Run ${GREEN}npm run test:all${NC} to validate changes"
    echo ""
}

# Main execution
main() {
    print_header
    check_prerequisites
    
    # Initial build
    echo -e "${YELLOW}Starting initial build...${NC}"
    build_rust
    
    # Compile TypeScript once
    echo -e "${BLUE}Compiling TypeScript...${NC}"
    npm run compile --silent
    echo -e "${GREEN}✅ TypeScript compiled${NC}\n"
    
    # Start watchers
    start_rust_watcher
    start_typescript_watcher
    start_perf_monitor
    
    # Show tips
    show_tips
    
    # Wait a moment for watchers to stabilize
    sleep 2
    
    # Launch cmdshiftAI
    launch_cmdshiftai
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --no-rust-watch)
            RUST_WATCH=false
            shift
            ;;
        --no-perf-monitor)
            ENABLE_PERF_MONITOR=false
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --no-rust-watch     Disable Rust hot reload"
            echo "  --no-perf-monitor   Disable performance monitoring"
            echo "  --verbose           Enable verbose output"
            echo "  --help              Show this help message"
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