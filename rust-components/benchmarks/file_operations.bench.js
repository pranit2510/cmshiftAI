#!/usr/bin/env node

const path = require('path');
const fs = require('fs').promises;
const { performance } = require('perf_hooks');
const { RustFileOperations, PerformanceMonitor, isNative } = require('../index');

// Test configuration
const ITERATIONS = 100;
const TEST_SIZES = [
    { name: '1KB', size: 1024 },
    { name: '100KB', size: 100 * 1024 },
    { name: '1MB', size: 1024 * 1024 },
    { name: '10MB', size: 10 * 1024 * 1024 },
    { name: '100MB', size: 100 * 1024 * 1024 }
];

async function setupTestFiles(tempDir) {
    await fs.mkdir(tempDir, { recursive: true });
    
    const files = {};
    for (const { name, size } of TEST_SIZES) {
        const filePath = path.join(tempDir, `test-${name}.dat`);
        const data = Buffer.alloc(size, 'x');
        await fs.writeFile(filePath, data);
        files[name] = filePath;
    }
    
    return files;
}

async function cleanupTestFiles(tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
}

async function benchmarkReads(rustOps, files) {
    console.log('\n📖 Read Performance Benchmarks');
    console.log('─'.repeat(80));
    console.log('Size     | Node.js (ms) | Rust (ms) | Speedup | Cache Hit (ms) | Cache Speedup');
    console.log('─'.repeat(80));
    
    for (const [sizeName, filePath] of Object.entries(files)) {
        // Node.js baseline
        let nodeTotal = 0;
        for (let i = 0; i < ITERATIONS; i++) {
            const start = performance.now();
            await fs.readFile(filePath);
            nodeTotal += performance.now() - start;
        }
        const nodeAvg = nodeTotal / ITERATIONS;
        
        // Clear cache before Rust test
        rustOps.clearCache();
        
        // Rust implementation (cold cache)
        let rustTotal = 0;
        for (let i = 0; i < ITERATIONS; i++) {
            const start = performance.now();
            await rustOps.readFileFast(filePath);
            rustTotal += performance.now() - start;
            rustOps.clearCache(); // Keep cache cold
        }
        const rustAvg = rustTotal / ITERATIONS;
        
        // Rust with cache (warm cache)
        await rustOps.readFileFast(filePath); // Warm up cache
        let cacheTotal = 0;
        for (let i = 0; i < ITERATIONS; i++) {
            const start = performance.now();
            await rustOps.readFileFast(filePath);
            cacheTotal += performance.now() - start;
        }
        const cacheAvg = cacheTotal / ITERATIONS;
        
        const speedup = nodeAvg / rustAvg;
        const cacheSpeedup = nodeAvg / cacheAvg;
        
        console.log(
            `${sizeName.padEnd(8)} | ${nodeAvg.toFixed(2).padStart(12)} | ${rustAvg.toFixed(2).padStart(9)} | ${speedup.toFixed(2).padStart(7)}x | ${cacheAvg.toFixed(2).padStart(14)} | ${cacheSpeedup.toFixed(2).padStart(13)}x`
        );
    }
}

async function benchmarkWrites(rustOps, tempDir) {
    console.log('\n✍️  Write Performance Benchmarks');
    console.log('─'.repeat(80));
    console.log('Size     | Node.js (ms) | Rust (ms) | Speedup | Atomic (ms) | Atomic Speedup');
    console.log('─'.repeat(80));
    
    for (const { name, size } of TEST_SIZES) {
        const data = Buffer.alloc(size, 'y');
        const testPath = path.join(tempDir, `write-test-${name}.dat`);
        const atomicPath = path.join(tempDir, `atomic-test-${name}.dat`);
        
        // Node.js baseline
        let nodeTotal = 0;
        for (let i = 0; i < ITERATIONS; i++) {
            const start = performance.now();
            await fs.writeFile(testPath, data);
            nodeTotal += performance.now() - start;
        }
        const nodeAvg = nodeTotal / ITERATIONS;
        
        // Rust direct write
        let rustTotal = 0;
        for (let i = 0; i < ITERATIONS; i++) {
            const start = performance.now();
            await rustOps.writeFileAtomic(testPath, data);
            rustTotal += performance.now() - start;
        }
        const rustAvg = rustTotal / ITERATIONS;
        
        // Rust atomic write
        let atomicTotal = 0;
        for (let i = 0; i < ITERATIONS; i++) {
            const start = performance.now();
            await rustOps.writeFileAtomic(atomicPath, data, '.tmp');
            atomicTotal += performance.now() - start;
        }
        const atomicAvg = atomicTotal / ITERATIONS;
        
        const speedup = nodeAvg / rustAvg;
        const atomicSpeedup = nodeAvg / atomicAvg;
        
        console.log(
            `${name.padEnd(8)} | ${nodeAvg.toFixed(2).padStart(12)} | ${rustAvg.toFixed(2).padStart(9)} | ${speedup.toFixed(2).padStart(7)}x | ${atomicAvg.toFixed(2).padStart(11)} | ${atomicSpeedup.toFixed(2).padStart(14)}x`
        );
    }
}

async function benchmarkDirectoryOps(rustOps, tempDir) {
    console.log('\n📁 Directory Operation Benchmarks');
    console.log('─'.repeat(60));
    
    // Create test directory structure
    const testDir = path.join(tempDir, 'dir-test');
    await fs.mkdir(testDir, { recursive: true });
    
    // Create files
    const fileCount = 1000;
    for (let i = 0; i < fileCount; i++) {
        await fs.writeFile(path.join(testDir, `file-${i}.txt`), `content ${i}`);
    }
    
    // Benchmark readdir
    const nodeStart = performance.now();
    const nodeEntries = await fs.readdir(testDir, { withFileTypes: true });
    const nodeTime = performance.now() - nodeStart;
    
    const rustStart = performance.now();
    const rustEntries = await rustOps.readDirectoryParallel(testDir);
    const rustTime = performance.now() - rustStart;
    
    console.log(`Directory with ${fileCount} files:`);
    console.log(`  Node.js:  ${nodeTime.toFixed(2)}ms`);
    console.log(`  Rust:     ${rustTime.toFixed(2)}ms`);
    console.log(`  Speedup:  ${(nodeTime / rustTime).toFixed(2)}x`);
}

async function benchmarkBatchOperations(rustOps, files) {
    console.log('\n⚡ Batch Operation Benchmarks');
    console.log('─'.repeat(60));
    
    const paths = Object.values(files);
    
    // Node.js sequential stat
    const nodeStart = performance.now();
    const nodeStats = [];
    for (const path of paths) {
        try {
            nodeStats.push(await fs.stat(path));
        } catch {
            nodeStats.push(null);
        }
    }
    const nodeTime = performance.now() - nodeStart;
    
    // Rust batch stat
    const rustStart = performance.now();
    const rustStats = await rustOps.batchStat(paths);
    const rustTime = performance.now() - rustStart;
    
    console.log(`Batch stat for ${paths.length} files:`);
    console.log(`  Node.js (sequential): ${nodeTime.toFixed(2)}ms`);
    console.log(`  Rust (parallel):      ${rustTime.toFixed(2)}ms`);
    console.log(`  Speedup:              ${(nodeTime / rustTime).toFixed(2)}x`);
}

async function main() {
    console.log('🚀 cmdshiftAI Rust File Operations Benchmarks');
    console.log(`Running with: ${isNative() ? 'Native Rust bindings' : 'JavaScript fallback'}`);
    
    const tempDir = path.join(__dirname, 'bench-temp');
    const rustOps = new RustFileOperations();
    const perfMon = new PerformanceMonitor();
    
    try {
        const files = await setupTestFiles(tempDir);
        
        await benchmarkReads(rustOps, files);
        await benchmarkWrites(rustOps, tempDir);
        await benchmarkDirectoryOps(rustOps, tempDir);
        await benchmarkBatchOperations(rustOps, files);
        
        // Display performance stats
        const stats = rustOps.getPerformanceStats();
        console.log('\n📊 Performance Statistics:');
        console.log(`  Total Reads:  ${stats.totalReads}`);
        console.log(`  Total Writes: ${stats.totalWrites}`);
        console.log(`  Cache Hits:   ${stats.cacheHits}`);
        console.log(`  Cache Misses: ${stats.cacheMisses}`);
        console.log(`  Cache Hit Rate: ${((stats.cacheHits / (stats.cacheHits + stats.cacheMisses)) * 100).toFixed(1)}%`);
        
    } catch (error) {
        console.error('Benchmark failed:', error);
        process.exit(1);
    } finally {
        await cleanupTestFiles(tempDir);
    }
}

if (require.main === module) {
    main();
}