#!/bin/bash
#---------------------------------------------------------------------------------------------
#  Copyright (c) cmdshiftAI Team. All rights reserved.
#  Licensed under the MIT License. See License.txt in the project root for license information.
#---------------------------------------------------------------------------------------------

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Configuration
VERSION=$(node -p "require('./package.json').version")
BUILD_ID=$(git rev-parse --short HEAD 2>/dev/null || echo "local")
BUILD_DATE=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
OUTPUT_DIR="$PROJECT_ROOT/dist"

# Platform detection
case "$OSTYPE" in
    linux*) PLATFORM="linux" ;;
    darwin*) PLATFORM="darwin" ;;
    msys*|cygwin*|mingw*) PLATFORM="win32" ;;
    *) echo "Unknown platform: $OSTYPE"; exit 1 ;;
esac

# Architecture detection
ARCH=$(uname -m)
case "$ARCH" in
    x86_64) ARCH="x64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *) echo "Unknown architecture: $ARCH"; exit 1 ;;
esac

# Function to print header
print_header() {
    clear
    echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║    cmdshiftAI Release Build v${VERSION}      ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}Platform:${NC} $PLATFORM-$ARCH"
    echo -e "${BLUE}Build ID:${NC} $BUILD_ID"
    echo -e "${BLUE}Date:${NC}     $BUILD_DATE"
    echo ""
}

# Function to check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js not found${NC}"
        exit 1
    fi
    
    # Check Rust
    if ! command -v cargo &> /dev/null; then
        echo -e "${RED}❌ Rust not found${NC}"
        exit 1
    fi
    
    # Check Git
    if ! command -v git &> /dev/null; then
        echo -e "${RED}❌ Git not found${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ All prerequisites met${NC}\n"
}

# Function to clean build artifacts
clean_build() {
    echo -e "${BLUE}Cleaning previous build artifacts...${NC}"
    
    # Clean output directory
    rm -rf "$OUTPUT_DIR"
    mkdir -p "$OUTPUT_DIR"
    
    # Clean VS Code build artifacts
    rm -rf out
    rm -rf out-build
    rm -rf out-vscode
    
    # Clean Rust artifacts
    cd "$PROJECT_ROOT/rust-components"
    cargo clean
    
    cd "$PROJECT_ROOT"
    echo -e "${GREEN}✅ Build artifacts cleaned${NC}\n"
}

# Function to build Rust components
build_rust_release() {
    echo -e "${BLUE}Building Rust components (release mode)...${NC}"
    cd "$PROJECT_ROOT/rust-components"
    
    # Set optimization flags
    export RUSTFLAGS="-C target-cpu=native -C opt-level=3 -C lto=thin"
    
    # Build with release profile
    cargo build --release
    
    # Strip debug symbols
    if [ "$PLATFORM" != "win32" ]; then
        strip target/release/*.so 2>/dev/null || true
        strip target/release/*.dylib 2>/dev/null || true
    fi
    
    # Copy to distribution
    cd "$PROJECT_ROOT"
    node scripts/build-rust.js --release
    
    # Get size of Rust components
    RUST_SIZE=$(du -sh rust-components/cmdshiftai_core.node | cut -f1)
    echo -e "${GREEN}✅ Rust components built (${RUST_SIZE})${NC}\n"
}

# Function to optimize TypeScript/JavaScript
optimize_typescript() {
    echo -e "${BLUE}Optimizing TypeScript/JavaScript...${NC}"
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        npm ci --silent
    fi
    
    # Download builtin extensions
    npm run download-builtin-extensions --silent
    
    # Compile TypeScript with optimizations
    NODE_ENV=production npm run compile --silent
    
    # Minify if gulp task exists
    if npm run | grep -q "minify-vscode"; then
        echo -e "${YELLOW}Minifying JavaScript...${NC}"
        npm run minify-vscode --silent
    fi
    
    echo -e "${GREEN}✅ TypeScript/JavaScript optimized${NC}\n"
}

# Function to create platform packages
create_packages() {
    echo -e "${BLUE}Creating platform packages...${NC}"
    
    case "$PLATFORM" in
        linux)
            echo -e "${YELLOW}Building Linux packages...${NC}"
            npm run gulp vscode-linux-$ARCH
            
            # Create .deb package if on Ubuntu/Debian
            if command -v dpkg-deb &> /dev/null; then
                create_deb_package
            fi
            
            # Create .rpm package if on RedHat/Fedora
            if command -v rpmbuild &> /dev/null; then
                create_rpm_package
            fi
            
            # Create AppImage
            if command -v appimagetool &> /dev/null; then
                create_appimage
            fi
            ;;
            
        darwin)
            echo -e "${YELLOW}Building macOS packages...${NC}"
            npm run gulp vscode-darwin-$ARCH
            
            # Create DMG
            create_dmg
            
            # Sign if certificates available
            if [ -n "$MACOS_CERTIFICATE" ]; then
                sign_macos_app
            fi
            ;;
            
        win32)
            echo -e "${YELLOW}Building Windows packages...${NC}"
            npm run gulp vscode-win32-$ARCH
            
            # Create installer
            if command -v makensis &> /dev/null; then
                create_windows_installer
            fi
            ;;
    esac
    
    echo -e "${GREEN}✅ Platform packages created${NC}\n"
}

# Function to create .deb package
create_deb_package() {
    echo "Creating .deb package..."
    
    DEB_DIR="$OUTPUT_DIR/cmdshiftai_${VERSION}_${ARCH}"
    mkdir -p "$DEB_DIR/DEBIAN"
    mkdir -p "$DEB_DIR/opt/cmdshiftai"
    mkdir -p "$DEB_DIR/usr/share/applications"
    mkdir -p "$DEB_DIR/usr/share/pixmaps"
    
    # Copy application files
    cp -r ../VSCode-linux-$ARCH/* "$DEB_DIR/opt/cmdshiftai/"
    
    # Create control file
    cat > "$DEB_DIR/DEBIAN/control" << EOF
Package: cmdshiftai
Version: ${VERSION}
Section: devel
Priority: optional
Architecture: ${ARCH/x64/amd64}
Maintainer: cmdshiftAI Team <team@cmdshiftai.com>
Description: AI-first code editor with Rust performance
 cmdshiftAI is a high-performance development platform that combines
 VS Code's extensibility with Rust-powered enhancements for 10x speed.
EOF

    # Create desktop entry
    cat > "$DEB_DIR/usr/share/applications/cmdshiftai.desktop" << EOF
[Desktop Entry]
Name=cmdshiftAI
Comment=AI-first code editor
Exec=/opt/cmdshiftai/cmdshiftai %F
Icon=cmdshiftai
Type=Application
Categories=Development;IDE;
MimeType=text/plain;
EOF

    # Build .deb
    dpkg-deb --build "$DEB_DIR" "$OUTPUT_DIR/cmdshiftai_${VERSION}_${ARCH}.deb"
    rm -rf "$DEB_DIR"
}

# Function to create DMG for macOS
create_dmg() {
    echo "Creating DMG..."
    
    if command -v create-dmg &> /dev/null; then
        create-dmg \
            --volname "cmdshiftAI v${VERSION}" \
            --window-pos 200 120 \
            --window-size 800 400 \
            --icon-size 100 \
            --icon "cmdshiftAI.app" 200 190 \
            --hide-extension "cmdshiftAI.app" \
            --app-drop-link 600 185 \
            "$OUTPUT_DIR/cmdshiftAI-${VERSION}-${ARCH}.dmg" \
            "../VSCode-darwin-${ARCH}/cmdshiftAI.app"
    else
        # Fallback to simple DMG
        echo "create-dmg not found, creating simple DMG..."
        hdiutil create -volname "cmdshiftAI" -srcfolder "../VSCode-darwin-${ARCH}" \
            -ov -format UDZO "$OUTPUT_DIR/cmdshiftAI-${VERSION}-${ARCH}.dmg"
    fi
}

# Function to create Windows installer
create_windows_installer() {
    echo "Creating Windows installer..."
    
    # Create NSIS script
    cat > "$OUTPUT_DIR/installer.nsi" << 'EOF'
!define PRODUCT_NAME "cmdshiftAI"
!define PRODUCT_VERSION "${VERSION}"
!define PRODUCT_PUBLISHER "cmdshiftAI Team"

SetCompressor /SOLID lzma
InstallDir "$PROGRAMFILES64\cmdshiftAI"
Name "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile "cmdshiftAI-Setup-${VERSION}-${ARCH}.exe"

Section "Main"
    SetOutPath "$INSTDIR"
    File /r "..\VSCode-win32-${ARCH}\*.*"
    
    CreateDirectory "$SMPROGRAMS\cmdshiftAI"
    CreateShortcut "$SMPROGRAMS\cmdshiftAI\cmdshiftAI.lnk" "$INSTDIR\cmdshiftai.exe"
    CreateShortcut "$DESKTOP\cmdshiftAI.lnk" "$INSTDIR\cmdshiftai.exe"
    
    WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
    Delete "$INSTDIR\*.*"
    RMDir /r "$INSTDIR"
    Delete "$SMPROGRAMS\cmdshiftAI\*.*"
    RMDir "$SMPROGRAMS\cmdshiftAI"
    Delete "$DESKTOP\cmdshiftAI.lnk"
SectionEnd
EOF

    makensis -DVERSION=$VERSION -DARCH=$ARCH "$OUTPUT_DIR/installer.nsi"
    rm "$OUTPUT_DIR/installer.nsi"
}

# Function to compress artifacts
compress_artifacts() {
    echo -e "${BLUE}Compressing build artifacts...${NC}"
    
    cd ..
    
    # Create archives based on platform
    case "$PLATFORM" in
        linux)
            tar -czf "$OUTPUT_DIR/cmdshiftai-${VERSION}-${PLATFORM}-${ARCH}.tar.gz" \
                "VSCode-linux-$ARCH"
            ;;
        darwin)
            tar -czf "$OUTPUT_DIR/cmdshiftai-${VERSION}-${PLATFORM}-${ARCH}.tar.gz" \
                "VSCode-darwin-$ARCH"
            ;;
        win32)
            if command -v zip &> /dev/null; then
                zip -r "$OUTPUT_DIR/cmdshiftai-${VERSION}-${PLATFORM}-${ARCH}.zip" \
                    "VSCode-win32-$ARCH"
            fi
            ;;
    esac
    
    cd "$PROJECT_ROOT"
    echo -e "${GREEN}✅ Artifacts compressed${NC}\n"
}

# Function to generate checksums
generate_checksums() {
    echo -e "${BLUE}Generating checksums...${NC}"
    
    cd "$OUTPUT_DIR"
    
    # SHA256 checksums
    if command -v sha256sum &> /dev/null; then
        sha256sum * > SHA256SUMS
    elif command -v shasum &> /dev/null; then
        shasum -a 256 * > SHA256SUMS
    fi
    
    # Create release notes
    cat > "RELEASE_NOTES.md" << EOF
# cmdshiftAI v${VERSION}

Build ID: ${BUILD_ID}
Build Date: ${BUILD_DATE}
Platform: ${PLATFORM}-${ARCH}

## Checksums
\`\`\`
$(cat SHA256SUMS)
\`\`\`

## Installation

### Linux
\`\`\`bash
tar -xzf cmdshiftai-${VERSION}-linux-x64.tar.gz
cd VSCode-linux-x64
./cmdshiftai
\`\`\`

### macOS
Open the DMG file and drag cmdshiftAI to Applications.

### Windows
Run the installer and follow the setup wizard.

## Features
- 10x faster file operations with Rust backend
- AI-first design with multi-model support
- <150MB memory footprint
- <2s startup time
- 95% VS Code extension compatibility

For more information, visit: https://github.com/cmdshiftai/cmdshiftai
EOF
    
    cd "$PROJECT_ROOT"
    echo -e "${GREEN}✅ Checksums generated${NC}\n"
}

# Function to display build summary
display_summary() {
    echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║         Build Complete!                  ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}Version:${NC} ${VERSION}"
    echo -e "${GREEN}Platform:${NC} ${PLATFORM}-${ARCH}"
    echo -e "${GREEN}Build ID:${NC} ${BUILD_ID}"
    echo -e "${GREEN}Output:${NC} ${OUTPUT_DIR}"
    echo ""
    echo "Artifacts:"
    ls -lh "$OUTPUT_DIR" | grep -v "^total"
    echo ""
    echo -e "${MAGENTA}🚀 Ready for distribution!${NC}"
}

# Main build process
main() {
    print_header
    check_prerequisites
    
    # Parse command line arguments
    SKIP_CLEAN=false
    SKIP_TESTS=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-clean)
                SKIP_CLEAN=true
                shift
                ;;
            --skip-tests)
                SKIP_TESTS=true
                shift
                ;;
            --help)
                echo "Usage: $0 [options]"
                echo ""
                echo "Options:"
                echo "  --skip-clean    Skip cleaning build artifacts"
                echo "  --skip-tests    Skip running tests"
                echo "  --help          Show this help message"
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                echo "Run '$0 --help' for usage"
                exit 1
                ;;
        esac
    done
    
    # Clean if not skipped
    if [ "$SKIP_CLEAN" = false ]; then
        clean_build
    fi
    
    # Run tests if not skipped
    if [ "$SKIP_TESTS" = false ]; then
        echo -e "${YELLOW}Running tests...${NC}"
        "$SCRIPT_DIR/run-all-tests.sh" --all
        if [ $? -ne 0 ]; then
            echo -e "${RED}❌ Tests failed. Aborting build.${NC}"
            exit 1
        fi
        echo ""
    fi
    
    # Build components
    build_rust_release
    optimize_typescript
    
    # Create platform packages
    create_packages
    
    # Compress and generate checksums
    compress_artifacts
    generate_checksums
    
    # Display summary
    display_summary
}

# Run main function
main "$@"