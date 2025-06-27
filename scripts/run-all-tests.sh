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
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo -e "${CYAN}🧪 cmdshiftAI Comprehensive Test Suite${NC}"
echo "======================================="
echo ""

# Parse arguments
RUN_BENCHMARKS=false
RUN_INTEGRATION=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --benchmarks)
            RUN_BENCHMARKS=true
            shift
            ;;
        --integration)
            RUN_INTEGRATION=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --all)
            RUN_BENCHMARKS=true
            RUN_INTEGRATION=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--benchmarks] [--integration] [--verbose] [--all]"
            exit 1
            ;;
    esac
done

# Track test results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
TEST_RESULTS=()

# Function to run a test suite
run_test_suite() {
    local name=$1
    local command=$2
    
    echo -e "\n${BLUE}Running $name...${NC}"
    echo "----------------------------------------"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if [ "$VERBOSE" = true ]; then
        if eval "$command"; then
            echo -e "${GREEN}✅ $name passed${NC}"
            PASSED_TESTS=$((PASSED_TESTS + 1))
            TEST_RESULTS+=("✅ $name")
        else
            echo -e "${RED}❌ $name failed${NC}"
            FAILED_TESTS=$((FAILED_TESTS + 1))
            TEST_RESULTS+=("❌ $name")
        fi
    else
        # Run quietly and capture output
        if output=$(eval "$command" 2>&1); then
            echo -e "${GREEN}✅ $name passed${NC}"
            PASSED_TESTS=$((PASSED_TESTS + 1))
            TEST_RESULTS+=("✅ $name")
        else
            echo -e "${RED}❌ $name failed${NC}"
            echo "$output" | tail -20
            FAILED_TESTS=$((FAILED_TESTS + 1))
            TEST_RESULTS+=("❌ $name")
        fi
    fi
}

# 1. Validate environment
echo -e "${YELLOW}🔧 Validating Environment${NC}"
"$SCRIPT_DIR/validate-cmdshiftai.sh" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Environment validation passed${NC}"
else
    echo -e "${RED}❌ Environment validation failed${NC}"
    echo "Run: ./scripts/validate-cmdshiftai.sh for details"
    exit 1
fi

# 2. Run Rust unit tests
run_test_suite "Rust Unit Tests" "cd '$PROJECT_ROOT/rust-components' && cargo test"

# 3. Run TypeScript/JavaScript tests
if [ -f "$PROJECT_ROOT/package.json" ]; then
    # Check if test script exists
    if grep -q '"test"' "$PROJECT_ROOT/package.json"; then
        run_test_suite "TypeScript/JavaScript Tests" "cd '$PROJECT_ROOT' && npm test"
    fi
fi

# 4. Run performance benchmarks (if requested)
if [ "$RUN_BENCHMARKS" = true ]; then
    if [ -f "$PROJECT_ROOT/scripts/benchmark-file-ops.js" ]; then
        run_test_suite "Performance Benchmarks" "cd '$PROJECT_ROOT' && node scripts/benchmark-file-ops.js"
    else
        echo -e "${YELLOW}⚠️  Performance benchmarks not found${NC}"
    fi
fi

# 5. Run integration tests (if requested)
if [ "$RUN_INTEGRATION" = true ]; then
    if [ -f "$PROJECT_ROOT/test/integration/rustProvider.test.ts" ]; then
        # Compile and run integration tests
        run_test_suite "Integration Tests" "cd '$PROJECT_ROOT' && npx mocha --require ts-node/register test/integration/**/*.test.ts"
    else
        echo -e "${YELLOW}⚠️  Integration tests not found${NC}"
    fi
fi

# 6. Memory leak detection
echo -e "\n${BLUE}Running Memory Leak Detection...${NC}"
echo "----------------------------------------"

cat > /tmp/memory-test.js << 'EOF'
const { RustFileOperations } = require('./rust-components');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

async function testMemoryLeak() {
    const tempDir = path.join(os.tmpdir(), `mem-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    
    const ops = new RustFileOperations();
    const testFile = path.join(tempDir, 'test.dat');
    await fs.writeFile(testFile, Buffer.alloc(1024 * 1024)); // 1MB
    
    const initialMem = process.memoryUsage().heapUsed;
    
    // Perform many operations
    for (let i = 0; i < 1000; i++) {
        await ops.readFile(testFile);
    }
    
    // Force GC if available
    if (global.gc) global.gc();
    
    const finalMem = process.memoryUsage().heapUsed;
    const leak = (finalMem - initialMem) / 1024 / 1024; // MB
    
    await fs.rm(tempDir, { recursive: true, force: true });
    
    console.log(`Memory increase: ${leak.toFixed(2)} MB`);
    process.exit(leak > 10 ? 1 : 0); // Fail if >10MB leak
}

testMemoryLeak().catch(console.error);
EOF

if node --expose-gc /tmp/memory-test.js > /dev/null 2>&1; then
    echo -e "${GREEN}✅ No significant memory leaks detected${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
    TEST_RESULTS+=("✅ Memory Leak Detection")
else
    echo -e "${RED}❌ Potential memory leak detected${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    TEST_RESULTS+=("❌ Memory Leak Detection")
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))
rm /tmp/memory-test.js

# 7. Check test coverage
if command -v nyc &> /dev/null; then
    echo -e "\n${BLUE}Checking Test Coverage...${NC}"
    echo "----------------------------------------"
    
    if [ -f "$PROJECT_ROOT/.nycrc.json" ]; then
        cd "$PROJECT_ROOT"
        if nyc --check-coverage --lines 80 --functions 80 --branches 70 npm test > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Test coverage meets requirements${NC}"
            PASSED_TESTS=$((PASSED_TESTS + 1))
            TEST_RESULTS+=("✅ Test Coverage")
        else
            echo -e "${YELLOW}⚠️  Test coverage below requirements${NC}"
            TEST_RESULTS+=("⚠️  Test Coverage")
        fi
        TOTAL_TESTS=$((TOTAL_TESTS + 1))
    fi
fi

# Summary
echo -e "\n${CYAN}📊 Test Summary${NC}"
echo "======================================="
echo -e "Total Tests:  ${TOTAL_TESTS}"
echo -e "Passed:       ${GREEN}${PASSED_TESTS}${NC}"
echo -e "Failed:       ${RED}${FAILED_TESTS}${NC}"
echo ""

echo "Test Results:"
for result in "${TEST_RESULTS[@]}"; do
    echo "  $result"
done

echo ""

# Calculate pass rate
if [ $TOTAL_TESTS -gt 0 ]; then
    PASS_RATE=$((PASSED_TESTS * 100 / TOTAL_TESTS))
    echo -e "Pass Rate: ${PASS_RATE}%"
    
    if [ $PASS_RATE -ge 100 ]; then
        echo -e "\n${GREEN}🎉 All tests passed!${NC}"
        exit 0
    elif [ $PASS_RATE -ge 80 ]; then
        echo -e "\n${YELLOW}⚠️  Most tests passed, but some failures need attention${NC}"
        exit 1
    else
        echo -e "\n${RED}❌ Significant test failures${NC}"
        exit 1
    fi
else
    echo -e "\n${YELLOW}⚠️  No tests were run${NC}"
    exit 1
fi