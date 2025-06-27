use napi::bindgen_prelude::*;
use napi_derive::napi;
use ignore::WalkBuilder;
use grep::regex::RegexMatcher;
use grep::searcher::{BinaryDetection, SearcherBuilder};
use grep::searcher::SinkMatch;
use std::sync::{Arc, Mutex};

#[napi]
pub struct SearchEngine;

#[napi]
impl SearchEngine {
    #[napi(constructor)]
    pub fn new() -> Self {
        SearchEngine
    }

    #[napi]
    pub async fn search_pattern(&self, root_path: String, pattern: String, options: Option<SearchOptions>) -> Result<Vec<SearchResult>> {
        let opts = options.unwrap_or_default();
        let start = std::time::Instant::now();

        // Build regex matcher
        let matcher = RegexMatcher::new_line_matcher(&pattern)
            .map_err(|e| Error::from_reason(format!("Invalid regex pattern: {}", e)))?;

        // Configure walk builder
        let mut builder = WalkBuilder::new(&root_path);
        builder
            .hidden(!opts.include_hidden.unwrap_or(false))
            .ignore(!opts.disable_ignore.unwrap_or(false))
            .git_ignore(!opts.disable_gitignore.unwrap_or(false))
            .max_depth(opts.max_depth.map(|d| d as usize))
            .threads(num_cpus::get());

        if let Some(ref globs) = opts.include_patterns {
            for glob in globs {
                builder.add(glob);
            }
        }

        if let Some(ref globs) = opts.exclude_patterns {
            for glob in globs {
                builder.add(&format!("!{}", glob));
            }
        }

        let results = Arc::new(Mutex::new(Vec::new()));
        let results_clone = Arc::clone(&results);

        // Parallel walk and search
        builder.build_parallel().run(|| {
            let matcher = matcher.clone();
            let results = Arc::clone(&results_clone);

            Box::new(move |result| {
                if let Ok(entry) = result {
                    if entry.file_type().map_or(false, |ft| ft.is_file()) {
                        if let Ok(path) = entry.path().canonicalize() {
                            let path_str = path.to_string_lossy().to_string();

                            // Search in file
                            if let Ok(matches) = search_in_file(&path_str, &matcher) {
                                if !matches.is_empty() {
                                    let mut results = results.lock().unwrap();
                                    results.push(SearchResult {
                                        file_path: path_str,
                                        matches,
                                    });
                                }
                            }
                        }
                    }
                }
                ignore::WalkState::Continue
            })
        });

        let duration = start.elapsed();
        let results = Arc::try_unwrap(results).map_err(|_| Error::from_reason("Failed to unwrap results"))?.into_inner().map_err(|_| Error::from_reason("Failed to access results"))?;

        tracing::debug!("Search completed in {:?}, found {} files with matches", duration, results.len());

        Ok(results)
    }

    #[napi]
    pub async fn search_files(&self, root_path: String, file_pattern: String) -> Result<Vec<String>> {
        let start = std::time::Instant::now();

        let mut builder = WalkBuilder::new(&root_path);
        builder
            .hidden(false)
            .ignore(false)
            .git_ignore(true)
            .threads(num_cpus::get());

        let pattern = regex::Regex::new(&file_pattern)
            .map_err(|e| Error::from_reason(format!("Invalid file pattern: {}", e)))?;

        let files = Arc::new(Mutex::new(Vec::new()));
        let files_clone = Arc::clone(&files);

        builder.build_parallel().run(|| {
            let pattern = pattern.clone();
            let files = Arc::clone(&files_clone);

            Box::new(move |result| {
                if let Ok(entry) = result {
                    if entry.file_type().map_or(false, |ft| ft.is_file()) {
                        let path = entry.path();
                        if let Some(file_name) = path.file_name() {
                            if pattern.is_match(&file_name.to_string_lossy()) {
                                if let Ok(canonical) = path.canonicalize() {
                                    let mut files = files.lock().unwrap();
                                    files.push(canonical.to_string_lossy().to_string());
                                }
                            }
                        }
                    }
                }
                ignore::WalkState::Continue
            })
        });

        let duration = start.elapsed();
        let files = Arc::try_unwrap(files).map_err(|_| Error::from_reason("Failed to unwrap files"))?.into_inner().map_err(|_| Error::from_reason("Failed to access files"))?;

        tracing::debug!("File search completed in {:?}, found {} files", duration, files.len());

        Ok(files)
    }
}

fn search_in_file(path: &str, matcher: &RegexMatcher) -> Result<Vec<Match>> {
    use std::fs::File;
    use std::io::BufReader;
    use grep::searcher::Sink;

    let file = File::open(path)
        .map_err(|e| Error::from_reason(format!("Failed to open file: {}", e)))?;

    let mut matches = Vec::new();

    struct MatchSink<'a> {
        matches: &'a mut Vec<Match>,
    }

        impl<'a> Sink for MatchSink<'a> {
        type Error = std::io::Error;

        fn matched(
            &mut self,
            _searcher: &grep::searcher::Searcher,
            mat: &SinkMatch<'_>,
        ) -> std::result::Result<bool, std::io::Error> {
            self.matches.push(Match {
                line_number: mat.line_number().unwrap_or(0) as f64,
                column_start: mat.absolute_byte_offset() as f64,
                column_end: (mat.absolute_byte_offset() + mat.bytes().len() as u64) as f64,
                text: String::from_utf8_lossy(mat.bytes()).to_string(),
            });
            Ok(true)
        }
    }

    let mut sink = MatchSink { matches: &mut matches };

    SearcherBuilder::new()
        .binary_detection(BinaryDetection::quit(b'\x00'))
        .line_number(true)
        .build()
        .search_reader(matcher, BufReader::new(file), &mut sink)
        .map_err(|e| Error::from_reason(format!("Search failed: {}", e)))?;

    Ok(matches)
}

#[napi(object)]
#[derive(Default)]
pub struct SearchOptions {
    pub case_sensitive: Option<bool>,
    pub include_hidden: Option<bool>,
    pub disable_ignore: Option<bool>,
    pub disable_gitignore: Option<bool>,
    pub max_depth: Option<i32>,
    pub include_patterns: Option<Vec<String>>,
    pub exclude_patterns: Option<Vec<String>>,
}

#[napi(object)]
#[derive(Debug)]
pub struct SearchResult {
    pub file_path: String,
    pub matches: Vec<Match>,
}

#[napi(object)]
#[derive(Debug)]
pub struct Match {
    pub line_number: f64,
    pub column_start: f64,
    pub column_end: f64,
    pub text: String,
}
