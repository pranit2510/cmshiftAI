/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use napi::bindgen_prelude::*;
use napi_derive::napi;
use tokio::fs;

#[napi]
pub struct RustFileOperations;

#[napi]
impl RustFileOperations {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self
    }

    #[napi]
    pub async fn read_file(&self, path: String) -> Result<Buffer> {
        let contents = fs::read(&path).await
            .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to read file: {}", e)))?;
        Ok(Buffer::from(contents))
    }

    #[napi]
    pub async fn write_file(&self, path: String, data: Buffer) -> Result<()> {
        fs::write(&path, data.as_ref()).await
            .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to write file: {}", e)))?;
        Ok(())
    }

    #[napi]
    pub async fn read_dir(&self, path: String) -> Result<Vec<String>> {
        let mut entries = fs::read_dir(&path).await
            .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to read directory: {}", e)))?;

        let mut result = Vec::new();
        while let Some(entry) = entries.next_entry().await
            .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to read directory entry: {}", e)))? {
            if let Some(name) = entry.file_name().to_str() {
                result.push(name.to_string());
            }
        }

        Ok(result)
    }

    #[napi]
    pub async fn stat(&self, path: String) -> Result<FileStats> {
        let metadata = fs::metadata(&path).await
            .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to get file stats: {}", e)))?;

        Ok(FileStats {
            size: metadata.len() as f64,
            is_file: metadata.is_file(),
            is_directory: metadata.is_dir(),
            modified: metadata.modified()
                .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to get modified time: {}", e)))?
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| Error::new(Status::GenericFailure, format!("Invalid modified time: {}", e)))?
                .as_millis() as f64,
        })
    }
}

#[napi(object)]
pub struct FileStats {
    pub size: f64,
    pub is_file: bool,
    pub is_directory: bool,
    pub modified: f64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use std::fs as std_fs;
    use std::time::{SystemTime, UNIX_EPOCH};
    
    #[tokio::test]
    async fn test_read_file() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test_read.txt");
        let content = b"Hello, cmdshiftAI!";
        std_fs::write(&file_path, content).unwrap();
        
        let ops = RustFileOperations::new();
        let result = ops.read_file(file_path.to_str().unwrap().to_string()).await.unwrap();
        
        assert_eq!(result.as_ref(), content);
    }
    
    #[tokio::test]
    async fn test_write_file() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test_write.txt");
        let content = Buffer::from(b"Test write content".to_vec());
        
        let ops = RustFileOperations::new();
        ops.write_file(
            file_path.to_str().unwrap().to_string(),
            content.clone()
        ).await.unwrap();
        
        let result = std_fs::read(&file_path).unwrap();
        assert_eq!(result, b"Test write content");
    }
    
    #[tokio::test]
    async fn test_read_dir() {
        let temp_dir = TempDir::new().unwrap();
        
        // Create test files
        let files = vec!["file1.txt", "file2.txt", "file3.txt"];
        for file in &files {
            let file_path = temp_dir.path().join(file);
            std_fs::write(&file_path, format!("Content of {}", file)).unwrap();
        }
        
        // Create subdirectory
        let sub_dir = temp_dir.path().join("subdir");
        std_fs::create_dir(&sub_dir).unwrap();
        
        let ops = RustFileOperations::new();
        let mut entries = ops.read_dir(temp_dir.path().to_str().unwrap().to_string()).await.unwrap();
        entries.sort(); // Sort for consistent testing
        
        assert_eq!(entries.len(), 4);
        assert!(entries.contains(&"file1.txt".to_string()));
        assert!(entries.contains(&"file2.txt".to_string()));
        assert!(entries.contains(&"file3.txt".to_string()));
        assert!(entries.contains(&"subdir".to_string()));
    }
    
    #[tokio::test]
    async fn test_stat_file() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("stat_test.txt");
        let content = b"Stat test content";
        std_fs::write(&file_path, content).unwrap();
        
        let ops = RustFileOperations::new();
        let stats = ops.stat(file_path.to_str().unwrap().to_string()).await.unwrap();
        
        assert_eq!(stats.size, content.len() as f64);
        assert!(stats.is_file);
        assert!(!stats.is_directory);
        assert!(stats.modified > 0.0);
        
        // Verify modified time is reasonable (within last hour)
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as f64;
        assert!(stats.modified <= now);
        assert!(stats.modified > now - 3600000.0); // Within last hour
    }
    
    #[tokio::test]
    async fn test_stat_directory() {
        let temp_dir = TempDir::new().unwrap();
        let dir_path = temp_dir.path().join("test_dir");
        std_fs::create_dir(&dir_path).unwrap();
        
        let ops = RustFileOperations::new();
        let stats = ops.stat(dir_path.to_str().unwrap().to_string()).await.unwrap();
        
        assert!(!stats.is_file);
        assert!(stats.is_directory);
        assert!(stats.modified > 0.0);
    }
    
    #[tokio::test]
    async fn test_error_file_not_found() {
        let ops = RustFileOperations::new();
        let result = ops.read_file("/non/existent/file.txt".to_string()).await;
        
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.reason.contains("Failed to read file"));
    }
    
    #[tokio::test]
    async fn test_error_invalid_directory() {
        let ops = RustFileOperations::new();
        let result = ops.read_dir("/non/existent/directory".to_string()).await;
        
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.reason.contains("Failed to read directory"));
    }
    
    #[tokio::test]
    async fn test_concurrent_operations() {
        let temp_dir = TempDir::new().unwrap();
        let ops = RustFileOperations::new();
        
        // Create multiple files concurrently
        let mut handles = vec![];
        for i in 0..10 {
            let file_path = temp_dir.path().join(format!("concurrent_{}.txt", i));
            let path_str = file_path.to_str().unwrap().to_string();
            let content = Buffer::from(format!("Content {}", i).into_bytes());
            
            let handle = tokio::spawn(async move {
                let ops = RustFileOperations::new();
                ops.write_file(path_str, content).await
            });
            handles.push(handle);
        }
        
        // Wait for all writes to complete
        for handle in handles {
            handle.await.unwrap().unwrap();
        }
        
        // Verify all files exist
        let entries = ops.read_dir(temp_dir.path().to_str().unwrap().to_string()).await.unwrap();
        assert_eq!(entries.len(), 10);
        
        // Read all files concurrently
        let mut read_handles = vec![];
        for i in 0..10 {
            let file_path = temp_dir.path().join(format!("concurrent_{}.txt", i));
            let path_str = file_path.to_str().unwrap().to_string();
            
            let handle = tokio::spawn(async move {
                let ops = RustFileOperations::new();
                ops.read_file(path_str).await
            });
            read_handles.push((i, handle));
        }
        
        // Verify content
        for (i, handle) in read_handles {
            let result = handle.await.unwrap().unwrap();
            let expected = format!("Content {}", i);
            assert_eq!(String::from_utf8(result.to_vec()).unwrap(), expected);
        }
    }
    
    #[tokio::test]
    async fn test_large_file_handling() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("large_file.dat");
        
        // Create a 1MB file
        let large_content = vec![b'X'; 1024 * 1024];
        std_fs::write(&file_path, &large_content).unwrap();
        
        let ops = RustFileOperations::new();
        let result = ops.read_file(file_path.to_str().unwrap().to_string()).await.unwrap();
        
        assert_eq!(result.len(), large_content.len());
        assert_eq!(result.as_ref(), large_content.as_slice());
    }
    
    #[tokio::test]
    async fn test_unicode_filenames() {
        let temp_dir = TempDir::new().unwrap();
        
        // Create files with unicode names
        let unicode_names = vec!["测试文件.txt", "файл.txt", "🎉emoji.txt"];
        for name in &unicode_names {
            let file_path = temp_dir.path().join(name);
            std_fs::write(&file_path, format!("Content of {}", name)).unwrap();
        }
        
        let ops = RustFileOperations::new();
        let entries = ops.read_dir(temp_dir.path().to_str().unwrap().to_string()).await.unwrap();
        
        assert_eq!(entries.len(), unicode_names.len());
        for name in &unicode_names {
            assert!(entries.contains(&name.to_string()));
        }
    }
    
    #[tokio::test]
    async fn test_empty_file() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("empty.txt");
        std_fs::write(&file_path, b"").unwrap();
        
        let ops = RustFileOperations::new();
        let result = ops.read_file(file_path.to_str().unwrap().to_string()).await.unwrap();
        
        assert_eq!(result.len(), 0);
        
        let stats = ops.stat(file_path.to_str().unwrap().to_string()).await.unwrap();
        assert_eq!(stats.size, 0.0);
    }
    
    #[tokio::test]
    async fn test_overwrite_existing_file() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("overwrite.txt");
        
        // Write initial content
        let ops = RustFileOperations::new();
        let initial_content = Buffer::from(b"Initial content".to_vec());
        ops.write_file(file_path.to_str().unwrap().to_string(), initial_content).await.unwrap();
        
        // Overwrite with new content
        let new_content = Buffer::from(b"New content".to_vec());
        ops.write_file(file_path.to_str().unwrap().to_string(), new_content).await.unwrap();
        
        // Verify new content
        let result = std_fs::read(&file_path).unwrap();
        assert_eq!(result, b"New content");
    }
    
    #[cfg(unix)]
    #[tokio::test]
    async fn test_permissions() {
        use std::os::unix::fs::PermissionsExt;
        
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("perms_test.txt");
        std_fs::write(&file_path, b"Test").unwrap();
        
        // Set specific permissions
        let mut perms = std_fs::metadata(&file_path).unwrap().permissions();
        perms.set_mode(0o644);
        std_fs::set_permissions(&file_path, perms).unwrap();
        
        let ops = RustFileOperations::new();
        let stats = ops.stat(file_path.to_str().unwrap().to_string()).await.unwrap();
        
        assert!(stats.is_file);
        // Further permission checks would require platform-specific code
    }
}
