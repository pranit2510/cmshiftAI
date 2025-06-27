#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) cmdshiftAI Team. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const path = require('path');
const fs = require('fs').promises;
const { performance } = require('perf_hooks');
const os = require('os');

// Import cmdshiftAI Rust components
let RustFileOperations, isNative, PerformanceMonitor;
try {
    const rustComponents = require('../rust-components');
    RustFileOperations = rustComponents.RustFileOperations;
    isNative = rustComponents.isNative;
    PerformanceMonitor = rustComponents.PerformanceMonitor;
} catch (error) {
    console.error('Failed to load Rust components:', error);
    console.error('Please run "npm run rust:build" first');
    process.exit(1);
}

// Configuration
const TEST_ITERATIONS = 100;
const WARMUP_ITERATIONS = 10;
const TEST_SIZES = [
    { name: '1KB', bytes: 1024, iterations: 1000 },
    { name: '10KB', bytes: 10 * 1024, iterations: 500 },
    { name: '100KB', bytes: 100 * 1024, iterations: 200 },
    { name: '1MB', bytes: 1024 * 1024, iterations: 100 },
    { name: '10MB', bytes: 10 * 1024 * 1024, iterations: 20 },
    { name: '100MB', bytes: 100 * 1024 * 1024, iterations: 5 },
    { name: '1GB', bytes: 1024 * 1024 * 1024, iterations: 2 }
];

// Performance targets from claude.md
const PERFORMANCE_TARGETS = {
    startup: 2000, // <2s
    memory: 150 * 1024 * 1024, // <150MB
    fileRead: {
        '1KB': 0.1,
        '10KB': 0.2,
        '100KB': 0.5,
        '1MB': 1,
        '10MB': 5,
        '100MB': 50,
        '1GB': 500
    },
    improvement: {
        minimum: 5, // 5x minimum
        target: 10  // 10x target
    }
};

class BenchmarkSuite {
    constructor() {
        // Check if Rust components are available
        let isNativeAvailable = false;
        try {
            const rustComponents = require('../rust-components');
            isNativeAvailable = rustComponents.isNative && rustComponents.isNative();
        } catch (error) {
            console.warn('Rust components not available:', error.message);
            isNativeAvailable = false;
        }

        this.results = {
            platform: `${os.platform()} ${os.arch()}`,
            nodeVersion: process.version,
            isNative: isNativeAvailable,
            timestamp: new Date().toISOString(),
            tests: {}
        };
        this.tempDir = path.join(os.tmpdir(), `cmdshiftai-bench-${Date.now()}`);
    }

    async setup() {
        await fs.mkdir(this.tempDir, { recursive: true });
        console.log('🚀 cmdshiftAI Performance Benchmarks');
        console.log('='.repeat(80));
        console.log(`Platform: ${this.results.platform}`);
        console.log(`Node.js: ${this.results.nodeVersion}`);
        console.log(`Native Rust: ${this.results.isNative ? '✅ Enabled' : '❌ Disabled (using fallback)'}`);
        console.log(`Temp directory: ${this.tempDir}`);
        console.log('='.repeat(80));
    }

    async cleanup() {
        try {
            await fs.rm(this.tempDir, { recursive: true, force: true });
        } catch (error) {
            console.warn('Failed to cleanup temp directory:', error.message);
        }
    }

    async benchmarkFileReads() {
        console.log('\n📖 File Read Benchmarks');
        console.log('─'.repeat(80));
        console.log('Size     | Node.js      | Rust         | Speedup | Target  | Status');
        console.log('─'.repeat(80));

        const rustOps = new RustFileOperations();

        for (const { name, bytes, iterations } of TEST_SIZES) {
            if (bytes > 100 * 1024 * 1024 && !process.env.FULL_BENCHMARK) {
                console.log(`${name.padEnd(8)} | Skipped (set FULL_BENCHMARK=1 to run)`);
                continue;
            }

            // Create test file
            const testPath = path.join(this.tempDir, `test-${name}.dat`);
            const data = Buffer.alloc(bytes, 'x');
            await fs.writeFile(testPath, data);

            // Warmup
            for (let i = 0; i < WARMUP_ITERATIONS; i++) {
                await fs.readFile(testPath);
                await rustOps.readFile(testPath);
            }

            // Benchmark Node.js
            const nodeStart = performance.now();
            for (let i = 0; i < iterations; i++) {
                await fs.readFile(testPath);
            }
            const nodeTime = (performance.now() - nodeStart) / iterations;

            // Benchmark Rust
            const rustStart = performance.now();
            for (let i = 0; i < iterations; i++) {
                await rustOps.readFile(testPath);
            }
            const rustTime = (performance.now() - rustStart) / iterations;

            // Calculate speedup
            const speedup = nodeTime / rustTime;
            const target = PERFORMANCE_TARGETS.fileRead[name];
            const status = rustTime <= target ? '✅ PASS' : '❌ FAIL';

            // Store results
            this.results.tests[`read_${name}`] = {
                nodeTime,
                rustTime,
                speedup,
                target,
                passed: rustTime <= target
            };

            console.log(
                `${name.padEnd(8)} | ${this.formatTime(nodeTime).padEnd(12)} | ${this.formatTime(rustTime).padEnd(12)} | ${speedup.toFixed(2).padStart(7)}x | ${target.toFixed(1).padEnd(7)}ms | ${status}`
            );
        }
    }

    async benchmarkFileWrites() {
        console.log('\n✍️  File Write Benchmarks');
        console.log('─'.repeat(80));
        console.log('Size     | Node.js      | Rust         | Speedup | Atomic      | Status');
        console.log('─'.repeat(80));

        const rustOps = new RustFileOperations();

        for (const { name, bytes, iterations } of TEST_SIZES) {
            if (bytes > 100 * 1024 * 1024 && !process.env.FULL_BENCHMARK) {
                console.log(`${name.padEnd(8)} | Skipped (set FULL_BENCHMARK=1 to run)`);
                continue;
            }

            const data = Buffer.alloc(bytes, 'y');
            const nodePath = path.join(this.tempDir, `write-node-${name}.dat`);
            const rustPath = path.join(this.tempDir, `write-rust-${name}.dat`);
            const atomicPath = path.join(this.tempDir, `write-atomic-${name}.dat`);

            // Benchmark Node.js
            const nodeStart = performance.now();
            for (let i = 0; i < iterations; i++) {
                await fs.writeFile(nodePath, data);
            }
            const nodeTime = (performance.now() - nodeStart) / iterations;

            // Benchmark Rust direct
            const rustStart = performance.now();
            for (let i = 0; i < iterations; i++) {
                await rustOps.writeFile(rustPath, data);
            }
            const rustTime = (performance.now() - rustStart) / iterations;

            // Benchmark Rust atomic
            const atomicStart = performance.now();
            for (let i = 0; i < iterations; i++) {
                await rustOps.writeFile(atomicPath, data);
            }
            const atomicTime = (performance.now() - atomicStart) / iterations;

            const speedup = nodeTime / rustTime;
            const status = speedup >= PERFORMANCE_TARGETS.improvement.minimum ? '✅ PASS' : '❌ FAIL';

            this.results.tests[`write_${name}`] = {
                nodeTime,
                rustTime,
                atomicTime,
                speedup,
                passed: speedup >= PERFORMANCE_TARGETS.improvement.minimum
            };

            console.log(
                `${name.padEnd(8)} | ${this.formatTime(nodeTime).padEnd(12)} | ${this.formatTime(rustTime).padEnd(12)} | ${speedup.toFixed(2).padStart(7)}x | ${this.formatTime(atomicTime).padEnd(11)} | ${status}`
            );
        }
    }

    async benchmarkDirectoryOperations() {
        console.log('\n📁 Directory Operation Benchmarks');
        console.log('─'.repeat(80));

        const rustOps = new RustFileOperations();
        const dirPath = path.join(this.tempDir, 'dir-test');
        await fs.mkdir(dirPath, { recursive: true });

        // Create test files
        const fileCounts = [10, 100, 1000, 10000];

        for (const count of fileCounts) {
            if (count > 1000 && !process.env.FULL_BENCHMARK) {
                console.log(`${count} files: Skipped (set FULL_BENCHMARK=1 to run)`);
                continue;
            }

            const subDir = path.join(dirPath, `test-${count}`);
            await fs.mkdir(subDir, { recursive: true });

            // Create files
            const createStart = performance.now();
            for (let i = 0; i < count; i++) {
                await fs.writeFile(path.join(subDir, `file-${i}.txt`), `content ${i}`);
            }
            const createTime = performance.now() - createStart;

            // Benchmark Node.js readdir
            const nodeStart = performance.now();
            const nodeFiles = await fs.readdir(subDir);
            const nodeTime = performance.now() - nodeStart;

            // Benchmark Rust readdir
            const rustStart = performance.now();
            const rustFiles = await rustOps.readDir(subDir);
            const rustTime = performance.now() - rustStart;

            const speedup = nodeTime / rustTime;
            const status = speedup >= PERFORMANCE_TARGETS.improvement.minimum ? '✅ PASS' : '❌ FAIL';

            this.results.tests[`readdir_${count}`] = {
                fileCount: count,
                createTime,
                nodeTime,
                rustTime,
                speedup,
                passed: speedup >= PERFORMANCE_TARGETS.improvement.minimum
            };

            console.log(`${count} files:`);
            console.log(`  Creation time: ${this.formatTime(createTime)}`);
            console.log(`  Node.js:       ${this.formatTime(nodeTime)}`);
            console.log(`  Rust:          ${this.formatTime(rustTime)}`);
            console.log(`  Speedup:       ${speedup.toFixed(2)}x ${status}`);
            console.log();
        }
    }

    async benchmarkMemoryUsage() {
        console.log('\n💾 Memory Usage Analysis');
        console.log('─'.repeat(80));

        const initialMemory = process.memoryUsage();
        console.log('Initial memory usage:');
        console.log(`  Heap Used:     ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  Heap Total:    ${(initialMemory.heapTotal / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  RSS:           ${(initialMemory.rss / 1024 / 1024).toFixed(2)} MB`);

        // Create Rust operations instance
        const rustOps = new RustFileOperations();
        const perfMon = new PerformanceMonitor();

        // Perform memory-intensive operations
        const operations = [];
        const testFile = path.join(this.tempDir, 'memory-test.dat');
        await fs.writeFile(testFile, Buffer.alloc(10 * 1024 * 1024)); // 10MB file

        for (let i = 0; i < 100; i++) {
            operations.push(rustOps.readFile(testFile));
        }

        await Promise.all(operations);

        const afterMemory = process.memoryUsage();
        const memoryIncrease = afterMemory.heapUsed - initialMemory.heapUsed;

        console.log('\nAfter 100 concurrent 10MB reads:');
        console.log(`  Heap Used:     ${(afterMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  Heap Total:    ${(afterMemory.heapTotal / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  RSS:           ${(afterMemory.rss / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  Heap Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);

        const metrics = perfMon.getMetricsSummary();
        console.log('\nPerformance Monitor Metrics:');
        console.log(`  Memory Usage:  ${metrics.memoryUsageMb.toFixed(2)} MB`);
        console.log(`  Active Ops:    ${metrics.activeOperations}`);

        const memoryTarget = PERFORMANCE_TARGETS.memory;
        const status = afterMemory.rss < memoryTarget ? '✅ PASS' : '❌ FAIL';
        console.log(`\nMemory Target: <${(memoryTarget / 1024 / 1024).toFixed(0)} MB RSS - ${status}`);

        this.results.memoryUsage = {
            initial: initialMemory,
            after: afterMemory,
            increase: memoryIncrease,
            target: memoryTarget,
            passed: afterMemory.rss < memoryTarget
        };

        // Force garbage collection if available
        if (global.gc) {
            global.gc();
            const gcMemory = process.memoryUsage();
            console.log('\nAfter garbage collection:');
            console.log(`  Heap Used:     ${(gcMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
            console.log(`  RSS:           ${(gcMemory.rss / 1024 / 1024).toFixed(2)} MB`);
        }
    }

    async benchmarkStartupTime() {
        console.log('\n⚡ Startup Time Analysis');
        console.log('─'.repeat(80));

        // Measure time to load and initialize Rust components
        const iterations = 5;
        const times = [];

        for (let i = 0; i < iterations; i++) {
            // Clear require cache
            delete require.cache[require.resolve('../rust-components')];

            const start = performance.now();
            const components = require('../rust-components');
            const rustOps = new components.RustFileOperations();

            // Perform one operation to ensure full initialization
            const testFile = path.join(this.tempDir, 'startup-test.txt');
            await fs.writeFile(testFile, 'test');
            await rustOps.readFile(testFile);

            const time = performance.now() - start;
            times.push(time);

            console.log(`  Iteration ${i + 1}: ${this.formatTime(time)}`);
        }

        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const status = avgTime < PERFORMANCE_TARGETS.startup ? '✅ PASS' : '❌ FAIL';

        console.log(`\nAverage initialization time: ${this.formatTime(avgTime)}`);
        console.log(`Target: <${PERFORMANCE_TARGETS.startup}ms - ${status}`);

        this.results.startup = {
            times,
            average: avgTime,
            target: PERFORMANCE_TARGETS.startup,
            passed: avgTime < PERFORMANCE_TARGETS.startup
        };
    }

    async generateSummary() {
        console.log('\n📊 Summary Report');
        console.log('='.repeat(80));

        let totalTests = 0;
        let passedTests = 0;

        // Count test results
        for (const [name, result] of Object.entries(this.results.tests)) {
            totalTests++;
            if (result.passed) passedTests++;
        }

        // Add memory and startup tests
        if (this.results.memoryUsage) {
            totalTests++;
            if (this.results.memoryUsage.passed) passedTests++;
        }
        if (this.results.startup) {
            totalTests++;
            if (this.results.startup.passed) passedTests++;
        }

        const passRate = (passedTests / totalTests * 100).toFixed(1);

        console.log(`Total Tests: ${totalTests}`);
        console.log(`Passed: ${passedTests}`);
        console.log(`Failed: ${totalTests - passedTests}`);
        console.log(`Pass Rate: ${passRate}%`);

        // Performance highlights
        console.log('\n🏆 Performance Highlights:');

        const highlights = [];
        for (const [name, result] of Object.entries(this.results.tests)) {
            if (result.speedup) {
                highlights.push({ name, speedup: result.speedup });
            }
        }

        highlights.sort((a, b) => b.speedup - a.speedup);
        highlights.slice(0, 5).forEach(({ name, speedup }) => {
            console.log(`  ${name}: ${speedup.toFixed(2)}x faster`);
        });

        // Save results
        const resultsPath = path.join(__dirname, '..', 'benchmark-results.json');
        await fs.writeFile(resultsPath, JSON.stringify(this.results, null, 2));
        console.log(`\n📄 Detailed results saved to: ${resultsPath}`);

        // Overall status
        const overallStatus = passRate >= 80 ? '✅ PASS' : '❌ FAIL';
        console.log(`\n${overallStatus} Overall benchmark ${passRate >= 80 ? 'passed' : 'failed'}`);

        return passRate >= 80;
    }

    formatTime(ms) {
        if (ms < 1) {
            return `${(ms * 1000).toFixed(0)}µs`;
        } else if (ms < 1000) {
            return `${ms.toFixed(2)}ms`;
        } else {
            return `${(ms / 1000).toFixed(2)}s`;
        }
    }

    async run() {
        try {
            await this.setup();

            await this.benchmarkFileReads();
            await this.benchmarkFileWrites();
            await this.benchmarkDirectoryOperations();
            await this.benchmarkMemoryUsage();
            await this.benchmarkStartupTime();

            const passed = await this.generateSummary();

            await this.cleanup();

            process.exit(passed ? 0 : 1);
        } catch (error) {
            console.error('\n❌ Benchmark failed:', error);
            await this.cleanup();
            process.exit(1);
        }
    }
}

// Run benchmarks
if (require.main === module) {
    const suite = new BenchmarkSuite();
    suite.run();
}

module.exports = BenchmarkSuite;
