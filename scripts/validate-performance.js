#!/usr/bin/env node

const path = require('path');
const fs = require('fs').promises;
const { performance } = require('perf_hooks');

// Import cmdshiftAI components
const rustComponents = require('../rust-components');
const { FileOperations, PerformanceMonitor, SearchEngine } = rustComponents;

// Test configuration
const TEST_DIR = path.join(__dirname, '..', 'test-data');
const ITERATIONS = 100;
const FILE_SIZES = [
    { name: 'small', size: 1024 },        // 1KB
    { name: 'medium', size: 1024 * 100 }, // 100KB
    { name: 'large', size: 1024 * 1024 }  // 1MB
];

// Performance targets from claude.md
const PERFORMANCE_TARGETS = {
    fileRead: {
        small: 1,    // 1ms for small files
        medium: 5,   // 5ms for medium files
        large: 10    // 10ms for large files
    },
    fileWrite: {
        small: 2,
        medium: 10,
        large: 20
    },
    search: {
        small: 50,
        medium: 200,
        large: 500
    }
};

async function setupTestData() {
    console.log('Setting up test data...');
    
    try {
        await fs.mkdir(TEST_DIR, { recursive: true });
        
        for (const { name, size } of FILE_SIZES) {
            const filePath = path.join(TEST_DIR, `test-${name}.txt`);
            const content = 'x'.repeat(size);
            await fs.writeFile(filePath, content);
        }
        
        // Create directory structure for search tests
        const searchDir = path.join(TEST_DIR, 'search');
        await fs.mkdir(searchDir, { recursive: true });
        
        for (let i = 0; i < 100; i++) {
            const subDir = path.join(searchDir, `dir-${i}`);
            await fs.mkdir(subDir, { recursive: true });
            
            for (let j = 0; j < 10; j++) {
                const filePath = path.join(subDir, `file-${j}.ts`);
                const content = `export function test${j}() { return ${j}; }`;
                await fs.writeFile(filePath, content);
            }
        }
    } catch (error) {
        console.error('Failed to setup test data:', error);
        process.exit(1);
    }
}

async function cleanupTestData() {
    try {
        await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch (error) {
        console.warn('Failed to cleanup test data:', error);
    }
}

async function benchmarkFileOperations() {
    console.log('\n📁 Benchmarking File Operations...');
    console.log('Using:', rustComponents.isNative() ? 'Native Rust bindings' : 'JavaScript fallback');
    
    const fileOps = new FileOperations();
    const perfMon = new PerformanceMonitor();
    const results = {};
    
    for (const { name, size } of FILE_SIZES) {
        const filePath = path.join(TEST_DIR, `test-${name}.txt`);
        results[name] = { read: [], write: [] };
        
        // Warm up
        await fileOps.readFile(filePath);
        
        // Benchmark reads
        for (let i = 0; i < ITERATIONS; i++) {
            const opId = perfMon.startOperation(`read-${name}`);
            await fileOps.readFile(filePath);
            const result = await perfMon.endOperation(opId);
            results[name].read.push(result.durationMs);
        }
        
        // Benchmark writes
        const content = Buffer.from('x'.repeat(size));
        for (let i = 0; i < ITERATIONS; i++) {
            const opId = perfMon.startOperation(`write-${name}`);
            await fileOps.writeFile(filePath, content);
            const result = await perfMon.endOperation(opId);
            results[name].write.push(result.durationMs);
        }
    }
    
    // Calculate statistics and compare with targets
    console.log('\n📊 File Operation Results:');
    console.log('─'.repeat(80));
    console.log('Size     | Operation | Avg (ms) | Min (ms) | Max (ms) | Target | Status');
    console.log('─'.repeat(80));
    
    for (const { name } of FILE_SIZES) {
        for (const op of ['read', 'write']) {
            const times = results[name][op];
            const avg = times.reduce((a, b) => a + b, 0) / times.length;
            const min = Math.min(...times);
            const max = Math.max(...times);
            const target = PERFORMANCE_TARGETS[`file${op.charAt(0).toUpperCase() + op.slice(1)}`][name];
            const status = avg <= target ? '✅ PASS' : '❌ FAIL';
            
            console.log(
                `${name.padEnd(8)} | ${op.padEnd(9)} | ${avg.toFixed(2).padStart(8)} | ${min.toFixed(2).padStart(8)} | ${max.toFixed(2).padStart(8)} | ${target.toString().padStart(6)} | ${status}`
            );
        }
    }
}

async function benchmarkSearch() {
    console.log('\n🔍 Benchmarking Search Operations...');
    
    const searchEngine = new SearchEngine();
    const perfMon = new PerformanceMonitor();
    const searchDir = path.join(TEST_DIR, 'search');
    
    const patterns = [
        { name: 'simple', pattern: 'function' },
        { name: 'regex', pattern: 'test[0-9]+' },
        { name: 'complex', pattern: 'export.*function.*return' }
    ];
    
    const results = [];
    
    for (const { name, pattern } of patterns) {
        const opId = perfMon.startOperation(`search-${name}`);
        const searchResults = await searchEngine.searchPattern(searchDir, pattern);
        const result = await perfMon.endOperation(opId);
        
        results.push({
            pattern: name,
            duration: result.durationMs,
            filesFound: searchResults.length,
            totalMatches: searchResults.reduce((sum, r) => sum + r.matches.length, 0)
        });
    }
    
    console.log('\n📊 Search Results:');
    console.log('─'.repeat(80));
    console.log('Pattern  | Duration (ms) | Files Found | Total Matches | Status');
    console.log('─'.repeat(80));
    
    for (const result of results) {
        const target = PERFORMANCE_TARGETS.search.medium;
        const status = result.duration <= target ? '✅ PASS' : '❌ FAIL';
        
        console.log(
            `${result.pattern.padEnd(8)} | ${result.duration.toFixed(2).padStart(13)} | ${result.filesFound.toString().padStart(11)} | ${result.totalMatches.toString().padStart(13)} | ${status}`
        );
    }
}

async function validateMemoryUsage() {
    console.log('\n💾 Validating Memory Usage...');
    
    const perfMon = new PerformanceMonitor();
    const initialSummary = perfMon.getMetricsSummary();
    
    console.log(`Initial memory usage: ${initialSummary.memoryUsageMb.toFixed(2)} MB`);
    
    // Perform memory-intensive operations
    const fileOps = new FileOperations();
    const promises = [];
    
    for (let i = 0; i < 100; i++) {
        const filePath = path.join(TEST_DIR, `test-medium.txt`);
        promises.push(fileOps.readFile(filePath));
    }
    
    await Promise.all(promises);
    
    const finalSummary = perfMon.getMetricsSummary();
    const memoryIncrease = finalSummary.memoryUsageMb - initialSummary.memoryUsageMb;
    
    console.log(`Final memory usage: ${finalSummary.memoryUsageMb.toFixed(2)} MB`);
    console.log(`Memory increase: ${memoryIncrease.toFixed(2)} MB`);
    
    const status = memoryIncrease < 5 ? '✅ PASS' : '❌ FAIL';
    console.log(`Memory overhead: ${status} (target: <5MB)`);
}

async function compareWithBaseline() {
    console.log('\n⚡ Comparing with Node.js Baseline...');
    
    const fileOps = new FileOperations();
    const perfMon = new PerformanceMonitor();
    
    const testFile = path.join(TEST_DIR, 'test-large.txt');
    const result = await perfMon.benchmarkFileRead(testFile);
    
    console.log(`\n📊 Performance Comparison:`);
    console.log(`Rust time: ${result.rustTimeMs.toFixed(2)}ms`);
    console.log(`Node.js time: ${result.nodeTimeMs.toFixed(2)}ms`);
    console.log(`Speedup: ${result.speedup.toFixed(2)}x`);
    
    const targetSpeedup = 5.0;
    const status = result.speedup >= targetSpeedup ? '✅ PASS' : '❌ FAIL';
    console.log(`\nTarget speedup: ${targetSpeedup}x - ${status}`);
}

async function main() {
    console.log('🚀 cmdshiftAI Performance Validation');
    console.log('=' .repeat(80));
    
    try {
        await setupTestData();
        
        await benchmarkFileOperations();
        await benchmarkSearch();
        await validateMemoryUsage();
        
        if (rustComponents.isNative()) {
            await compareWithBaseline();
        } else {
            console.log('\n⚠️  Running with JavaScript fallback - native performance not available');
        }
        
        console.log('\n✨ Performance validation complete!');
        
    } catch (error) {
        console.error('\n❌ Validation failed:', error);
        process.exit(1);
    } finally {
        await cleanupTestData();
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { validateMemoryUsage, benchmarkFileOperations, benchmarkSearch };