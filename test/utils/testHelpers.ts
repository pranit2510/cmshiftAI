/*---------------------------------------------------------------------------------------------
 *  Copyright (c) cmdshiftAI Team. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';
import { performance } from 'perf_hooks';

export interface PerformanceResult {
    operation: string;
    duration: number;
    memory: {
        before: NodeJS.MemoryUsage;
        after: NodeJS.MemoryUsage;
        delta: number;
    };
}

export class TestHelper {
    private static testDirs: string[] = [];

    /**
     * Create a temporary directory for testing
     */
    static async createTempDir(prefix: string = 'cmdshiftai-test'): Promise<string> {
        const tempDir = path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
        await fs.mkdir(tempDir, { recursive: true });
        this.testDirs.push(tempDir);
        return tempDir;
    }

    /**
     * Clean up all test directories
     */
    static async cleanup(): Promise<void> {
        await Promise.all(
            this.testDirs.map(dir => 
                fs.rm(dir, { recursive: true, force: true }).catch(() => {})
            )
        );
        this.testDirs = [];
    }

    /**
     * Create test files with specific sizes
     */
    static async createTestFile(dir: string, name: string, sizeInBytes: number): Promise<string> {
        const filePath = path.join(dir, name);
        const content = Buffer.alloc(sizeInBytes, 'x');
        await fs.writeFile(filePath, content);
        return filePath;
    }

    /**
     * Create multiple test files
     */
    static async createTestFiles(dir: string, count: number, sizeInBytes: number = 1024): Promise<string[]> {
        const files: string[] = [];
        for (let i = 0; i < count; i++) {
            const filePath = await this.createTestFile(dir, `test-file-${i}.txt`, sizeInBytes);
            files.push(filePath);
        }
        return files;
    }

    /**
     * Measure performance of an operation
     */
    static async measurePerformance<T>(
        operation: string,
        fn: () => Promise<T>
    ): Promise<{ result: T; perf: PerformanceResult }> {
        const memBefore = process.memoryUsage();
        const start = performance.now();
        
        const result = await fn();
        
        const duration = performance.now() - start;
        const memAfter = process.memoryUsage();
        
        return {
            result,
            perf: {
                operation,
                duration,
                memory: {
                    before: memBefore,
                    after: memAfter,
                    delta: memAfter.heapUsed - memBefore.heapUsed
                }
            }
        };
    }

    /**
     * Compare performance between two implementations
     */
    static async comparePerformance<T>(
        name: string,
        nodeImpl: () => Promise<T>,
        rustImpl: () => Promise<T>,
        iterations: number = 100
    ): Promise<{
        node: { avg: number; min: number; max: number };
        rust: { avg: number; min: number; max: number };
        speedup: number;
    }> {
        // Warmup
        for (let i = 0; i < 10; i++) {
            await nodeImpl();
            await rustImpl();
        }

        // Measure Node.js
        const nodeTimes: number[] = [];
        for (let i = 0; i < iterations; i++) {
            const start = performance.now();
            await nodeImpl();
            nodeTimes.push(performance.now() - start);
        }

        // Measure Rust
        const rustTimes: number[] = [];
        for (let i = 0; i < iterations; i++) {
            const start = performance.now();
            await rustImpl();
            rustTimes.push(performance.now() - start);
        }

        const nodeAvg = nodeTimes.reduce((a, b) => a + b, 0) / nodeTimes.length;
        const rustAvg = rustTimes.reduce((a, b) => a + b, 0) / rustTimes.length;

        return {
            node: {
                avg: nodeAvg,
                min: Math.min(...nodeTimes),
                max: Math.max(...nodeTimes)
            },
            rust: {
                avg: rustAvg,
                min: Math.min(...rustTimes),
                max: Math.max(...rustTimes)
            },
            speedup: nodeAvg / rustAvg
        };
    }

    /**
     * Assert performance improvement
     */
    static assertPerformanceImprovement(speedup: number, minRequired: number = 5): void {
        if (speedup < minRequired) {
            throw new Error(
                `Performance improvement ${speedup.toFixed(2)}x is below minimum required ${minRequired}x`
            );
        }
    }

    /**
     * Assert memory usage is within limits
     */
    static assertMemoryUsage(memoryMB: number, maxMB: number = 150): void {
        if (memoryMB > maxMB) {
            throw new Error(
                `Memory usage ${memoryMB.toFixed(2)}MB exceeds maximum allowed ${maxMB}MB`
            );
        }
    }

    /**
     * Generate test data patterns
     */
    static generateTestData(pattern: 'sequential' | 'random' | 'unicode', size: number): Buffer {
        let data: string;
        
        switch (pattern) {
            case 'sequential':
                data = Array.from({ length: size }, (_, i) => String.fromCharCode(65 + (i % 26))).join('');
                break;
            
            case 'random':
                data = Array.from({ length: size }, () => 
                    String.fromCharCode(Math.floor(Math.random() * 128))
                ).join('');
                break;
            
            case 'unicode':
                const unicodeChars = ['😀', '🎉', '🚀', '❤️', '测试', 'тест', 'テスト'];
                data = Array.from({ length: size / 4 }, () => 
                    unicodeChars[Math.floor(Math.random() * unicodeChars.length)]
                ).join('');
                break;
        }
        
        return Buffer.from(data);
    }

    /**
     * Wait for a condition to be true
     */
    static async waitFor(
        condition: () => boolean | Promise<boolean>,
        timeout: number = 5000,
        interval: number = 100
    ): Promise<void> {
        const start = Date.now();
        
        while (Date.now() - start < timeout) {
            if (await condition()) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, interval));
        }
        
        throw new Error(`Timeout waiting for condition after ${timeout}ms`);
    }

    /**
     * Create a mock VS Code extension context
     */
    static createMockExtensionContext(): any {
        return {
            subscriptions: [],
            extensionPath: '/mock/extension/path',
            globalState: new Map(),
            workspaceState: new Map(),
            extensionUri: { scheme: 'file', path: '/mock/extension/path' },
            environmentVariableCollection: new Map(),
            asAbsolutePath: (relativePath: string) => path.join('/mock/extension/path', relativePath),
            storagePath: '/mock/storage/path',
            globalStoragePath: '/mock/global/storage/path',
            logPath: '/mock/log/path'
        };
    }

    /**
     * Format bytes to human readable string
     */
    static formatBytes(bytes: number): string {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return `${size.toFixed(2)} ${units[unitIndex]}`;
    }

    /**
     * Format duration to human readable string
     */
    static formatDuration(ms: number): string {
        if (ms < 1) {
            return `${(ms * 1000).toFixed(0)}µs`;
        } else if (ms < 1000) {
            return `${ms.toFixed(2)}ms`;
        } else {
            return `${(ms / 1000).toFixed(2)}s`;
        }
    }
}

/**
 * Test data generator for various scenarios
 */
export class TestDataGenerator {
    static readonly FILE_SIZES = {
        TINY: 1,                      // 1 byte
        SMALL: 1024,                  // 1 KB
        MEDIUM: 1024 * 100,          // 100 KB
        LARGE: 1024 * 1024,          // 1 MB
        XLARGE: 1024 * 1024 * 10,    // 10 MB
        HUGE: 1024 * 1024 * 100      // 100 MB
    };

    static readonly FILE_PATTERNS = {
        TEXT: 'text/plain',
        JSON: 'application/json',
        BINARY: 'application/octet-stream',
        CODE: 'text/x-code'
    };

    /**
     * Generate file content based on type
     */
    static generateFileContent(type: string, size: number): Buffer {
        switch (type) {
            case this.FILE_PATTERNS.JSON:
                return this.generateJSON(size);
            
            case this.FILE_PATTERNS.CODE:
                return this.generateCode(size);
            
            case this.FILE_PATTERNS.BINARY:
                return this.generateBinary(size);
            
            default:
                return this.generateText(size);
        }
    }

    private static generateJSON(size: number): Buffer {
        const obj = {
            generated: new Date().toISOString(),
            data: Array.from({ length: Math.floor(size / 100) }, (_, i) => ({
                id: i,
                value: Math.random(),
                text: `Item ${i}`
            }))
        };
        
        const json = JSON.stringify(obj, null, 2);
        return Buffer.from(json.padEnd(size, ' ').substring(0, size));
    }

    private static generateCode(size: number): Buffer {
        const code = `
// Generated test file
export class TestClass {
    constructor() {
        this.data = [];
    }
    
    method${Math.random().toString(36).substring(7)}() {
        return this.data.map(x => x * 2);
    }
}
`.repeat(Math.ceil(size / 200));
        
        return Buffer.from(code.substring(0, size));
    }

    private static generateBinary(size: number): Buffer {
        return Buffer.from(Array.from({ length: size }, () => Math.floor(Math.random() * 256)));
    }

    private static generateText(size: number): Buffer {
        const lorem = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ';
        return Buffer.from(lorem.repeat(Math.ceil(size / lorem.length)).substring(0, size));
    }
}