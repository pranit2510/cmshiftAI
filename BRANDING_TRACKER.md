# cmdshiftAI Branding Tracker

This document tracks all branding changes made to transform VS Code into cmdshiftAI.

## Completed Branding Changes

### 1. package.json
- **File**: `/package.json`
- **Changes**:
  - `name`: "code-oss-dev" → "cmdshiftai"
  - `version`: "1.102.0" → "1.0.0"
  - `author.name`: "Microsoft Corporation" → "cmdshiftAI Team"
  - Added Rust build scripts:
    - `"rust:build": "node scripts/build-rust.js"`
    - `"rust:build:debug": "node scripts/build-rust.js --debug"`
    - `"rust:build:release": "node scripts/build-rust.js --release"`

### 2. product.json
- **File**: `/product.json`
- **Changes**:
  - `nameShort`: "Code - OSS" → "cmdshiftAI"
  - `nameLong`: "Code - OSS" → "cmdshiftAI - AI-First Development Platform"
  - `applicationName`: "code-oss" → "cmdshiftai"
  - `dataFolderName`: ".vscode-oss" → ".cmdshiftai"
  - `win32MutexName`: "vscodeoss" → "cmdshiftai"
  - `licenseUrl`: Updated to cmdshiftai repository
  - `serverApplicationName`: "code-server-oss" → "cmdshiftai-server"
  - `serverDataFolderName`: ".vscode-server-oss" → ".cmdshiftai-server"
  - `tunnelApplicationName`: "code-tunnel-oss" → "cmdshiftai-tunnel"
  - `win32DirName`: "Microsoft Code OSS" → "cmdshiftAI"
  - `win32NameVersion`: "Microsoft Code OSS" → "cmdshiftAI"
  - `win32RegValueName`: "CodeOSS" → "cmdshiftAI"
  - `win32AppUserModelId`: "Microsoft.CodeOSS" → "cmdshiftAI.cmdshiftAI"
  - `win32ShellNameShort`: "C&ode - OSS" → "cmd&shiftAI"
  - `win32TunnelServiceMutex`: "vscodeoss-tunnelservice" → "cmdshiftai-tunnelservice"
  - `win32TunnelMutex`: "vscodeoss-tunnel" → "cmdshiftai-tunnel"
  - `darwinBundleIdentifier`: "com.visualstudio.code.oss" → "com.cmdshiftai.cmdshiftai"
  - `linuxIconName`: "code-oss" → "cmdshiftai"
  - `reportIssueUrl`: Updated to cmdshiftai repository
  - `urlProtocol`: "code-oss" → "cmdshiftai"
  - Updated Windows App IDs with new GUIDs

## Pending Branding Changes

### UI Elements
- [ ] Window title format
- [ ] About dialog
- [ ] Welcome page
- [ ] Settings UI references
- [ ] Command palette entries

### Build System
- [ ] Build output names
- [ ] Installer names
- [ ] Package metadata

### Documentation
- [ ] README.md updates
- [ ] Contributing guidelines
- [ ] License headers

### Assets
- [ ] Application icons
- [ ] Splash screens
- [ ] Marketplace branding

### Code References
- [ ] String constants in source code
- [ ] Error messages
- [ ] Log prefixes
- [ ] Telemetry identifiers

## Notes

- All Microsoft-specific branding has been replaced with cmdshiftAI branding
- Windows GUIDs have been regenerated to avoid conflicts
- Repository URLs point to the cmdshiftai organization
- The MIT license is maintained as per the original VS Code license