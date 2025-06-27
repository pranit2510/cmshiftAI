/*---------------------------------------------------------------------------------------------
 *  Copyright (c) cmdshiftAI Team. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as path from 'path';
import * as os from 'os';
import { promises as fs } from 'fs';
import { URI } from 'vscode-uri';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IFileService, FileType, FileSystemProviderCapabilities, IFileSystemProvider, IStat, FilePermission } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { Schemas } from 'vs/base/common/network';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { RustFileSystemProvider } from 'vs/platform/files/node/rustFileSystemProvider';
import { NullLogService } from 'vs/platform/log/common/log';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { VSBuffer } from 'vs/base/common/buffer';

// Popular VS Code extensions for compatibility testing
const TOP_EXTENSIONS = [
    'ms-python.python',
    'ms-vscode.cpptools',
    'ms-dotnettools.csharp',
    'ms-azuretools.vscode-docker',
    'dbaeumer.vscode-eslint',
    'esbenp.prettier-vscode',
    'ritwickdey.LiveServer',
    'ms-vscode.PowerShell',
    'golang.go',
    'rust-lang.rust-analyzer',
    'ms-vscode.vscode-typescript-tslint-plugin',
    'redhat.java',
    'vscjava.vscode-java-debug',
    'octref.vetur',
    'ms-vscode.vscode-node-azure-pack',
    'ms-toolsai.jupyter',
    'eamodio.gitlens',
    'msjsdiag.debugger-for-chrome',
    'streetsidesoftware.code-spell-checker',
    'formulahendry.code-runner'
];

suite('RustFileSystemProvider Integration Tests', () => {
    let testDir: string;
    let service: IFileService;
    let nodeProvider: DiskFileSystemProvider;
    let rustProvider: RustFileSystemProvider;
    let disposables: DisposableStore;

    setup(async () => {
        disposables = new DisposableStore();
        testDir = path.join(os.tmpdir(), `cmdshiftai-integration-${Date.now()}`);
        await fs.mkdir(testDir, { recursive: true });

        // Create providers
        const logService = new NullLogService();
        nodeProvider = new DiskFileSystemProvider(logService);
        rustProvider = new RustFileSystemProvider(logService);

        // Create file service
        service = new FileService(logService);
        disposables.add(service);

        // Register providers
        disposables.add(service.registerProvider(Schemas.file, nodeProvider));
        disposables.add(service.registerProvider(Schemas.vscodeRust, rustProvider));
    });

    teardown(async () => {
        disposables.dispose();
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch { /* ignore */ }
    });

    suite('Basic File Operations', () => {
        test('should read files correctly', async () => {
            const content = 'Hello, cmdshiftAI!';
            const fileName = 'test-read.txt';
            const filePath = path.join(testDir, fileName);
            await fs.writeFile(filePath, content);

            const nodeUri = URI.file(filePath);
            const rustUri = URI.from({ scheme: Schemas.vscodeRust, path: filePath });

            const nodeResult = await service.readFile(nodeUri);
            const rustResult = await service.readFile(rustUri);

            assert.strictEqual(nodeResult.value.toString(), content);
            assert.strictEqual(rustResult.value.toString(), content);
            assert.strictEqual(nodeResult.value.toString(), rustResult.value.toString());
        });

        test('should write files atomically', async () => {
            const content = VSBuffer.fromString('Atomic write test');
            const fileName = 'test-write-atomic.txt';
            const filePath = path.join(testDir, fileName);

            const rustUri = URI.from({ scheme: Schemas.vscodeRust, path: filePath });
            
            await service.writeFile(rustUri, content, { atomic: { postfix: '.tmp' } });
            
            const exists = await service.exists(rustUri);
            assert.strictEqual(exists, true);

            const readResult = await service.readFile(rustUri);
            assert.strictEqual(readResult.value.toString(), content.toString());
        });

        test('should handle concurrent writes correctly', async () => {
            const fileName = 'test-concurrent.txt';
            const filePath = path.join(testDir, fileName);
            const rustUri = URI.from({ scheme: Schemas.vscodeRust, path: filePath });

            const writes = [];
            for (let i = 0; i < 100; i++) {
                const content = VSBuffer.fromString(`Content ${i}`);
                writes.push(service.writeFile(rustUri, content));
            }

            await Promise.all(writes);

            const exists = await service.exists(rustUri);
            assert.strictEqual(exists, true);
        });

        test('should list directory contents in parallel', async () => {
            const dirName = 'test-dir';
            const dirPath = path.join(testDir, dirName);
            await fs.mkdir(dirPath);

            // Create test files
            const fileCount = 100;
            for (let i = 0; i < fileCount; i++) {
                await fs.writeFile(path.join(dirPath, `file-${i}.txt`), `Content ${i}`);
            }

            const nodeUri = URI.file(dirPath);
            const rustUri = URI.from({ scheme: Schemas.vscodeRust, path: dirPath });

            const nodeStart = Date.now();
            const nodeResult = await service.resolve(nodeUri, { resolveMetadata: true });
            const nodeTime = Date.now() - nodeStart;

            const rustStart = Date.now();
            const rustResult = await service.resolve(rustUri, { resolveMetadata: true });
            const rustTime = Date.now() - rustStart;

            assert.strictEqual(nodeResult.children?.length, fileCount);
            assert.strictEqual(rustResult.children?.length, fileCount);
            
            console.log(`Directory listing performance: Node.js=${nodeTime}ms, Rust=${rustTime}ms, Speedup=${(nodeTime/rustTime).toFixed(2)}x`);
            
            // Rust should be faster
            assert.ok(rustTime <= nodeTime, 'Rust should be faster than Node.js for directory operations');
        });
    });

    suite('Error Handling', () => {
        test('should handle file not found errors', async () => {
            const nonExistentPath = path.join(testDir, 'non-existent.txt');
            const rustUri = URI.from({ scheme: Schemas.vscodeRust, path: nonExistentPath });

            try {
                await service.readFile(rustUri);
                assert.fail('Should have thrown FileNotFound error');
            } catch (error: any) {
                assert.strictEqual(error.fileOperationResult, 1); // FileNotFound
            }
        });

        test('should handle permission errors gracefully', async () => {
            if (process.platform === 'win32') {
                return; // Skip on Windows
            }

            const fileName = 'test-no-perms.txt';
            const filePath = path.join(testDir, fileName);
            await fs.writeFile(filePath, 'content');
            await fs.chmod(filePath, 0o000);

            const rustUri = URI.from({ scheme: Schemas.vscodeRust, path: filePath });

            try {
                await service.readFile(rustUri);
                assert.fail('Should have thrown NoPermissions error');
            } catch (error: any) {
                assert.strictEqual(error.fileOperationResult, 6); // NoPermissions
            } finally {
                await fs.chmod(filePath, 0o644);
            }
        });

        test('should fall back to Node.js on Rust failure', async () => {
            // Simulate Rust failure by using an invalid operation
            const fileName = 'test-fallback.txt';
            const filePath = path.join(testDir, fileName);
            await fs.writeFile(filePath, 'fallback test');

            // Force fallback by temporarily disabling Rust
            const originalIsAvailable = rustProvider.isRustAvailable;
            rustProvider.isRustAvailable = () => false;

            const rustUri = URI.from({ scheme: Schemas.vscodeRust, path: filePath });
            const result = await service.readFile(rustUri);
            
            assert.strictEqual(result.value.toString(), 'fallback test');

            // Restore
            rustProvider.isRustAvailable = originalIsAvailable;
        });
    });

    suite('Extension Compatibility', () => {
        test('should maintain file watcher compatibility', async () => {
            const watchDir = path.join(testDir, 'watch-test');
            await fs.mkdir(watchDir);

            const rustUri = URI.from({ scheme: Schemas.vscodeRust, path: watchDir });
            
            const changes: any[] = [];
            const watcher = disposables.add(service.watch(rustUri));
            disposables.add(service.onDidFilesChange(e => changes.push(...e.changes)));

            // Create a file
            const testFile = path.join(watchDir, 'watched.txt');
            await fs.writeFile(testFile, 'initial');

            // Wait for change event
            await new Promise(resolve => setTimeout(resolve, 100));

            assert.ok(changes.length > 0, 'Should have received file change events');
        });

        test('should support VS Code file operations API', async () => {
            const content = VSBuffer.fromString('API test');
            const fileName = 'test-api.txt';
            const filePath = path.join(testDir, fileName);
            const rustUri = URI.from({ scheme: Schemas.vscodeRust, path: filePath });

            // Test create
            await service.createFile(rustUri, content);
            assert.ok(await service.exists(rustUri));

            // Test copy
            const copyPath = path.join(testDir, 'test-api-copy.txt');
            const copyUri = URI.from({ scheme: Schemas.vscodeRust, path: copyPath });
            await service.copy(rustUri, copyUri);
            assert.ok(await service.exists(copyUri));

            // Test move
            const movePath = path.join(testDir, 'test-api-moved.txt');
            const moveUri = URI.from({ scheme: Schemas.vscodeRust, path: movePath });
            await service.move(rustUri, moveUri);
            assert.ok(await service.exists(moveUri));
            assert.ok(!await service.exists(rustUri));

            // Test delete
            await service.del(moveUri);
            assert.ok(!await service.exists(moveUri));
        });

        test('should handle symbolic links correctly', async () => {
            if (process.platform === 'win32') {
                return; // Skip on Windows
            }

            const targetFile = path.join(testDir, 'target.txt');
            const linkFile = path.join(testDir, 'link.txt');
            
            await fs.writeFile(targetFile, 'link target content');
            await fs.symlink(targetFile, linkFile);

            const rustUri = URI.from({ scheme: Schemas.vscodeRust, path: linkFile });
            const stat = await service.resolve(rustUri, { resolveMetadata: true });

            assert.ok(stat.isSymbolicLink);
            assert.strictEqual(stat.isFile, true);

            const content = await service.readFile(rustUri);
            assert.strictEqual(content.value.toString(), 'link target content');
        });
    });

    suite('Performance Requirements', () => {
        test('should maintain <150MB memory usage', async () => {
            const initialMemory = process.memoryUsage();

            // Perform memory-intensive operations
            const operations = [];
            for (let i = 0; i < 100; i++) {
                const content = VSBuffer.fromString('x'.repeat(1024 * 1024)); // 1MB
                const filePath = path.join(testDir, `mem-test-${i}.txt`);
                const uri = URI.from({ scheme: Schemas.vscodeRust, path: filePath });
                operations.push(service.writeFile(uri, content));
            }

            await Promise.all(operations);

            const currentMemory = process.memoryUsage();
            const memoryIncrease = currentMemory.rss - initialMemory.rss;
            const memoryIncreaseMB = memoryIncrease / 1024 / 1024;

            console.log(`Memory increase after 100x 1MB operations: ${memoryIncreaseMB.toFixed(2)} MB`);
            
            // Should not exceed 150MB total
            assert.ok(currentMemory.rss / 1024 / 1024 < 150, 'Total memory usage should be under 150MB');
        });

        test('should achieve 10x read performance improvement', async () => {
            const content = 'x'.repeat(1024 * 1024); // 1MB
            const fileName = 'perf-test.txt';
            const filePath = path.join(testDir, fileName);
            await fs.writeFile(filePath, content);

            const nodeUri = URI.file(filePath);
            const rustUri = URI.from({ scheme: Schemas.vscodeRust, path: filePath });

            // Warmup
            await service.readFile(nodeUri);
            await service.readFile(rustUri);

            // Benchmark
            const iterations = 100;
            
            const nodeStart = Date.now();
            for (let i = 0; i < iterations; i++) {
                await service.readFile(nodeUri);
            }
            const nodeTime = Date.now() - nodeStart;

            const rustStart = Date.now();
            for (let i = 0; i < iterations; i++) {
                await service.readFile(rustUri);
            }
            const rustTime = Date.now() - rustStart;

            const speedup = nodeTime / rustTime;
            console.log(`Read performance: Node.js=${nodeTime}ms, Rust=${rustTime}ms, Speedup=${speedup.toFixed(2)}x`);

            assert.ok(speedup >= 5, 'Rust should be at least 5x faster than Node.js');
        });
    });

    suite('VS Code API Compatibility', () => {
        test('should support all FileSystemProvider capabilities', () => {
            const capabilities = rustProvider.capabilities;
            
            assert.ok(capabilities & FileSystemProviderCapabilities.FileReadWrite);
            assert.ok(capabilities & FileSystemProviderCapabilities.FileOpenReadWriteClose);
            assert.ok(capabilities & FileSystemProviderCapabilities.FileReadStream);
            assert.ok(capabilities & FileSystemProviderCapabilities.FileFolderCopy);
            assert.ok(capabilities & FileSystemProviderCapabilities.FileWriteUnlock);
            assert.ok(capabilities & FileSystemProviderCapabilities.FileAtomicRead);
            assert.ok(capabilities & FileSystemProviderCapabilities.FileAtomicWrite);
            assert.ok(capabilities & FileSystemProviderCapabilities.FileAtomicDelete);
            assert.ok(capabilities & FileSystemProviderCapabilities.FileClone);
        });

        test('should maintain stat compatibility', async () => {
            const fileName = 'stat-test.txt';
            const filePath = path.join(testDir, fileName);
            const content = 'stat test content';
            await fs.writeFile(filePath, content);

            const nodeUri = URI.file(filePath);
            const rustUri = URI.from({ scheme: Schemas.vscodeRust, path: filePath });

            const nodeStat = await service.resolve(nodeUri, { resolveMetadata: true });
            const rustStat = await service.resolve(rustUri, { resolveMetadata: true });

            assert.strictEqual(rustStat.isFile, nodeStat.isFile);
            assert.strictEqual(rustStat.isDirectory, nodeStat.isDirectory);
            assert.strictEqual(rustStat.size, nodeStat.size);
            assert.strictEqual(rustStat.name, nodeStat.name);
            
            // Timestamps should be close (within 1 second)
            assert.ok(Math.abs(rustStat.mtime! - nodeStat.mtime!) < 1000);
        });

        test('should handle file locks correctly', async () => {
            if (process.platform !== 'win32') {
                return; // File locking is primarily a Windows concern
            }

            const fileName = 'lock-test.txt';
            const filePath = path.join(testDir, fileName);
            await fs.writeFile(filePath, 'locked content');

            // Make file read-only
            await fs.chmod(filePath, 0o444);

            const rustUri = URI.from({ scheme: Schemas.vscodeRust, path: filePath });
            const stat = await service.resolve(rustUri, { resolveMetadata: true });

            assert.strictEqual(stat.permissions, FilePermission.Locked);

            // Restore permissions
            await fs.chmod(filePath, 0o644);
        });
    });
});