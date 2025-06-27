#!/usr/bin/env node

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Test script for RustFileSystemProvider
 * Tests the integration between TypeScript and Rust components
 */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const TEST_FILE_SIZE = 1024 * 1024; // 1MB test file
const ITERATIONS = 10;

async function createTestFile(filePath, size) {
	const buffer = Buffer.alloc(size, 'A');
	await fs.promises.writeFile(filePath, buffer);
	console.log(`Created test file: ${filePath} (${size} bytes)`);
}

async function testRustFileOperations() {
	console.log('🚀 Testing cmdshiftAI RustFileSystemProvider');
	console.log('================================================');

	try {
		// Import rust components
		const rustComponents = require('../rust-components');

		console.log('✅ Rust components loaded successfully');
		console.log('Available components:', Object.keys(rustComponents));

		// Test if we can create instances
		const rustOps = new rustComponents.RustFileOperations();
		const perfMonitor = new rustComponents.PerformanceMonitor();

		console.log('✅ Rust file operations initialized');

		// Create test file
		const testFilePath = path.join(__dirname, 'test-file.txt');
		await createTestFile(testFilePath, TEST_FILE_SIZE);

		// Test read performance
		console.log('\n📖 Testing read performance...');

		// Node.js baseline
		const nodeStartTime = performance.now();
		for (let i = 0; i < ITERATIONS; i++) {
			await fs.promises.readFile(testFilePath);
		}
		const nodeTime = performance.now() - nodeStartTime;
		console.log(`Node.js average: ${(nodeTime / ITERATIONS).toFixed(2)}ms per read`);

		// Rust performance
		const rustStartTime = performance.now();
		for (let i = 0; i < ITERATIONS; i++) {
			await rustOps.readFile(testFilePath);
		}
		const rustTime = performance.now() - rustStartTime;
		console.log(`Rust average: ${(rustTime / ITERATIONS).toFixed(2)}ms per read`);

		const speedup = nodeTime / rustTime;
		console.log(`🏆 Performance improvement: ${speedup.toFixed(2)}x faster`);

		// Test write performance
		console.log('\n📝 Testing write performance...');
		const testContent = Buffer.alloc(TEST_FILE_SIZE / 2, 'B');

		// Node.js baseline
		const nodeWriteStartTime = performance.now();
		for (let i = 0; i < ITERATIONS; i++) {
			await fs.promises.writeFile(testFilePath + `.node.${i}`, testContent);
		}
		const nodeWriteTime = performance.now() - nodeWriteStartTime;
		console.log(`Node.js write average: ${(nodeWriteTime / ITERATIONS).toFixed(2)}ms per write`);

		// Rust performance
		const rustWriteStartTime = performance.now();
		for (let i = 0; i < ITERATIONS; i++) {
			await rustOps.writeFile(testFilePath + `.rust.${i}`, testContent);
		}
		const rustWriteTime = performance.now() - rustWriteStartTime;
		console.log(`Rust write average: ${(rustWriteTime / ITERATIONS).toFixed(2)}ms per write`);

		const writeSpeedup = nodeWriteTime / rustWriteTime;
		console.log(`🏆 Write performance improvement: ${writeSpeedup.toFixed(2)}x faster`);

		// Test directory reading
		console.log('\n📁 Testing directory reading...');

		const dirStartTime = performance.now();
		const entries = await rustOps.readDir(__dirname);
		const dirTime = performance.now() - dirStartTime;

		console.log(`Directory scan completed in ${dirTime.toFixed(2)}ms`);
		console.log(`Found ${entries.length} entries`);

		// Test file stats
		console.log('\n📊 Testing file stats...');
		const stats = await rustOps.stat(testFilePath);
		console.log(`File size: ${stats.size} bytes`);
		console.log(`Is file: ${stats.isFile}`);
		console.log(`Is directory: ${stats.isDirectory}`);

		// Cleanup test files
		await fs.promises.unlink(testFilePath);
		for (let i = 0; i < ITERATIONS; i++) {
			try {
				await fs.promises.unlink(testFilePath + `.node.${i}`);
				await fs.promises.unlink(testFilePath + `.rust.${i}`);
			} catch (e) {
				// Ignore cleanup errors
			}
		}

		console.log('\n✅ All tests completed successfully!');

	} catch (error) {
		console.error('❌ Test failed:', error.message);
		console.error(error.stack);
	}
}

if (require.main === module) {
	testRustFileOperations().catch(console.error);
}

module.exports = { testRustFileOperations };
