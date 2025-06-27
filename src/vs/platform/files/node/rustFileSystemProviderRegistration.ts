/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../base/common/network.js';
import { IFileService } from '../common/files.js';
import { ILogService } from '../../log/common/log.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { DiskFileSystemProvider } from './diskFileSystemProvider.js';
import { RustFileSystemProvider } from './rustFileSystemProvider.js';

/**
 * Helper function to register enhanced file system provider for cmdshiftAI
 * Falls back to standard DiskFileSystemProvider if Rust components are not available
 */
export async function registerEnhancedFileSystemProvider(
	fileService: IFileService,
	fallbackProvider: DiskFileSystemProvider,
	logService: ILogService,
	telemetryService?: ITelemetryService
): Promise<void> {
	try {
		// Only try to use RustFileSystemProvider if telemetry service is available
		if (!telemetryService) {
			logService.trace('[cmdshiftAI] Telemetry service not available, using standard DiskFileSystemProvider');
			return;
		}

		const rustFileSystemProvider = new RustFileSystemProvider(logService, telemetryService);

		// Register the enhanced provider for file scheme
		fileService.registerProvider(Schemas.file, rustFileSystemProvider);

		logService.info('[cmdshiftAI] Successfully registered RustFileSystemProvider for enhanced file operations');

		// Report successful registration
		telemetryService.publicLog('cmdshiftai.fileSystemProvider.registration', {
			success: true,
			fallback: false
		});

	} catch (error) {
		logService.warn('[cmdshiftAI] Failed to register RustFileSystemProvider, keeping standard DiskFileSystemProvider:',
			error instanceof Error ? error.message : String(error));

		// Report fallback usage
		if (telemetryService) {
			telemetryService.publicLog('cmdshiftai.fileSystemProvider.registration', {
				success: false,
				fallback: true,
				error: error instanceof Error ? error.message : String(error)
			});
		}

		// The fallback provider should already be registered by the caller
	}
}

/**
 * Helper to check if Rust file system provider is active and working
 */
export function isRustFileSystemProviderActive(fileService: IFileService): boolean {
	const provider = fileService.getProvider(Schemas.file);
	return provider instanceof RustFileSystemProvider;
}

/**
 * Helper to get performance metrics from the active file system provider
 */
export function getFileSystemProviderMetrics(fileService: IFileService): any {
	const provider = fileService.getProvider(Schemas.file);
	if (provider instanceof RustFileSystemProvider) {
		return provider.getPerformanceMetrics();
	}
	return null;
}

/**
 * Helper to clear caches from the active file system provider
 */
export function clearFileSystemProviderCaches(fileService: IFileService): void {
	const provider = fileService.getProvider(Schemas.file);
	if (provider instanceof RustFileSystemProvider) {
		provider.clearCaches();
	}
}
