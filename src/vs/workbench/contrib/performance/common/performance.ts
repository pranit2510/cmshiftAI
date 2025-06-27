/*---------------------------------------------------------------------------------------------
 *  Copyright (c) cmdshiftAI Team. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IPerformanceMonitorService = createDecorator<IPerformanceMonitorService>('performanceMonitorService');

export interface IPerformanceMonitorService {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when performance metrics are updated
	 */
	readonly onDidUpdateMetrics: Event<IPerformanceMetrics>;

	/**
	 * Event fired when a performance issue is detected
	 */
	readonly onDidDetectPerformanceIssue: Event<IPerformanceIssue>;

	/**
	 * Start monitoring performance
	 */
	startMonitoring(): void;

	/**
	 * Stop monitoring performance
	 */
	stopMonitoring(): void;

	/**
	 * Get current performance metrics
	 */
	getCurrentMetrics(): IPerformanceMetrics;

	/**
	 * Get historical metrics for a time range
	 */
	getHistoricalMetrics(startTime: number, endTime: number): IPerformanceMetrics[];

	/**
	 * Track a Rust operation
	 */
	trackRustOperation(operation: IRustOperation): void;

	/**
	 * Track a Node.js operation for comparison
	 */
	trackNodeOperation(operation: INodeOperation): void;

	/**
	 * Generate performance report
	 */
	generateReport(type: PerformanceReportType): Promise<IPerformanceReport>;

	/**
	 * Enable/disable developer mode
	 */
	setDeveloperMode(enabled: boolean): void;

	/**
	 * Check if developer mode is enabled
	 */
	isDeveloperMode(): boolean;
}

export interface IPerformanceMetrics {
	timestamp: number;
	
	// Operations per second
	rustOperationsPerSecond: number;
	nodeOperationsPerSecond: number;
	
	// Memory metrics
	rustMemoryUsageMB: number;
	electronMemoryUsageMB: number;
	memorySavedMB: number;
	memorySavedPercent: number;
	
	// Operation latencies (in microseconds)
	rustAverageLatency: number;
	nodeAverageLatency: number;
	speedImprovement: number;
	
	// File system specific metrics
	fileOperations: IFileOperationMetrics;
	
	// Cache metrics
	cacheHitRate: number;
	cacheMisses: number;
	cacheSize: number;
	
	// System metrics
	cpuUsagePercent: number;
	activeHandles: number;
	pendingOperations: number;
}

export interface IFileOperationMetrics {
	readOperations: IOperationMetric;
	writeOperations: IOperationMetric;
	statOperations: IOperationMetric;
	readdirOperations: IOperationMetric;
}

export interface IOperationMetric {
	count: number;
	totalTimeUs: number;
	averageTimeUs: number;
	minTimeUs: number;
	maxTimeUs: number;
	throughputMBps?: number;
}

export interface IRustOperation {
	id: string;
	type: RustOperationType;
	startTime: number;
	endTime?: number;
	success: boolean;
	error?: string;
	metadata?: {
		path?: string;
		size?: number;
		cached?: boolean;
		method?: 'mmap' | 'io_uring' | 'standard';
	};
}

export interface INodeOperation {
	id: string;
	type: NodeOperationType;
	startTime: number;
	endTime?: number;
	success: boolean;
	error?: string;
	metadata?: {
		path?: string;
		size?: number;
	};
}

export const enum RustOperationType {
	ReadFile = 'readFile',
	WriteFile = 'writeFile',
	Stat = 'stat',
	ReadDir = 'readDir',
	Watch = 'watch',
	Delete = 'delete',
	Rename = 'rename',
	Copy = 'copy'
}

export const enum NodeOperationType {
	ReadFile = 'readFile',
	WriteFile = 'writeFile',
	Stat = 'stat',
	ReadDir = 'readDir'
}

export interface IPerformanceIssue {
	severity: 'warning' | 'error';
	type: PerformanceIssueType;
	message: string;
	details?: any;
	timestamp: number;
}

export const enum PerformanceIssueType {
	HighMemoryUsage = 'highMemoryUsage',
	SlowOperation = 'slowOperation',
	CacheThrashing = 'cacheThrashing',
	RustComponentError = 'rustComponentError',
	PerformanceRegression = 'performanceRegression'
}

export const enum PerformanceReportType {
	Summary = 'summary',
	Detailed = 'detailed',
	Comparison = 'comparison',
	Daily = 'daily'
}

export interface IPerformanceReport {
	type: PerformanceReportType;
	generatedAt: number;
	timeRange: {
		start: number;
		end: number;
	};
	summary: {
		totalRustOperations: number;
		totalNodeOperations: number;
		averageSpeedImprovement: number;
		totalMemorySaved: number;
		uptimePercent: number;
	};
	details?: {
		operationBreakdown: Map<string, IOperationMetric>;
		performanceIssues: IPerformanceIssue[];
		recommendations: string[];
	};
}

export interface IPerformanceViewData {
	currentMetrics: IPerformanceMetrics;
	historicalData: IHistoricalData;
	comparisons: IPerformanceComparison[];
}

export interface IHistoricalData {
	timestamps: number[];
	rustOps: number[];
	nodeOps: number[];
	memoryUsage: number[];
	latencies: number[];
}

export interface IPerformanceComparison {
	operation: string;
	rustTime: number;
	nodeTime: number;
	improvement: number;
	samples: number;
}

/**
 * Configuration for performance monitoring
 */
export interface IPerformanceMonitorConfig {
	enabled: boolean;
	sampleInterval: number; // milliseconds
	retentionPeriod: number; // hours
	developerMode: boolean;
	statusBarEnabled: boolean;
	telemetryEnabled: boolean;
}

/**
 * Performance monitor status bar contribution
 */
export interface IPerformanceStatusBarEntry {
	text: string;
	tooltip: string;
	color?: string;
	backgroundColor?: string;
	command?: string;
}