/*---------------------------------------------------------------------------------------------
 *  Copyright (c) cmdshiftAI Team. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IOutputService, IOutputChannel } from '../../../services/output/common/output.js';
import { IPerformanceMonitorService, IRustOperation, IPerformanceMetrics, IPerformanceIssue } from '../common/performance.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { VSBuffer } from '../../../../base/common/buffer.js';

export class PerformanceDevTools extends Disposable {
	private readonly OUTPUT_CHANNEL_ID = 'cmdshiftAI Performance';
	private outputChannel: IOutputChannel;
	private operationLog: IRustOperation[] = [];
	private performanceTrace: PerformanceTrace | undefined;

	constructor(
		@IOutputService private readonly outputService: IOutputService,
		@IPerformanceMonitorService private readonly performanceMonitorService: IPerformanceMonitorService,
		@INotificationService private readonly notificationService: INotificationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IEditorService private readonly editorService: IEditorService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IFileService private readonly fileService: IFileService
	) {
		super();

		this.outputChannel = this.outputService.createOutputChannel(this.OUTPUT_CHANNEL_ID, { log: true });
		this._register(this.outputChannel);

		this.initialize();
	}

	private initialize(): void {
		// Log all Rust operations in developer mode
		this._register(this.performanceMonitorService.onDidUpdateMetrics(metrics => {
			if (this.performanceMonitorService.isDeveloperMode()) {
				this.logMetrics(metrics);
			}
		}));

		// Log performance issues
		this._register(this.performanceMonitorService.onDidDetectPerformanceIssue(issue => {
			if (this.performanceMonitorService.isDeveloperMode()) {
				this.logPerformanceIssue(issue);
			}
		}));
	}

	async showDevMenu(): Promise<void> {
		const items: IQuickPickItem[] = [
			{
				label: '$(pulse) Start Performance Trace',
				description: 'Record detailed performance trace for analysis'
			},
			{
				label: '$(stop) Stop Performance Trace',
				description: 'Stop recording and save trace data'
			},
			{
				label: '$(graph) Export Performance Data',
				description: 'Export current performance metrics to file'
			},
			{
				label: '$(trash) Clear Performance Data',
				description: 'Clear all collected performance data'
			},
			{
				label: '$(output) Show Performance Logs',
				description: 'Open performance output channel'
			},
			{
				label: '$(debug) Dump Rust Component State',
				description: 'Get current state of Rust components'
			},
			{
				label: '$(zap) Simulate High Load',
				description: 'Run performance stress test'
			},
			{
				label: '$(bug) Report Performance Issue',
				description: 'Create detailed performance issue report'
			}
		];

		const selected = await this.quickInputService.pick(items, {
			placeHolder: localize('performance.devTools.placeholder', "Select developer action")
		});

		if (!selected) {
			return;
		}

		switch (selected.label) {
			case '$(pulse) Start Performance Trace':
				await this.startPerformanceTrace();
				break;
			case '$(stop) Stop Performance Trace':
				await this.stopPerformanceTrace();
				break;
			case '$(graph) Export Performance Data':
				await this.exportPerformanceData();
				break;
			case '$(trash) Clear Performance Data':
				await this.clearPerformanceData();
				break;
			case '$(output) Show Performance Logs':
				this.outputChannel.show();
				break;
			case '$(debug) Dump Rust Component State':
				await this.dumpRustComponentState();
				break;
			case '$(zap) Simulate High Load':
				await this.simulateHighLoad();
				break;
			case '$(bug) Report Performance Issue':
				await this.createPerformanceIssueReport();
				break;
		}
	}

	private async startPerformanceTrace(): Promise<void> {
		if (this.performanceTrace) {
			this.notificationService.warn(localize('performance.trace.alreadyRunning', "Performance trace is already running"));
			return;
		}

		this.performanceTrace = {
			startTime: Date.now(),
			operations: [],
			metrics: [],
			issues: []
		};

		this.outputChannel.appendLine(`[${new Date().toISOString()}] Performance trace started`);
		this.notificationService.info(localize('performance.trace.started', "Performance trace started"));
	}

	private async stopPerformanceTrace(): Promise<void> {
		if (!this.performanceTrace) {
			this.notificationService.warn(localize('performance.trace.notRunning', "No performance trace is running"));
			return;
		}

		const trace = this.performanceTrace;
		this.performanceTrace = undefined;

		const duration = Date.now() - trace.startTime;
		this.outputChannel.appendLine(`[${new Date().toISOString()}] Performance trace stopped. Duration: ${duration}ms`);

		// Save trace to file
		const traceData = {
			version: '1.0',
			startTime: trace.startTime,
			endTime: Date.now(),
			duration,
			operations: trace.operations,
			metrics: trace.metrics,
			issues: trace.issues,
			summary: this.generateTraceSummary(trace)
		};

		const uri = URI.file(`${process.env.HOME || process.env.USERPROFILE}/cmdshiftai-trace-${Date.now()}.json`);
		await this.fileService.writeFile(uri, VSBuffer.fromString(JSON.stringify(traceData, null, 2)));

		const openTrace = await this.notificationService.prompt(
			Severity.Info,
			localize('performance.trace.saved', "Performance trace saved to {0}", uri.fsPath),
			[{
				label: localize('performance.trace.open', "Open Trace"),
				run: () => this.editorService.openEditor({ resource: uri })
			}]
		);
	}

	private async exportPerformanceData(): Promise<void> {
		const report = await this.performanceMonitorService.generateReport('detailed');
		const data = {
			exportDate: new Date().toISOString(),
			report,
			currentMetrics: this.performanceMonitorService.getCurrentMetrics(),
			historicalMetrics: this.performanceMonitorService.getHistoricalMetrics(
				Date.now() - 3600000,
				Date.now()
			)
		};

		const uri = URI.file(`${process.env.HOME || process.env.USERPROFILE}/cmdshiftai-performance-${Date.now()}.json`);
		await this.fileService.writeFile(uri, VSBuffer.fromString(JSON.stringify(data, null, 2)));

		this.notificationService.info(
			localize('performance.export.success', "Performance data exported to {0}", uri.fsPath)
		);
	}

	private async clearPerformanceData(): Promise<void> {
		const confirm = await this.notificationService.confirm({
			message: localize('performance.clear.confirm', "Are you sure you want to clear all performance data?"),
			primaryButton: localize('performance.clear.yes', "Clear Data")
		});

		if (confirm.confirmed) {
			// Clear operation log
			this.operationLog = [];
			
			// Clear output channel
			this.outputChannel.clear();
			
			this.notificationService.info(localize('performance.clear.success', "Performance data cleared"));
		}
	}

	private async dumpRustComponentState(): Promise<void> {
		this.outputChannel.appendLine('\n=== Rust Component State Dump ===');
		this.outputChannel.appendLine(`Timestamp: ${new Date().toISOString()}`);
		
		const metrics = this.performanceMonitorService.getCurrentMetrics();
		
		this.outputChannel.appendLine('\nCurrent Metrics:');
		this.outputChannel.appendLine(`  Rust Operations/sec: ${metrics.rustOperationsPerSecond}`);
		this.outputChannel.appendLine(`  Memory Usage: ${metrics.rustMemoryUsageMB.toFixed(2)}MB`);
		this.outputChannel.appendLine(`  Cache Hit Rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%`);
		this.outputChannel.appendLine(`  Active Handles: ${metrics.activeHandles}`);
		this.outputChannel.appendLine(`  Pending Operations: ${metrics.pendingOperations}`);
		
		this.outputChannel.appendLine('\nFile Operation Statistics:');
		const ops = metrics.fileOperations;
		this.outputChannel.appendLine(`  Read: ${ops.readOperations.count} ops, avg ${ops.readOperations.averageTimeUs.toFixed(0)}μs`);
		this.outputChannel.appendLine(`  Write: ${ops.writeOperations.count} ops, avg ${ops.writeOperations.averageTimeUs.toFixed(0)}μs`);
		this.outputChannel.appendLine(`  Stat: ${ops.statOperations.count} ops, avg ${ops.statOperations.averageTimeUs.toFixed(0)}μs`);
		this.outputChannel.appendLine(`  ReadDir: ${ops.readdirOperations.count} ops, avg ${ops.readdirOperations.averageTimeUs.toFixed(0)}μs`);
		
		this.outputChannel.appendLine('\n=== End State Dump ===\n');
		this.outputChannel.show();
	}

	private async simulateHighLoad(): Promise<void> {
		const options = await this.quickInputService.pick([
			{ label: 'Light Load', description: '100 operations' },
			{ label: 'Medium Load', description: '1000 operations' },
			{ label: 'Heavy Load', description: '10000 operations' }
		], {
			placeHolder: localize('performance.simulate.placeholder', "Select load level")
		});

		if (!options) {
			return;
		}

		const count = options.label === 'Light Load' ? 100 : 
			options.label === 'Medium Load' ? 1000 : 10000;

		this.notificationService.info(
			localize('performance.simulate.started', "Starting load simulation with {0} operations", count)
		);

		// Simulate operations
		for (let i = 0; i < count; i++) {
			const operation: IRustOperation = {
				id: `sim-${i}`,
				type: ['readFile', 'writeFile', 'stat', 'readDir'][Math.floor(Math.random() * 4)] as any,
				startTime: Date.now(),
				endTime: Date.now() + Math.random() * 10,
				success: Math.random() > 0.1,
				metadata: {
					path: `/simulated/path/${i}`,
					size: Math.floor(Math.random() * 1000000),
					cached: Math.random() > 0.5
				}
			};

			this.performanceMonitorService.trackRustOperation(operation);
			
			// Add small delay to spread operations
			if (i % 100 === 0) {
				await new Promise(resolve => setTimeout(resolve, 10));
			}
		}

		this.notificationService.info(
			localize('performance.simulate.completed', "Load simulation completed")
		);
	}

	private async createPerformanceIssueReport(): Promise<void> {
		const metrics = this.performanceMonitorService.getCurrentMetrics();
		const report = await this.performanceMonitorService.generateReport('detailed');

		const issueReport = `# cmdshiftAI Performance Issue Report

## Environment
- Date: ${new Date().toISOString()}
- Platform: ${process.platform}
- Version: ${process.env.VSCODE_VERSION || 'Unknown'}

## Current Performance Metrics
- Speed Improvement: ${metrics.speedImprovement.toFixed(1)}x
- Rust Operations/sec: ${metrics.rustOperationsPerSecond}
- Memory Usage: ${metrics.rustMemoryUsageMB.toFixed(2)}MB
- Cache Hit Rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%

## Issues Detected
${report.details?.performanceIssues.map(issue => 
	`- **${issue.type}**: ${issue.message}`
).join('\n') || 'No issues detected'}

## Recommendations
${report.details?.recommendations.join('\n') || 'No recommendations'}

## Additional Information
Please describe the performance issue you're experiencing:
[Your description here]

## Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Step 3]
`;

		const uri = URI.file(`${process.env.HOME || process.env.USERPROFILE}/cmdshiftai-issue-${Date.now()}.md`);
		await this.fileService.writeFile(uri, VSBuffer.fromString(issueReport));
		await this.editorService.openEditor({ resource: uri });

		this.notificationService.info(
			localize('performance.issue.created', "Performance issue report created. Please fill in the details.")
		);
	}

	private logMetrics(metrics: IPerformanceMetrics): void {
		if (this.performanceTrace) {
			this.performanceTrace.metrics.push({ ...metrics });
		}

		// Log significant changes
		const speedChange = metrics.speedImprovement;
		if (speedChange < 5) {
			this.outputChannel.appendLine(
				`[${new Date().toISOString()}] ⚠️  Low performance: ${speedChange.toFixed(1)}x improvement`
			);
		}
	}

	private logPerformanceIssue(issue: IPerformanceIssue): void {
		if (this.performanceTrace) {
			this.performanceTrace.issues.push(issue);
		}

		const icon = issue.severity === 'error' ? '❌' : '⚠️';
		this.outputChannel.appendLine(
			`[${new Date().toISOString()}] ${icon} ${issue.type}: ${issue.message}`
		);

		if (issue.details) {
			this.outputChannel.appendLine(`  Details: ${JSON.stringify(issue.details)}`);
		}
	}

	private generateTraceSummary(trace: PerformanceTrace): any {
		const operationCounts = new Map<string, number>();
		let totalLatency = 0;
		let successCount = 0;

		trace.operations.forEach(op => {
			const count = operationCounts.get(op.type) || 0;
			operationCounts.set(op.type, count + 1);
			
			if (op.endTime) {
				totalLatency += op.endTime - op.startTime;
			}
			
			if (op.success) {
				successCount++;
			}
		});

		return {
			totalOperations: trace.operations.length,
			operationBreakdown: Array.from(operationCounts.entries()),
			averageLatency: trace.operations.length > 0 ? totalLatency / trace.operations.length : 0,
			successRate: trace.operations.length > 0 ? successCount / trace.operations.length : 0,
			issueCount: trace.issues.length,
			metricsCollected: trace.metrics.length
		};
	}
}

interface PerformanceTrace {
	startTime: number;
	operations: IRustOperation[];
	metrics: IPerformanceMetrics[];
	issues: IPerformanceIssue[];
}