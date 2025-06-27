extern crate napi_build;

fn main() {
    // Enable N-API build
    napi_build::setup();
    
    // Platform-specific optimizations
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap();
    let target_arch = std::env::var("CARGO_CFG_TARGET_ARCH").unwrap();
    
    match target_os.as_str() {
        "windows" => {
            // Windows-specific optimizations
            println!("cargo:rustc-link-lib=kernel32");
            println!("cargo:rustc-link-lib=advapi32");
            
            // Enable Windows performance features
            println!("cargo:rustc-cfg=feature=\"windows_perf\"");
        }
        "macos" => {
            // macOS-specific optimizations
            println!("cargo:rustc-link-lib=framework=CoreFoundation");
            println!("cargo:rustc-link-lib=framework=Security");
            
            // Enable macOS performance features
            println!("cargo:rustc-cfg=feature=\"macos_perf\"");
            
            // Use Accelerate framework for SIMD operations
            if target_arch == "aarch64" {
                println!("cargo:rustc-link-lib=framework=Accelerate");
            }
        }
        "linux" => {
            // Linux-specific optimizations
            println!("cargo:rustc-link-lib=pthread");
            
            // Enable io_uring on supported systems
            if cfg!(feature = "io_uring") {
                println!("cargo:rustc-link-lib=uring");
                println!("cargo:rustc-cfg=feature=\"linux_io_uring\"");
            }
        }
        _ => {}
    }
    
    // CPU-specific optimizations
    match target_arch.as_str() {
        "x86_64" => {
            // Enable AVX2 if available
            println!("cargo:rustc-env=RUSTFLAGS=-C target-cpu=native");
        }
        "aarch64" => {
            // Enable NEON optimizations
            println!("cargo:rustc-env=RUSTFLAGS=-C target-feature=+neon");
        }
        _ => {}
    }
    
    // Set optimization flags for release builds
    let profile = std::env::var("PROFILE").unwrap();
    if profile == "release" {
        // Enable link-time optimization
        println!("cargo:rustc-env=CARGO_PROFILE_RELEASE_LTO=true");
        
        // Strip debug symbols for smaller binary
        println!("cargo:rustc-env=CARGO_PROFILE_RELEASE_STRIP=symbols");
        
        // Optimize for size when needed
        if std::env::var("OPTIMIZE_FOR_SIZE").is_ok() {
            println!("cargo:rustc-env=CARGO_PROFILE_RELEASE_OPT_LEVEL=z");
        }
    }
    
    // Print build info
    println!("cargo:warning=Building cmdshiftAI for {} {}", target_os, target_arch);
}