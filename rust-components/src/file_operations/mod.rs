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
