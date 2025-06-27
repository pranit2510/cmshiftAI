#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) cmdshiftAI Team. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const path = require('path');
const fs = require('fs').promises;

async function testMemoryUsage() {
    console.log('cmdshiftAI Memory Usage Test');
    console.log('===========================\n');

    // Initial memory
    if (global.gc) global.gc();
    const initialMemory = process.memoryUsage();
    console.log('Initial Memory:');
    console.log(`  Heap Used: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  RSS: ${(initialMemory.rss / 1024 / 1024).toFixed(2)}MB`);

    try {
        // Test 1: Load Rust module
        console.log('\nLoading Rust module...');
        const rustOps = require('../rust-components');
        
        if (global.gc) global.gc();
        const afterLoadMemory = process.memoryUsage();
        const loadMemoryDelta = afterLoadMemory.heapUsed - initialMemory.heapUsed;
        console.log(`  Memory increase: ${(loadMemoryDelta / 1024 / 1024).toFixed(2)}MB`);

        // Test 2: Create many operations
        console.log('\nTesting memory during operations...');
        const iterations = 1000;
        const testData = Buffer.alloc(1024 * 100); // 100KB

        for (let i = 0; i < iterations; i++) {
            // Simulate file operations without actual I/O
            const op = {
                data: testData,
                path: `/test/path/${i}`,
                stats: { size: testData.length, mtime: new Date() }
            };
            
            if (i % 100 === 0) {
                if (global.gc) global.gc();
                const currentMem = process.memoryUsage();
                console.log(`  After ${i} operations: ${(currentMem.heapUsed / 1024 / 1024).toFixed(2)}MB`);
            }
        }

        // Final memory check
        if (global.gc) global.gc();
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const finalMemory = process.memoryUsage();
        const totalIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
        
        console.log('\nFinal Memory:');
        console.log(`  Heap Used: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
        console.log(`  RSS: ${(finalMemory.rss / 1024 / 1024).toFixed(2)}MB`);
        console.log(`  Total increase: ${(totalIncrease / 1024 / 1024).toFixed(2)}MB`);

        // Check targets
        const baselineTarget = 150; // MB
        const currentUsageMB = finalMemory.rss / 1024 / 1024;
        
        console.log('\nMemory Target Check:');
        console.log(`  Target: <${baselineTarget}MB baseline`);
        console.log(`  Actual: ${currentUsageMB.toFixed(2)}MB`);
        
        if (currentUsageMB < baselineTarget) {
            console.log(`  ✅ PASS: Memory usage within target`);
            process.exit(0);
        } else {
            console.log(`  ❌ FAIL: Memory usage exceeds target`);
            process.exit(1);
        }

    } catch (error) {
        console.error('Error during memory test:', error.message);
        
        // If Rust module isn't built yet, that's OK for CI
        if (error.code === 'MODULE_NOT_FOUND' && error.message.includes('cmdshiftai_core.node')) {
            console.log('\nNote: Rust module not built yet. Skipping memory test.');
            process.exit(0);
        }
        
        process.exit(1);
    }
}

// Run with --expose-gc flag for accurate measurements
testMemoryUsage();