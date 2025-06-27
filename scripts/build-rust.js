#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) cmdshiftAI Team. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const RUST_DIR = path.join(__dirname, '..', 'rust-components');
const BUILD_MODE = process.argv.includes('--release') ? 'release' : 'debug';
const IS_DEBUG = process.argv.includes('--debug');

// Platform-specific configurations
const PLATFORMS = {
    'darwin': {
        target: process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin',
        ext: '.dylib',
        prefix: 'lib'
    },
    'win32': {
        target: process.arch === 'x64' ? 'x86_64-pc-windows-msvc' : 'i686-pc-windows-msvc',
        ext: '.dll',
        prefix: ''
    },
    'linux': {
        target: process.arch === 'x64' ? 'x86_64-unknown-linux-gnu' : 'i686-unknown-linux-gnu',
        ext: '.so',
        prefix: 'lib'
    }
};

const platform = PLATFORMS[os.platform()];
if (!platform) {
    console.error(`Unsupported platform: ${os.platform()}`);
    process.exit(1);
}

async function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        console.log(`Running: ${command} ${args.join(' ')}`);

        const proc = spawn(command, args, {
            stdio: 'inherit',
            cwd: RUST_DIR,
            ...options
        });

        proc.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Command failed with code ${code}`));
            } else {
                resolve();
            }
        });

        proc.on('error', reject);
    });
}

async function checkRustInstallation() {
    try {
        await runCommand('rustc', ['--version']);
        await runCommand('cargo', ['--version']);
    } catch (error) {
        console.error('Rust is not installed or not in PATH');
        console.error('Please install Rust from https://rustup.rs/');
        process.exit(1);
    }
}

async function installRustTarget() {
    console.log(`Ensuring Rust target ${platform.target} is installed...`);
    try {
        await runCommand('rustup', ['target', 'add', platform.target]);
    } catch (error) {
        console.warn('Failed to add Rust target, continuing anyway...');
    }
}

async function buildRust() {
    const args = ['build', '--target', platform.target];

    if (BUILD_MODE === 'release') {
        args.push('--release');
    }

    // Add features
    args.push('--features', 'napi');

    await runCommand('cargo', args);
}

async function copyBinary() {
    const buildDir = path.join(RUST_DIR, 'target', platform.target, BUILD_MODE);
    const libName = `${platform.prefix}cmdshiftai_core${platform.ext}`;
    const sourcePath = path.join(buildDir, libName);
    const targetPath = path.join(RUST_DIR, 'cmdshiftai_core.node');

    if (!fs.existsSync(sourcePath)) {
        throw new Error(`Built library not found at ${sourcePath}`);
    }

    console.log(`Copying ${sourcePath} to ${targetPath}`);
    fs.copyFileSync(sourcePath, targetPath);

    // Set executable permissions on Unix
    if (os.platform() !== 'win32') {
        fs.chmodSync(targetPath, '755');
    }
}

async function generateTypeDefinitions() {
    console.log('Generating TypeScript definitions...');

    const indexDts = `export declare class CmdShiftAI {
    constructor();
    getVersion(): Promise<string>;
}

export declare class FileOperations {
    constructor();
    readFile(path: string): Promise<Buffer>;
    writeFile(path: string, content: Buffer): Promise<void>;
    readFileMmap(path: string): Promise<Buffer>;
    fileExists(path: string): Promise<boolean>;
    getFileStats(path: string): Promise<FileStats>;
    listDirectory(path: string): Promise<DirEntry[]>;
}

export interface FileStats {
    size: number;
    isFile: boolean;
    isDirectory: boolean;
    modified: number;
}

export interface DirEntry {
    name: string;
    path: string;
    isFile: boolean;
    isDirectory: boolean;
    size: number;
}

export declare class SearchEngine {
    constructor();
    searchPattern(rootPath: string, pattern: string, options?: SearchOptions): Promise<SearchResult[]>;
    searchFiles(rootPath: string, filePattern: string): Promise<string[]>;
}

export interface SearchOptions {
    caseSensitive?: boolean;
    includeHidden?: boolean;
    disableIgnore?: boolean;
    disableGitignore?: boolean;
    maxDepth?: number;
    includePatterns?: string[];
    excludePatterns?: string[];
}

export interface SearchResult {
    filePath: string;
    matches: Match[];
}

export interface Match {
    lineNumber: number;
    columnStart: number;
    columnEnd: number;
    text: string;
}

export declare class PerformanceMonitor {
    constructor();
    startOperation(name: string): string;
    endOperation(operationId: string): Promise<OperationResult>;
    benchmarkFileRead(path: string): Promise<BenchmarkResult>;
    getMetricsSummary(): MetricsSummary;
}

export interface OperationResult {
    name: string;
    durationMs: number;
    memoryDeltaBytes: number;
}

export interface BenchmarkResult {
    rustTimeMs: number;
    nodeTimeMs: number;
    speedup: number;
}

export interface MetricsSummary {
    memoryUsageMb: number;
    activeOperations: number;
}

export declare class AIOrchestrator {
    constructor();
    prepareContext(request: ContextRequest): Promise<Context>;
    cacheContext(key: string, context: Context): Promise<void>;
    getCachedContext(key: string): Promise<Context | null>;
    routeToModel(task: Task): Promise<ModelSelection>;
}

export interface ContextRequest {
    filePath?: string;
    projectPath?: string;
    cursorPosition?: Position;
    selectedText?: string;
    includeSymbols?: boolean;
}

export interface Position {
    line: number;
    column: number;
}

export interface Context {
    file: FileContext;
    project: ProjectContext;
    symbols: SymbolContext;
    metadata: ContextMetadata;
}

export interface FileContext {
    path: string;
    contentPreview: string;
    language: string;
    imports: string[];
    exports: string[];
}

export interface ProjectContext {
    rootPath: string;
    framework: string;
    dependencies: string[];
    structureSummary: string;
}

export interface SymbolContext {
    definitions: string[];
    references: string[];
    types: string[];
}

export interface ContextMetadata {
    preparationTimeMs: number;
    totalTokens: number;
}

export interface Task {
    taskType: string;
    complexity: number;
    contextSize: number;
    requiresWeb: boolean;
}

export interface ModelSelection {
    modelId: string;
    reasoning: string;
}
`;

    fs.writeFileSync(path.join(RUST_DIR, 'index.d.ts'), indexDts);
}

async function main() {
    console.log('Building cmdshiftAI Rust components...');
    console.log(`Platform: ${os.platform()} ${process.arch}`);
    console.log(`Build mode: ${BUILD_MODE}`);
    console.log(`Target: ${platform.target}`);

    try {
        await checkRustInstallation();
        await installRustTarget();
        await buildRust();
        await copyBinary();
        await generateTypeDefinitions();

        console.log('✅ Rust components built successfully!');
    } catch (error) {
        console.error('❌ Build failed:', error.message);
        process.exit(1);
    }
}

main();
