/*---------------------------------------------------------------------------------------------
 *  Copyright (c) cmdshiftAI Team. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IStatusbarService, StatusbarAlignment, IStatusbarEntry, IStatusbarEntryAccessor } from '../../../services/statusbar/browser/statusbar.js';
import { IPerformanceMonitorService, IPerformanceMetrics } from '../common/performance.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { localize } from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeColor } from '../../../../base/common/themables.js';

export class PerformanceStatusBarContribution extends Disposable {
	private static readonly PERFORMANCE_STATUS_ID = 'cmdshiftai.performanceStatus';
	private static readonly COMMAND_ID = 'cmdshiftai.showPerformanceDashboard';

	private statusBarEntry: IStatusbarEntryAccessor | undefined;
	private lastMetrics: IPerformanceMetrics | undefined;

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IPerformanceMonitorService private readonly performanceMonitorService: IPerformanceMonitorService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super();

		this.registerCommand();
		this.createStatusBarEntry();
		this.startMonitoring();
	}

	private registerCommand(): void {
		this._register(this.commandService.registerCommand({
			id: PerformanceStatusBarContribution.COMMAND_ID,
			handler: () => this.showPerformanceDashboard()
		}));
	}

	private createStatusBarEntry(): void {
		const entry: IStatusbarEntry = {
			name: localize('cmdshiftai.performance', "cmdshiftAI Performance"),
			text: this.getStatusText(),
			tooltip: this.getTooltip(),
			command: PerformanceStatusBarContribution.COMMAND_ID,
			ariaLabel: localize('cmdshiftai.performance.aria', "cmdshiftAI Performance Monitor"),
			kind: 'prominent'
		};

		this.statusBarEntry = this.statusbarService.addEntry(
			entry,
			PerformanceStatusBarContribution.PERFORMANCE_STATUS_ID,
			StatusbarAlignment.RIGHT,
			100 // High priority to show on the right
		);
	}

	private startMonitoring(): void {
		// Update status bar when metrics change
		this._register(this.performanceMonitorService.onDidUpdateMetrics(metrics => {
			this.lastMetrics = metrics;
			this.updateStatusBar();
		}));

		// Update immediately with current metrics
		this.lastMetrics = this.performanceMonitorService.getCurrentMetrics();
		this.updateStatusBar();
	}

	private updateStatusBar(): void {
		if (!this.statusBarEntry || !this.lastMetrics) {
			return;
		}

		const entry: IStatusbarEntry = {
			name: localize('cmdshiftai.performance', "cmdshiftAI Performance"),
			text: this.getStatusText(),
			tooltip: this.getTooltip(),
			command: PerformanceStatusBarContribution.COMMAND_ID,
			ariaLabel: this.getAriaLabel(),
			kind: 'prominent'
		};

		// Add color coding based on performance
		if (this.lastMetrics.speedImprovement >= 10) {
			entry.backgroundColor = new ThemeColor('statusBarItem.prominentBackground');
			entry.color = new ThemeColor('statusBarItem.prominentForeground');
		} else if (this.lastMetrics.speedImprovement >= 5) {
			entry.backgroundColor = new ThemeColor('statusBarItem.warningBackground');
			entry.color = new ThemeColor('statusBarItem.warningForeground');
		} else if (this.lastMetrics.speedImprovement < 2) {
			entry.backgroundColor = new ThemeColor('statusBarItem.errorBackground');
			entry.color = new ThemeColor('statusBarItem.errorForeground');
		}

		this.statusBarEntry.update(entry);
	}

	private getStatusText(): string {
		if (!this.lastMetrics) {
			return '$(rocket) cmdshiftAI';
		}

		const opsPerSec = this.lastMetrics.rustOperationsPerSecond;
		const speedup = this.lastMetrics.speedImprovement;
		const memorySaved = this.lastMetrics.memorySavedMB;

		// Format based on what's most impressive
		if (speedup >= 10) {
			return `$(rocket) ${speedup.toFixed(0)}x faster`;
		} else if (memorySaved >= 50) {
			return `$(rocket) -${memorySaved.toFixed(0)}MB`;
		} else if (opsPerSec > 0) {
			return `$(rocket) ${opsPerSec} ops/s`;
		} else {
			return '$(rocket) cmdshiftAI';
		}
	}

	private getTooltip(): string {
		if (!this.lastMetrics) {
			return localize('cmdshiftai.performance.loading', "cmdshiftAI Performance Monitor - Loading...");
		}

		const lines: string[] = [
			localize('cmdshiftai.performance.title', "cmdshiftAI Performance Monitor"),
			'',
			localize('cmdshiftai.performance.operations', "Rust Operations: {0}/sec", this.lastMetrics.rustOperationsPerSecond),
			localize('cmdshiftai.performance.memory', "Memory Saved: {0}MB ({1}%)", 
				this.lastMetrics.memorySavedMB.toFixed(1),
				this.lastMetrics.memorySavedPercent.toFixed(0)
			),
			localize('cmdshiftai.performance.speed', "Speed Improvement: {0}x", this.lastMetrics.speedImprovement.toFixed(1)),
			localize('cmdshiftai.performance.latency', "Average Latency: {0}μs", this.lastMetrics.rustAverageLatency.toFixed(0)),
			localize('cmdshiftai.performance.cache', "Cache Hit Rate: {0}%", (this.lastMetrics.cacheHitRate * 100).toFixed(1)),
			'',
			localize('cmdshiftai.performance.click', "Click to open performance dashboard")
		];

		// Add developer mode info
		if (this.performanceMonitorService.isDeveloperMode()) {
			lines.push('', localize('cmdshiftai.performance.devMode', "🔧 Developer Mode Active"));
		}

		return lines.join('\n');
	}

	private getAriaLabel(): string {
		if (!this.lastMetrics) {
			return localize('cmdshiftai.performance.aria.loading', "cmdshiftAI Performance Monitor loading");
		}

		return localize(
			'cmdshiftai.performance.aria.status',
			"cmdshiftAI Performance: {0} operations per second, {1}x faster than Electron, saving {2} megabytes of memory",
			this.lastMetrics.rustOperationsPerSecond,
			this.lastMetrics.speedImprovement.toFixed(1),
			this.lastMetrics.memorySavedMB.toFixed(0)
		);
	}

	private async showPerformanceDashboard(): Promise<void> {
		// This will open the performance view
		await this.commandService.executeCommand('cmdshiftai.performance.focus');
	}

	override dispose(): void {
		this.statusBarEntry?.dispose();
		super.dispose();
	}
}