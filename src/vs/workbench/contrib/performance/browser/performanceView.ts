/*---------------------------------------------------------------------------------------------
 *  Copyright (c) cmdshiftAI Team. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITreeItem, ITreeViewDataProvider } from '../../../common/views.js';
import { IPerformanceMonitorService, IPerformanceMetrics, IFileOperationMetrics, IOperationMetric } from '../common/performance.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { URI } from '../../../../base/common/uri.js';

interface PerformanceTreeItem extends ITreeItem {
	contextValue?: string;
	children?: PerformanceTreeItem[];
	metric?: any;
}

export class PerformanceViewDataProvider extends Disposable implements ITreeViewDataProvider<PerformanceTreeItem> {
	private _onDidChangeTreeData = this._register(new Emitter<PerformanceTreeItem | undefined>());
	readonly onDidChangeTreeData: Event<PerformanceTreeItem | undefined> = this._onDidChangeTreeData.event;

	private currentMetrics: IPerformanceMetrics | undefined;
	private rootItems: PerformanceTreeItem[] = [];

	constructor(
		@IPerformanceMonitorService private readonly performanceMonitorService: IPerformanceMonitorService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super();

		this.initialize();
	}

	private initialize(): void {
		// Update when metrics change
		this._register(this.performanceMonitorService.onDidUpdateMetrics(metrics => {
			this.currentMetrics = metrics;
			this.refresh();
		}));

		// Initial load
		this.currentMetrics = this.performanceMonitorService.getCurrentMetrics();
		this.buildTree();
	}

	getTreeItem(element: PerformanceTreeItem): ITreeItem {
		return element;
	}

	getChildren(element?: PerformanceTreeItem): PerformanceTreeItem[] | undefined {
		if (!element) {
			return this.rootItems;
		}
		return element.children;
	}

	getParent(element: PerformanceTreeItem): PerformanceTreeItem | undefined {
		// Simple implementation - could be enhanced with proper parent tracking
		return undefined;
	}

	private refresh(): void {
		this.buildTree();
		this._onDidChangeTreeData.fire(undefined);
	}

	private buildTree(): void {
		if (!this.currentMetrics) {
			this.rootItems = [{
				handle: 'loading',
				label: localize('performance.loading', "Loading performance data..."),
				collapsibleState: 0
			}];
			return;
		}

		this.rootItems = [
			this.createOverviewSection(),
			this.createOperationsSection(),
			this.createMemorySection(),
			this.createCacheSection(),
			this.createSystemSection()
		];

		if (this.performanceMonitorService.isDeveloperMode()) {
			this.rootItems.push(this.createDeveloperSection());
		}
	}

	private createOverviewSection(): PerformanceTreeItem {
		const m = this.currentMetrics!;
		
		return {
			handle: 'overview',
			label: localize('performance.overview', "Overview"),
			collapsibleState: 2, // Expanded
			iconPath: new ThemeIcon('dashboard'),
			contextValue: 'overview',
			children: [
				{
					handle: 'overview.speed',
					label: localize('performance.speedImprovement', "Speed Improvement: {0}x", m.speedImprovement.toFixed(1)),
					description: this.getSpeedDescription(m.speedImprovement),
					iconPath: this.getSpeedIcon(m.speedImprovement),
					collapsibleState: 0,
					tooltip: localize('performance.speedTooltip', "Rust operations are {0}x faster than Node.js", m.speedImprovement.toFixed(1))
				},
				{
					handle: 'overview.operations',
					label: localize('performance.totalOperations', "Operations/sec: {0}", m.rustOperationsPerSecond),
					description: localize('performance.vsNode', "vs Node.js: {0}", m.nodeOperationsPerSecond),
					iconPath: new ThemeIcon('pulse'),
					collapsibleState: 0
				},
				{
					handle: 'overview.memory',
					label: localize('performance.memorySaved', "Memory Saved: {0}MB", m.memorySavedMB.toFixed(1)),
					description: `${m.memorySavedPercent.toFixed(0)}%`,
					iconPath: new ThemeIcon('save'),
					collapsibleState: 0,
					tooltip: localize('performance.memoryTooltip', "Using {0}MB instead of {1}MB", 
						m.rustMemoryUsageMB.toFixed(1), 
						m.electronMemoryUsageMB.toFixed(1)
					)
				}
			]
		};
	}

	private createOperationsSection(): PerformanceTreeItem {
		const ops = this.currentMetrics!.fileOperations;
		
		return {
			handle: 'operations',
			label: localize('performance.operations', "File Operations"),
			collapsibleState: 1, // Collapsed
			iconPath: new ThemeIcon('file'),
			contextValue: 'operations',
			children: [
				this.createOperationItem('Read', ops.readOperations, 'file-text'),
				this.createOperationItem('Write', ops.writeOperations, 'edit'),
				this.createOperationItem('Stat', ops.statOperations, 'info'),
				this.createOperationItem('ReadDir', ops.readdirOperations, 'folder-opened')
			]
		};
	}

	private createOperationItem(name: string, metric: IOperationMetric, icon: string): PerformanceTreeItem {
		const hasData = metric.count > 0;
		
		return {
			handle: `operations.${name.toLowerCase()}`,
			label: name,
			description: hasData 
				? localize('performance.avgTime', "{0}μs avg", metric.averageTimeUs.toFixed(0))
				: localize('performance.noData', "No data"),
			iconPath: new ThemeIcon(icon),
			collapsibleState: hasData ? 1 : 0,
			tooltip: hasData
				? localize('performance.operationTooltip', 
					"{0} operations\nAverage: {1}μs\nMin: {2}μs\nMax: {3}μs",
					metric.count,
					metric.averageTimeUs.toFixed(0),
					metric.minTimeUs.toFixed(0),
					metric.maxTimeUs.toFixed(0)
				)
				: undefined,
			children: hasData ? [
				{
					handle: `operations.${name.toLowerCase()}.count`,
					label: localize('performance.count', "Count: {0}", metric.count),
					iconPath: new ThemeIcon('symbol-number'),
					collapsibleState: 0
				},
				{
					handle: `operations.${name.toLowerCase()}.avg`,
					label: localize('performance.average', "Average: {0}μs", metric.averageTimeUs.toFixed(0)),
					iconPath: new ThemeIcon('graph'),
					collapsibleState: 0
				},
				{
					handle: `operations.${name.toLowerCase()}.range`,
					label: localize('performance.range', "Range: {0}μs - {1}μs", 
						metric.minTimeUs.toFixed(0), 
						metric.maxTimeUs.toFixed(0)
					),
					iconPath: new ThemeIcon('arrow-both'),
					collapsibleState: 0
				}
			] : undefined
		};
	}

	private createMemorySection(): PerformanceTreeItem {
		const m = this.currentMetrics!;
		
		return {
			handle: 'memory',
			label: localize('performance.memory', "Memory"),
			collapsibleState: 1,
			iconPath: new ThemeIcon('database'),
			contextValue: 'memory',
			children: [
				{
					handle: 'memory.rust',
					label: localize('performance.rustMemory', "Rust: {0}MB", m.rustMemoryUsageMB.toFixed(1)),
					iconPath: new ThemeIcon('circuit-board'),
					collapsibleState: 0
				},
				{
					handle: 'memory.electron',
					label: localize('performance.electronMemory', "Electron: {0}MB", m.electronMemoryUsageMB.toFixed(1)),
					iconPath: new ThemeIcon('browser'),
					collapsibleState: 0
				},
				{
					handle: 'memory.saved',
					label: localize('performance.saved', "Saved: {0}MB ({1}%)", 
						m.memorySavedMB.toFixed(1),
						m.memorySavedPercent.toFixed(0)
					),
					iconPath: new ThemeIcon('check'),
					collapsibleState: 0
				}
			]
		};
	}

	private createCacheSection(): PerformanceTreeItem {
		const m = this.currentMetrics!;
		const hitRate = m.cacheHitRate * 100;
		
		return {
			handle: 'cache',
			label: localize('performance.cache', "Cache"),
			collapsibleState: 1,
			iconPath: new ThemeIcon('archive'),
			contextValue: 'cache',
			children: [
				{
					handle: 'cache.hitRate',
					label: localize('performance.cacheHitRate', "Hit Rate: {0}%", hitRate.toFixed(1)),
					description: this.getCacheRateDescription(hitRate),
					iconPath: this.getCacheIcon(hitRate),
					collapsibleState: 0
				},
				{
					handle: 'cache.misses',
					label: localize('performance.cacheMisses', "Misses: {0}", m.cacheMisses),
					iconPath: new ThemeIcon('close'),
					collapsibleState: 0
				},
				{
					handle: 'cache.size',
					label: localize('performance.cacheSize', "Size: {0}MB", m.cacheSize),
					iconPath: new ThemeIcon('package'),
					collapsibleState: 0
				}
			]
		};
	}

	private createSystemSection(): PerformanceTreeItem {
		const m = this.currentMetrics!;
		
		return {
			handle: 'system',
			label: localize('performance.system', "System"),
			collapsibleState: 1,
			iconPath: new ThemeIcon('server'),
			contextValue: 'system',
			children: [
				{
					handle: 'system.cpu',
					label: localize('performance.cpu', "CPU Usage: {0}%", m.cpuUsagePercent.toFixed(1)),
					iconPath: new ThemeIcon('zap'),
					collapsibleState: 0
				},
				{
					handle: 'system.handles',
					label: localize('performance.handles', "Active Handles: {0}", m.activeHandles),
					iconPath: new ThemeIcon('link'),
					collapsibleState: 0
				},
				{
					handle: 'system.pending',
					label: localize('performance.pending', "Pending Operations: {0}", m.pendingOperations),
					iconPath: new ThemeIcon('clock'),
					collapsibleState: 0
				}
			]
		};
	}

	private createDeveloperSection(): PerformanceTreeItem {
		return {
			handle: 'developer',
			label: localize('performance.developer', "Developer Tools"),
			collapsibleState: 1,
			iconPath: new ThemeIcon('tools'),
			contextValue: 'developer',
			children: [
				{
					handle: 'developer.exportData',
					label: localize('performance.exportData', "Export Performance Data"),
					iconPath: new ThemeIcon('export'),
					collapsibleState: 0,
					command: {
						id: 'cmdshiftai.performance.exportData',
						title: localize('performance.export', "Export")
					}
				},
				{
					handle: 'developer.generateReport',
					label: localize('performance.generateReport', "Generate Report"),
					iconPath: new ThemeIcon('graph-line'),
					collapsibleState: 0,
					command: {
						id: 'cmdshiftai.performance.generateReport',
						title: localize('performance.generate', "Generate")
					}
				},
				{
					handle: 'developer.clearData',
					label: localize('performance.clearData', "Clear Performance Data"),
					iconPath: new ThemeIcon('trash'),
					collapsibleState: 0,
					command: {
						id: 'cmdshiftai.performance.clearData',
						title: localize('performance.clear', "Clear")
					}
				}
			]
		};
	}

	private getSpeedIcon(speedImprovement: number): ThemeIcon {
		if (speedImprovement >= 10) {
			return new ThemeIcon('rocket');
		} else if (speedImprovement >= 5) {
			return new ThemeIcon('zap');
		} else if (speedImprovement >= 2) {
			return new ThemeIcon('play');
		} else {
			return new ThemeIcon('warning');
		}
	}

	private getSpeedDescription(speedImprovement: number): string {
		if (speedImprovement >= 10) {
			return localize('performance.excellent', "Excellent");
		} else if (speedImprovement >= 5) {
			return localize('performance.good', "Good");
		} else if (speedImprovement >= 2) {
			return localize('performance.fair', "Fair");
		} else {
			return localize('performance.needsImprovement', "Needs improvement");
		}
	}

	private getCacheIcon(hitRate: number): ThemeIcon {
		if (hitRate >= 90) {
			return new ThemeIcon('pass-filled');
		} else if (hitRate >= 70) {
			return new ThemeIcon('pass');
		} else {
			return new ThemeIcon('warning');
		}
	}

	private getCacheRateDescription(hitRate: number): string {
		if (hitRate >= 90) {
			return localize('performance.optimal', "Optimal");
		} else if (hitRate >= 70) {
			return localize('performance.acceptable', "Acceptable");
		} else {
			return localize('performance.low', "Low");
		}
	}
}