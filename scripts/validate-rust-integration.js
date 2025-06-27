#!/usr/bin/env node

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Validation script for cmdshiftAI Rust integration
 * Confirms that Rust components are properly loaded and functional
 */

const path = require('path');
const fs = require('fs');

async function validateRustIntegration() {
	console.log('🔍 Validating cmdshiftAI Rust Integration');
	console.log('==========================================');

	try {
		// Check if Rust components exist
		const rustComponentsPath = path.join(__dirname, '../rust-components');
		const nodeBindingPath = path.join(rustComponentsPath, 'cmdshiftai_core.node');

		if (!fs.existsSync(nodeBindingPath)) {
			console.error('❌ Rust binding not found at:', nodeBindingPath);
			return false;
		}

		console.log('✅ Rust binding found:', nodeBindingPath);

		// Test loading Rust components
		const rustComponents = require('../rust-components');
		console.log('✅ Rust components loaded successfully');

		// Test component availability
		const expectedComponents = [
			'RustFileOperations',
			'SearchEngine',
			'PerformanceMonitor',
			'AiOrchestrator',
			'CmdShiftAi'
		];

		const availableComponents = Object.keys(rustComponents);
		console.log('📦 Available components:', availableComponents);

		for (const component of expectedComponents) {
			if (availableComponents.includes(component)) {
				console.log(`✅ ${component} - Available`);
			} else {
				console.log(`❌ ${component} - Missing`);
				return false;
			}
		}

		// Test instantiation
		console.log('\n🧪 Testing component instantiation...');

		const fileOps = new rustComponents.RustFileOperations();
		console.log('✅ RustFileOperations instantiated');

		const perfMonitor = new rustComponents.PerformanceMonitor();
		console.log('✅ PerformanceMonitor instantiated');

		const searchEngine = new rustComponents.SearchEngine();
		console.log('✅ SearchEngine instantiated');

		// Test basic functionality
		console.log('\n⚡ Testing basic functionality...');

		const testFile = path.join(__dirname, 'validation-test.txt');
		const testContent = 'cmdshiftAI Rust integration test';

		// Write test file
		await fileOps.writeFile(testFile, Buffer.from(testContent));
		console.log('✅ File write operation successful');

		// Read test file
		const readResult = await fileOps.readFile(testFile);
		const readContent = readResult.toString();

		if (readContent === testContent) {
			console.log('✅ File read operation successful');
		} else {
			console.log('❌ File read/write mismatch');
			return false;
		}

		// Test file stats
		const stats = await fileOps.stat(testFile);
		console.log(`✅ File stats: ${stats.size} bytes, isFile: ${stats.isFile}`);

		// Cleanup
		fs.unlinkSync(testFile);
		console.log('✅ Test file cleaned up');

		// Performance test
		console.log('\n🏃 Quick performance test...');
		const opId = perfMonitor.startOperation('validation-test');

		// Simulate some work
		await new Promise(resolve => setTimeout(resolve, 10));

		const result = await perfMonitor.endOperation(opId);
		console.log(`✅ Performance monitoring: ${result.name} took ${result.durationMs}ms`);

		console.log('\n🎉 All validations passed! cmdshiftAI Rust integration is working correctly.');
		return true;

	} catch (error) {
		console.error('❌ Validation failed:', error.message);
		console.error(error.stack);
		return false;
	}
}

if (require.main === module) {
	validateRustIntegration().then(success => {
		process.exit(success ? 0 : 1);
	});
}

module.exports = { validateRustIntegration };
