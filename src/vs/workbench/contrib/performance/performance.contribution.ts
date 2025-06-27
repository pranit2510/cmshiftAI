/*---------------------------------------------------------------------------------------------
 *  Copyright (c) cmdshiftAI Team. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../common/contributions.js';
import { LifecyclePhase } from '../../services/lifecycle/common/lifecycle.js';
import { IViewContainersRegistry, IViewsRegistry, Extensions as ViewExtensions, ViewContainerLocation, IViewDescriptor } from '../../common/views.js';
import { SyncDescriptor } from '../../../platform/instantiation/common/descriptors.js';
import { CommandsRegistry } from '../../../platform/commands/common/commands.js';
import { MenuRegistry, MenuId } from '../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../platform/configuration/common/configurationRegistry.js';
import { IPerformanceMonitorService } from './common/performance.js';
import { PerformanceMonitorService } from './common/performanceMonitorService.js';
import { PerformanceStatusBarContribution } from './browser/performanceStatusBar.js';
import { PerformanceViewDataProvider } from './browser/performanceView.js';
import { PerformanceDashboardPanel } from './browser/performanceDashboard.js';
import { PerformanceTelemetryReporter } from './common/performanceTelemetry.js';
import { PerformanceDevTools } from './browser/performanceDevTools.js';
import { registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { Codicon } from '../../../base/common/codicons.js';
import { registerIcon } from '../../../platform/theme/common/iconRegistry.js';
import { IViewsService } from '../../services/views/common/viewsService.js';

// Icons
const performanceViewIcon = registerIcon('performance-view-icon', Codicon.dashboard, localize('performanceViewIcon', 'View icon for the performance view.'));

// Register service
registerSingleton(IPerformanceMonitorService, PerformanceMonitorService, true);

// Register performance view container
const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: 'cmdshiftai.performance',
	title: localize('performance', "Performance"),
	icon: performanceViewIcon,
	order: 10,
	ctorDescriptor: new SyncDescriptor('cmdshiftai.performance'),
	storageId: 'cmdshiftai.performance.state',
	hideIfEmpty: false
}, ViewContainerLocation.Sidebar);

// Register performance view
const viewDescriptor: IViewDescriptor = {
	id: 'cmdshiftai.performanceView',
	name: localize('performanceView', "Performance Monitor"),
	ctorDescriptor: new SyncDescriptor('cmdshiftai.performanceView'),
	canToggleVisibility: true,
	canMoveView: true,
	containerIcon: performanceViewIcon,
	order: 0
};

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([viewDescriptor], VIEW_CONTAINER);

// Register commands
CommandsRegistry.registerCommand({
	id: 'cmdshiftai.showPerformanceDashboard',
	handler: async (accessor) => {
		const instantiationService = accessor.get(IInstantiationService);
		const dashboard = instantiationService.createInstance(PerformanceDashboardPanel);
		await dashboard.show();
	}
});

CommandsRegistry.registerCommand({
	id: 'cmdshiftai.performance.focus',
	handler: async (accessor) => {
		const viewsService = accessor.get(IViewsService);
		await viewsService.openView('cmdshiftai.performanceView', true);
	}
});

CommandsRegistry.registerCommand({
	id: 'cmdshiftai.performance.toggleDeveloperMode',
	handler: (accessor) => {
		const performanceService = accessor.get(IPerformanceMonitorService);
		const current = performanceService.isDeveloperMode();
		performanceService.setDeveloperMode(!current);
	}
});

CommandsRegistry.registerCommand({
	id: 'cmdshiftai.performance.exportData',
	handler: async (accessor) => {
		const instantiationService = accessor.get(IInstantiationService);
		const devTools = instantiationService.createInstance(PerformanceDevTools);
		await devTools.showDevMenu();
	}
});

CommandsRegistry.registerCommand({
	id: 'cmdshiftai.performance.generateReport',
	handler: async (accessor) => {
		const performanceService = accessor.get(IPerformanceMonitorService);
		await performanceService.generateReport('detailed');
	}
});

CommandsRegistry.registerCommand({
	id: 'cmdshiftai.performance.clearData',
	handler: async (accessor) => {
		const instantiationService = accessor.get(IInstantiationService);
		const devTools = instantiationService.createInstance(PerformanceDevTools);
		await devTools.showDevMenu();
	}
});

CommandsRegistry.registerCommand({
	id: 'cmdshiftai.performance.showDevTools',
	handler: async (accessor) => {
		const instantiationService = accessor.get(IInstantiationService);
		const devTools = instantiationService.createInstance(PerformanceDevTools);
		await devTools.showDevMenu();
	}
});

// Register menu items
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: 'cmdshiftai.showPerformanceDashboard',
		title: localize('showPerformanceDashboard', "cmdshiftAI: Show Performance Dashboard"),
		category: localize('cmdshiftai', "cmdshiftAI")
	}
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: 'cmdshiftai.performance.toggleDeveloperMode',
		title: localize('toggleDeveloperMode', "cmdshiftAI: Toggle Performance Developer Mode"),
		category: localize('cmdshiftai', "cmdshiftAI")
	}
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: 'cmdshiftai.performance.showDevTools',
		title: localize('showDevTools', "cmdshiftAI: Show Performance Developer Tools"),
		category: localize('cmdshiftai', "cmdshiftAI")
	},
	when: ContextKeyExpr.has('cmdshiftai.performance.developerMode')
});

// Register configuration
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'cmdshiftai',
	title: localize('cmdshiftai', "cmdshiftAI"),
	properties: {
		'cmdshiftai.performance.enabled': {
			type: 'boolean',
			default: true,
			description: localize('cmdshiftai.performance.enabled', "Enable cmdshiftAI performance monitoring")
		},
		'cmdshiftai.performance.statusBarEnabled': {
			type: 'boolean',
			default: true,
			description: localize('cmdshiftai.performance.statusBarEnabled', "Show performance metrics in status bar")
		},
		'cmdshiftai.performance.sampleInterval': {
			type: 'number',
			default: 1000,
			minimum: 100,
			maximum: 10000,
			description: localize('cmdshiftai.performance.sampleInterval', "Performance sampling interval in milliseconds")
		},
		'cmdshiftai.performance.retentionPeriod': {
			type: 'number',
			default: 1,
			minimum: 1,
			maximum: 24,
			description: localize('cmdshiftai.performance.retentionPeriod', "How long to retain performance data (hours)")
		},
		'cmdshiftai.performance.developerMode': {
			type: 'boolean',
			default: false,
			description: localize('cmdshiftai.performance.developerMode', "Enable developer mode for detailed performance debugging")
		},
		'cmdshiftai.performance.telemetry.enabled': {
			type: 'boolean',
			default: true,
			description: localize('cmdshiftai.performance.telemetry.enabled', "Enable performance telemetry reporting")
		}
	}
});

// Register workbench contributions
class PerformanceContribution {
	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IPerformanceMonitorService private readonly performanceMonitorService: IPerformanceMonitorService
	) {
		// Create status bar contribution
		this.instantiationService.createInstance(PerformanceStatusBarContribution);

		// Create telemetry reporter
		this.instantiationService.createInstance(PerformanceTelemetryReporter);

		// Create view data provider
		this.instantiationService.createInstance(PerformanceViewDataProvider);

		// Set context key for developer mode
		const developerModeKey = this.contextKeyService.createKey('cmdshiftai.performance.developerMode', 
			this.performanceMonitorService.isDeveloperMode()
		);

		// Update context key when developer mode changes
		this.performanceMonitorService.onDidUpdateMetrics(() => {
			developerModeKey.set(this.performanceMonitorService.isDeveloperMode());
		});
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	PerformanceContribution,
	LifecyclePhase.Restored
);

// Export for use in other modules
export { IPerformanceMonitorService } from './common/performance.js';