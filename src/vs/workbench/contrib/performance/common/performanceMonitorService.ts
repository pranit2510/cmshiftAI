/*---------------------------------------------------------------------------------------------
 *  Copyright (c) cmdshiftAI Team. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import {
	IPerformanceMonitorService, IPerformanceMetrics, IRustOperation, INodeOperation,
	IPerformanceIssue, IPerformanceReport, PerformanceReportType, RustOperationType,
	NodeOperationType, PerformanceIssueType, IFileOperationMetrics, IOperationMetric,
	IHistoricalData, IPerformanceComparison
} from './performance.js';

interface MetricsBuffer {
	rustOperations: IRustOperation[];
	nodeOperations: INodeOperation[];
	metrics: IPerformanceMetrics[];
}

export class PerformanceMonitorService extends Disposable implements IPerformanceMonitorService {
	readonly _serviceBrand: undefined;

	private readonly _onDidUpdateMetrics = this._register(new Emitter<IPerformanceMetrics>());
	readonly onDidUpdateMetrics: Event<IPerformanceMetrics> = this._onDidUpdateMetrics.event;

	private readonly _onDidDetectPerformanceIssue = this._register(new Emitter<IPerformanceIssue>());
	readonly onDidDetectPerformanceIssue: Event<IPerformanceIssue> = this._onDidDetectPerformanceIssue.event;

	private monitoring = false;
	private developerMode = false;
	private metricsInterval: any;
	private buffer: MetricsBuffer = {
		rustOperations: [],
		nodeOperations: [],
		metrics: []
	};

	private currentMetrics: IPerformanceMetrics;
	private readonly maxHistoricalMetrics = 3600; // 1 hour at 1 sample/second

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService
	) {
		super();

		this.currentMetrics = this.createEmptyMetrics();
		this.loadConfiguration();
	}

	private loadConfiguration(): void {
		const config = this.configurationService.getValue<any>('cmdshiftai.performance');
		this.developerMode = config?.developerMode || false;
		
		if (config?.enabled !== false) {
			this.startMonitoring();
		}
	}

	startMonitoring(): void {
		if (this.monitoring) {
			return;
		}

		this.monitoring = true;
		this.logService.info('[cmdshiftAI Performance] Starting performance monitoring');

		// Update metrics every second
		this.metricsInterval = setInterval(() => {
			this.updateMetrics();
		}, 1000);

		// Load Rust performance module
		this.initializeRustMetrics();
	}

	stopMonitoring(): void {
		if (!this.monitoring) {
			return;
		}

		this.monitoring = false;
		this.logService.info('[cmdshiftAI Performance] Stopping performance monitoring');

		if (this.metricsInterval) {
			clearInterval(this.metricsInterval);
			this.metricsInterval = undefined;
		}
	}

	getCurrentMetrics(): IPerformanceMetrics {
		return { ...this.currentMetrics };
	}

	getHistoricalMetrics(startTime: number, endTime: number): IPerformanceMetrics[] {
		return this.buffer.metrics.filter(m => 
			m.timestamp >= startTime && m.timestamp <= endTime
		);
	}

	trackRustOperation(operation: IRustOperation): void {
		if (!this.monitoring) {
			return;
		}

		this.buffer.rustOperations.push(operation);

		// Keep only last 1000 operations
		if (this.buffer.rustOperations.length > 1000) {
			this.buffer.rustOperations.shift();
		}

		if (this.developerMode) {
			this.logService.trace('[cmdshiftAI Performance] Rust operation:', operation);
		}

		// Check for slow operations
		if (operation.endTime && operation.startTime) {
			const duration = operation.endTime - operation.startTime;
			if (duration > 100) { // More than 100ms is considered slow
				this._onDidDetectPerformanceIssue.fire({
					severity: 'warning',
					type: PerformanceIssueType.SlowOperation,
					message: `Slow Rust operation detected: ${operation.type} took ${duration}ms`,
					details: operation,
					timestamp: Date.now()
				});
			}
		}
	}

	trackNodeOperation(operation: INodeOperation): void {
		if (!this.monitoring) {
			return;
		}

		this.buffer.nodeOperations.push(operation);

		// Keep only last 1000 operations
		if (this.buffer.nodeOperations.length > 1000) {
			this.buffer.nodeOperations.shift();
		}
	}

	async generateReport(type: PerformanceReportType): Promise<IPerformanceReport> {
		const now = Date.now();
		const hourAgo = now - (60 * 60 * 1000);
		
		const recentMetrics = this.getHistoricalMetrics(hourAgo, now);
		const rustOps = this.buffer.rustOperations.filter(op => 
			op.startTime >= hourAgo
		);
		const nodeOps = this.buffer.nodeOperations.filter(op => 
			op.startTime >= hourAgo
		);

		const report: IPerformanceReport = {
			type,
			generatedAt: now,
			timeRange: {
				start: hourAgo,
				end: now
			},
			summary: {
				totalRustOperations: rustOps.length,
				totalNodeOperations: nodeOps.length,
				averageSpeedImprovement: this.calculateAverageSpeedImprovement(recentMetrics),
				totalMemorySaved: this.calculateTotalMemorySaved(recentMetrics),
				uptimePercent: (recentMetrics.length / 3600) * 100
			}
		};

		if (type === PerformanceReportType.Detailed || type === PerformanceReportType.Comparison) {
			report.details = {
				operationBreakdown: this.calculateOperationBreakdown(rustOps),
				performanceIssues: this.getRecentPerformanceIssues(),
				recommendations: this.generateRecommendations(recentMetrics, rustOps)
			};
		}

		// Store report
		const reports = this.storageService.get('cmdshiftai.performanceReports', StorageScope.APPLICATION, '[]');
		const parsedReports = JSON.parse(reports);
		parsedReports.push(report);
		
		// Keep only last 30 reports
		if (parsedReports.length > 30) {
			parsedReports.shift();
		}
		
		this.storageService.store('cmdshiftai.performanceReports', JSON.stringify(parsedReports), StorageScope.APPLICATION);

		return report;
	}

	setDeveloperMode(enabled: boolean): void {
		this.developerMode = enabled;
		this.logService.info(`[cmdshiftAI Performance] Developer mode ${enabled ? 'enabled' : 'disabled'}`);
	}

	isDeveloperMode(): boolean {
		return this.developerMode;
	}

	private updateMetrics(): void {
		const now = Date.now();
		const oneSecondAgo = now - 1000;

		// Calculate operations per second
		const recentRustOps = this.buffer.rustOperations.filter(op => 
			op.startTime >= oneSecondAgo
		);
		const recentNodeOps = this.buffer.nodeOperations.filter(op => 
			op.startTime >= oneSecondAgo
		);

		// Get memory usage from Rust module
		const memoryInfo = this.getRustMemoryInfo();

		// Calculate file operation metrics
		const fileOperations = this.calculateFileOperationMetrics(recentRustOps);

		// Create new metrics
		const metrics: IPerformanceMetrics = {
			timestamp: now,
			rustOperationsPerSecond: recentRustOps.length,
			nodeOperationsPerSecond: recentNodeOps.length,
			rustMemoryUsageMB: memoryInfo.rustMemory,
			electronMemoryUsageMB: memoryInfo.electronMemory,
			memorySavedMB: memoryInfo.electronMemory - memoryInfo.rustMemory,
			memorySavedPercent: ((memoryInfo.electronMemory - memoryInfo.rustMemory) / memoryInfo.electronMemory) * 100,
			rustAverageLatency: this.calculateAverageLatency(recentRustOps),
			nodeAverageLatency: this.calculateAverageLatency(recentNodeOps),
			speedImprovement: this.calculateSpeedImprovement(recentRustOps, recentNodeOps),
			fileOperations,
			cacheHitRate: memoryInfo.cacheHitRate,
			cacheMisses: memoryInfo.cacheMisses,
			cacheSize: memoryInfo.cacheSize,
			cpuUsagePercent: memoryInfo.cpuUsage,
			activeHandles: memoryInfo.activeHandles,
			pendingOperations: memoryInfo.pendingOperations
		};

		this.currentMetrics = metrics;
		this.buffer.metrics.push(metrics);

		// Trim buffer
		if (this.buffer.metrics.length > this.maxHistoricalMetrics) {
			this.buffer.metrics.shift();
		}

		// Emit update event
		this._onDidUpdateMetrics.fire(metrics);

		// Check for issues
		this.checkForPerformanceIssues(metrics);
	}

	private initializeRustMetrics(): void {
		try {
			// This would connect to the Rust performance module
			// For now, we'll use mock data
			if (this.developerMode) {
				this.logService.info('[cmdshiftAI Performance] Initialized Rust metrics connection');
			}
		} catch (error) {
			this.logService.error('[cmdshiftAI Performance] Failed to initialize Rust metrics:', error);
		}
	}

	private getRustMemoryInfo(): any {
		// In real implementation, this would call into Rust module
		// For now, return mock data
		const processMemory = process.memoryUsage();
		return {
			rustMemory: 45, // MB - simulated Rust memory usage
			electronMemory: processMemory.heapUsed / 1024 / 1024,
			cacheHitRate: 0.85 + Math.random() * 0.1,
			cacheMisses: Math.floor(Math.random() * 10),
			cacheSize: 256, // MB
			cpuUsage: 5 + Math.random() * 10,
			activeHandles: Math.floor(Math.random() * 50),
			pendingOperations: Math.floor(Math.random() * 5)
		};
	}

	private calculateAverageLatency(operations: Array<IRustOperation | INodeOperation>): number {
		if (operations.length === 0) {
			return 0;
		}

		const completedOps = operations.filter(op => op.endTime);
		if (completedOps.length === 0) {
			return 0;
		}

		const totalLatency = completedOps.reduce((sum, op) => {
			return sum + (op.endTime! - op.startTime);
		}, 0);

		return totalLatency / completedOps.length * 1000; // Convert to microseconds
	}

	private calculateSpeedImprovement(rustOps: IRustOperation[], nodeOps: INodeOperation[]): number {
		const rustLatency = this.calculateAverageLatency(rustOps);
		const nodeLatency = this.calculateAverageLatency(nodeOps);

		if (rustLatency === 0 || nodeLatency === 0) {
			return 1;
		}

		return nodeLatency / rustLatency;
	}

	private calculateFileOperationMetrics(operations: IRustOperation[]): IFileOperationMetrics {
		const metrics: IFileOperationMetrics = {
			readOperations: this.createEmptyOperationMetric(),
			writeOperations: this.createEmptyOperationMetric(),
			statOperations: this.createEmptyOperationMetric(),
			readdirOperations: this.createEmptyOperationMetric()
		};

		const typeMap = {
			[RustOperationType.ReadFile]: metrics.readOperations,
			[RustOperationType.WriteFile]: metrics.writeOperations,
			[RustOperationType.Stat]: metrics.statOperations,
			[RustOperationType.ReadDir]: metrics.readdirOperations
		};

		operations.forEach(op => {
			const metric = typeMap[op.type];
			if (metric && op.endTime) {
				const duration = (op.endTime - op.startTime) * 1000; // to microseconds
				metric.count++;
				metric.totalTimeUs += duration;
				metric.minTimeUs = Math.min(metric.minTimeUs, duration);
				metric.maxTimeUs = Math.max(metric.maxTimeUs, duration);
			}
		});

		// Calculate averages and throughput
		Object.values(metrics).forEach(metric => {
			if (metric.count > 0) {
				metric.averageTimeUs = metric.totalTimeUs / metric.count;
			}
		});

		return metrics;
	}

	private createEmptyOperationMetric(): IOperationMetric {
		return {
			count: 0,
			totalTimeUs: 0,
			averageTimeUs: 0,
			minTimeUs: Number.MAX_VALUE,
			maxTimeUs: 0
		};
	}

	private createEmptyMetrics(): IPerformanceMetrics {
		return {
			timestamp: Date.now(),
			rustOperationsPerSecond: 0,
			nodeOperationsPerSecond: 0,
			rustMemoryUsageMB: 0,
			electronMemoryUsageMB: 0,
			memorySavedMB: 0,
			memorySavedPercent: 0,
			rustAverageLatency: 0,
			nodeAverageLatency: 0,
			speedImprovement: 1,
			fileOperations: {
				readOperations: this.createEmptyOperationMetric(),
				writeOperations: this.createEmptyOperationMetric(),
				statOperations: this.createEmptyOperationMetric(),
				readdirOperations: this.createEmptyOperationMetric()
			},
			cacheHitRate: 0,
			cacheMisses: 0,
			cacheSize: 0,
			cpuUsagePercent: 0,
			activeHandles: 0,
			pendingOperations: 0
		};
	}

	private checkForPerformanceIssues(metrics: IPerformanceMetrics): void {
		// Check memory usage
		if (metrics.rustMemoryUsageMB > 100) {
			this._onDidDetectPerformanceIssue.fire({
				severity: 'warning',
				type: PerformanceIssueType.HighMemoryUsage,
				message: `High memory usage detected: ${metrics.rustMemoryUsageMB.toFixed(2)}MB`,
				timestamp: Date.now()
			});
		}

		// Check cache performance
		if (metrics.cacheHitRate < 0.7) {
			this._onDidDetectPerformanceIssue.fire({
				severity: 'warning',
				type: PerformanceIssueType.CacheThrashing,
				message: `Low cache hit rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%`,
				timestamp: Date.now()
			});
		}

		// Check for performance regression
		if (metrics.speedImprovement < 5 && metrics.rustOperationsPerSecond > 0) {
			this._onDidDetectPerformanceIssue.fire({
				severity: 'warning',
				type: PerformanceIssueType.PerformanceRegression,
				message: `Performance below target: only ${metrics.speedImprovement.toFixed(1)}x improvement`,
				timestamp: Date.now()
			});
		}
	}

	private calculateAverageSpeedImprovement(metrics: IPerformanceMetrics[]): number {
		if (metrics.length === 0) {
			return 1;
		}

		const total = metrics.reduce((sum, m) => sum + m.speedImprovement, 0);
		return total / metrics.length;
	}

	private calculateTotalMemorySaved(metrics: IPerformanceMetrics[]): number {
		if (metrics.length === 0) {
			return 0;
		}

		const total = metrics.reduce((sum, m) => sum + m.memorySavedMB, 0);
		return total / metrics.length; // Average memory saved
	}

	private calculateOperationBreakdown(operations: IRustOperation[]): Map<string, IOperationMetric> {
		const breakdown = new Map<string, IOperationMetric>();

		operations.forEach(op => {
			if (!breakdown.has(op.type)) {
				breakdown.set(op.type, this.createEmptyOperationMetric());
			}

			const metric = breakdown.get(op.type)!;
			if (op.endTime) {
				const duration = (op.endTime - op.startTime) * 1000;
				metric.count++;
				metric.totalTimeUs += duration;
				metric.minTimeUs = Math.min(metric.minTimeUs, duration);
				metric.maxTimeUs = Math.max(metric.maxTimeUs, duration);
			}
		});

		// Calculate averages
		breakdown.forEach(metric => {
			if (metric.count > 0) {
				metric.averageTimeUs = metric.totalTimeUs / metric.count;
			}
		});

		return breakdown;
	}

	private getRecentPerformanceIssues(): IPerformanceIssue[] {
		// In real implementation, would track issues
		return [];
	}

	private generateRecommendations(metrics: IPerformanceMetrics[], operations: IRustOperation[]): string[] {
		const recommendations: string[] = [];

		// Analyze metrics for recommendations
		const avgCacheHit = metrics.reduce((sum, m) => sum + m.cacheHitRate, 0) / metrics.length;
		if (avgCacheHit < 0.8) {
			recommendations.push('Consider increasing cache size to improve hit rate');
		}

		const avgMemory = metrics.reduce((sum, m) => sum + m.rustMemoryUsageMB, 0) / metrics.length;
		if (avgMemory > 80) {
			recommendations.push('Memory usage is high. Consider optimizing cache eviction policy');
		}

		// Check for specific slow operations
		const slowOps = operations.filter(op => 
			op.endTime && (op.endTime - op.startTime) > 50
		);
		if (slowOps.length > operations.length * 0.1) {
			recommendations.push('More than 10% of operations are slow. Check for I/O bottlenecks');
		}

		return recommendations;
	}

	override dispose(): void {
		this.stopMonitoring();
		super.dispose();
	}
}