/*---------------------------------------------------------------------------------------------
 *  Copyright (c) cmdshiftAI Team. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IPerformanceMonitorService, IPerformanceMetrics, IPerformanceIssue, PerformanceIssueType } from './performance.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IProductService } from '../../../../platform/product/common/productService.js';

interface PerformanceTelemetryEvent {
	eventName: string;
	data: any;
}

export class PerformanceTelemetryReporter extends Disposable {
	private static readonly TELEMETRY_PREFIX = 'cmdshiftai.performance';
	private telemetryEnabled: boolean = true;
	private reportInterval: any;
	private aggregatedMetrics: AggregatedMetrics = {
		totalRustOperations: 0,
		totalNodeOperations: 0,
		totalMemorySaved: 0,
		maxSpeedImprovement: 0,
		minSpeedImprovement: Number.MAX_VALUE,
		avgSpeedImprovement: 0,
		performanceIssues: new Map(),
		sessionStart: Date.now()
	};

	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IPerformanceMonitorService private readonly performanceMonitorService: IPerformanceMonitorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IProductService private readonly productService: IProductService
	) {
		super();

		this.initialize();
	}

	private initialize(): void {
		// Check if telemetry is enabled
		const config = this.configurationService.getValue<any>('cmdshiftai.performance.telemetry');
		this.telemetryEnabled = config?.enabled !== false;

		if (!this.telemetryEnabled) {
			return;
		}

		// Track performance metrics
		this._register(this.performanceMonitorService.onDidUpdateMetrics(metrics => {
			this.trackMetrics(metrics);
		}));

		// Track performance issues
		this._register(this.performanceMonitorService.onDidDetectPerformanceIssue(issue => {
			this.trackPerformanceIssue(issue);
		}));

		// Send aggregated reports every 30 minutes
		this.reportInterval = setInterval(() => {
			this.sendAggregatedReport();
		}, 30 * 60 * 1000);

		// Send initial session start event
		this.sendEvent('sessionStart', {
			version: this.productService.version,
			platform: process.platform,
			arch: process.arch
		});
	}

	private trackMetrics(metrics: IPerformanceMetrics): void {
		if (!this.telemetryEnabled) {
			return;
		}

		// Update aggregated metrics
		this.aggregatedMetrics.totalRustOperations += metrics.rustOperationsPerSecond;
		this.aggregatedMetrics.totalNodeOperations += metrics.nodeOperationsPerSecond;
		this.aggregatedMetrics.totalMemorySaved += metrics.memorySavedMB;
		this.aggregatedMetrics.maxSpeedImprovement = Math.max(
			this.aggregatedMetrics.maxSpeedImprovement,
			metrics.speedImprovement
		);
		this.aggregatedMetrics.minSpeedImprovement = Math.min(
			this.aggregatedMetrics.minSpeedImprovement,
			metrics.speedImprovement
		);

		// Track significant events
		if (metrics.speedImprovement >= 10) {
			this.sendEvent('highPerformance', {
				speedImprovement: metrics.speedImprovement,
				operationsPerSecond: metrics.rustOperationsPerSecond,
				memorySaved: metrics.memorySavedMB
			});
		}

		if (metrics.cacheHitRate < 0.5) {
			this.sendEvent('lowCacheHitRate', {
				hitRate: metrics.cacheHitRate,
				cacheMisses: metrics.cacheMisses
			});
		}
	}

	private trackPerformanceIssue(issue: IPerformanceIssue): void {
		if (!this.telemetryEnabled) {
			return;
		}

		// Count issues by type
		const count = this.aggregatedMetrics.performanceIssues.get(issue.type) || 0;
		this.aggregatedMetrics.performanceIssues.set(issue.type, count + 1);

		// Send immediate telemetry for critical issues
		if (issue.severity === 'error') {
			this.sendEvent('criticalPerformanceIssue', {
				type: issue.type,
				message: issue.message,
				details: this.sanitizeDetails(issue.details)
			});
		}
	}

	private sendAggregatedReport(): void {
		if (!this.telemetryEnabled || this.aggregatedMetrics.totalRustOperations === 0) {
			return;
		}

		const sessionDuration = Date.now() - this.aggregatedMetrics.sessionStart;
		const avgSpeedImprovement = (this.aggregatedMetrics.maxSpeedImprovement + 
			this.aggregatedMetrics.minSpeedImprovement) / 2;

		const report = {
			sessionDuration,
			totalRustOperations: this.aggregatedMetrics.totalRustOperations,
			totalNodeOperations: this.aggregatedMetrics.totalNodeOperations,
			totalMemorySaved: this.aggregatedMetrics.totalMemorySaved,
			avgSpeedImprovement,
			maxSpeedImprovement: this.aggregatedMetrics.maxSpeedImprovement,
			minSpeedImprovement: this.aggregatedMetrics.minSpeedImprovement,
			performanceIssues: Array.from(this.aggregatedMetrics.performanceIssues.entries()).map(
				([type, count]) => ({ type, count })
			)
		};

		this.sendEvent('performanceReport', report);

		// Reset aggregated metrics
		this.resetAggregatedMetrics();
	}

	private sendEvent(eventName: string, data: any): void {
		if (!this.telemetryEnabled) {
			return;
		}

		const telemetryEvent: PerformanceTelemetryEvent = {
			eventName: `${PerformanceTelemetryReporter.TELEMETRY_PREFIX}.${eventName}`,
			data: this.sanitizeData(data)
		};

		this.telemetryService.publicLog(telemetryEvent.eventName, telemetryEvent.data);
	}

	private sanitizeData(data: any): any {
		// Remove any potentially sensitive information
		const sanitized = { ...data };

		// Remove file paths
		if (sanitized.path) {
			sanitized.path = '<redacted>';
		}

		// Remove error stack traces
		if (sanitized.error) {
			sanitized.error = sanitized.error.message || '<error>';
		}

		return sanitized;
	}

	private sanitizeDetails(details: any): any {
		if (!details) {
			return undefined;
		}

		// Only include non-sensitive details
		return {
			type: details.type,
			size: details.size,
			cached: details.cached,
			method: details.method
		};
	}

	private resetAggregatedMetrics(): void {
		this.aggregatedMetrics = {
			totalRustOperations: 0,
			totalNodeOperations: 0,
			totalMemorySaved: 0,
			maxSpeedImprovement: 0,
			minSpeedImprovement: Number.MAX_VALUE,
			avgSpeedImprovement: 0,
			performanceIssues: new Map(),
			sessionStart: Date.now()
		};
	}

	setTelemetryEnabled(enabled: boolean): void {
		this.telemetryEnabled = enabled;
		
		if (!enabled) {
			// Send final report before disabling
			this.sendAggregatedReport();
		}
	}

	override dispose(): void {
		// Send final report
		this.sendAggregatedReport();

		// Clear interval
		if (this.reportInterval) {
			clearInterval(this.reportInterval);
		}

		super.dispose();
	}
}

interface AggregatedMetrics {
	totalRustOperations: number;
	totalNodeOperations: number;
	totalMemorySaved: number;
	maxSpeedImprovement: number;
	minSpeedImprovement: number;
	avgSpeedImprovement: number;
	performanceIssues: Map<PerformanceIssueType, number>;
	sessionStart: number;
}

/**
 * Performance telemetry events for analysis
 */
export const PerformanceTelemetryEvents = {
	SESSION_START: 'sessionStart',
	PERFORMANCE_REPORT: 'performanceReport',
	HIGH_PERFORMANCE: 'highPerformance',
	LOW_CACHE_HIT_RATE: 'lowCacheHitRate',
	CRITICAL_ISSUE: 'criticalPerformanceIssue',
	RUST_OPERATION: 'rustOperation',
	PERFORMANCE_REGRESSION: 'performanceRegression',
	OPTIMIZATION_OPPORTUNITY: 'optimizationOpportunity'
};