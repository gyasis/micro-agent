# Micro Agent - Rust Tutorial

Complete guide for using Micro Agent with Rust projects using cargo test.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Project Setup](#project-setup)
- [Configuration](#configuration)
- [Basic Usage](#basic-usage)
- [cargo test Examples](#cargo-test-examples)
- [Common Use Cases](#common-use-cases)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

---

## Prerequisites

- **Rust**: 1.70+ (latest stable recommended)
- **Cargo**: Included with Rust
- **Node.js**: 18.x+ (for Micro Agent CLI)
- **Git**: For version control

---

## Installation

### Install Rust

```bash
# Install Rust via rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Verify installation
rustc --version
cargo --version
```

### Install Micro Agent

```bash
npm install -g @builder.io/micro-agent

# Verify installation
micro-agent --version
```

---

## Project Setup

### Create New Rust Project

```bash
# Create binary project
cargo new my-rust-project
cd my-rust-project

# Or create library
cargo new --lib my-rust-lib
```

### Project Structure

```
my-rust-project/
├── src/
│   ├── main.rs          # Binary entry point
│   ├── lib.rs           # Library root
│   └── calculator.rs    # Module
├── tests/
│   └── integration_test.rs
├── Cargo.toml
├── ralph.config.yaml
└── .env
```

---

## Configuration

### Cargo.toml

```toml
[package]
name = "my-project"
version = "0.1.0"
edition = "2021"

[dependencies]

[dev-dependencies]
proptest = "1.4"        # Property-based testing
quickcheck = "1.0"      # Alternative property testing
criterion = "0.5"       # Benchmarking

[[test]]
name = "integration"
path = "tests/integration_test.rs"
```

### Create ralph.config.yaml

```yaml
# AI Model Configuration
models:
  librarian:
    provider: google
    model: gemini-2.0-pro
    temperature: 0.3

  artisan:
    provider: anthropic
    model: claude-sonnet-4.5
    temperature: 0.7

  critic:
    provider: openai
    model: gpt-4.1-mini
    temperature: 0.2

  chaos:
    provider: anthropic
    model: claude-sonnet-4.5
    temperature: 0.9

# Language Settings
languages:
  rust:
    testPattern: '*_test.rs'
    coverageTool: 'cargo-tarpaulin'

# Testing Configuration
testing:
  adversarialTests: true
  propertyBasedTests: true
  boundaryValueTesting: true
  coverageThreshold: 90

# Budget Constraints
budgets:
  maxIterations: 30
  maxCostUsd: 2.0
  maxDurationMinutes: 15

# Success Criteria
successCriteria:
  testsPass: true
  adversarialTestsPass: true
  coverageThreshold: 90
```

### Environment Variables

Create `.env`:

```bash
# API Keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
```

---

## Basic Usage

### 1. Fix Failing Tests

```bash
# Let Micro Agent fix test failures
micro-agent --file src/calculator.rs

# With specific prompt
micro-agent --file src/calculator.rs \
  --prompt "Fix the overflow edge case"
```

**What happens:**
1. 📚 **Librarian** analyzes Rust modules and dependencies
2. ✍️ **Artisan** generates idiomatic Rust code
3. 🔎 **Critic** reviews borrow checker, lifetimes, and safety
4. 🧪 `cargo test` runs automatically
5. 💥 **Chaos** runs property-based tests using proptest
6. 🔄 Iterates until all tests pass

### 2. Interactive Mode

```bash
# Run without arguments
micro-agent

# You'll be prompted for:
# - Target file or module
# - Objective/prompt
# - Test command (auto-detected as 'cargo test')
```

---

## cargo test Examples

### Example 1: Basic Calculator

**src/lib.rs:**
```rust
//! Calculator module

/// Add two numbers
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

/// Divide two numbers
///
/// Bug: No check for division by zero
pub fn divide(a: i32, b: i32) -> i32 {
    a / b  // Will panic on b == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add() {
        assert_eq!(add(2, 3), 5);
        assert_eq!(add(-1, 1), 0);
    }

    #[test]
    fn test_divide() {
        assert_eq!(divide(10, 2), 5);
    }

    #[test]
    #[should_panic(expected = "Cannot divide by zero")]
    fn test_divide_by_zero() {
        divide(10, 0);  // This test will fail initially
    }
}
```

**Run Micro Agent:**
```bash
micro-agent --file src/lib.rs
```

**Expected Fix:**
```rust
/// Divide two numbers
///
/// # Errors
/// Returns `Err` if `b` is zero
pub fn divide(a: i32, b: i32) -> Result<i32, String> {
    if b == 0 {
        return Err("Cannot divide by zero".to_string());
    }
    Ok(a / b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_divide_by_zero() {
        let result = divide(10, 0);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Cannot divide by zero");
    }
}
```

### Example 2: Struct with Builder Pattern

**src/user.rs:**
```rust
/// User struct
#[derive(Debug, Clone, PartialEq)]
pub struct User {
    pub id: u64,
    pub name: String,
    pub email: String,
}

impl User {
    /// Create a new user
    pub fn new(id: u64, name: String, email: String) -> Result<Self, String> {
        if name.is_empty() {
            return Err("Name cannot be empty".to_string());
        }
        if !email.contains('@') {
            return Err("Invalid email format".to_string());
        }

        Ok(User { id, name, email })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_user() {
        let user = User::new(1, "Alice".to_string(), "alice@example.com".to_string());
        assert!(user.is_ok());
    }

    #[test]
    fn test_empty_name() {
        let user = User::new(1, "".to_string(), "alice@example.com".to_string());
        assert!(user.is_err());
    }

    #[test]
    fn test_invalid_email() {
        let user = User::new(1, "Alice".to_string(), "invalid-email".to_string());
        assert!(user.is_err());
    }
}
```

### Example 3: Async Code with tokio

**Cargo.toml:**
```toml
[dependencies]
tokio = { version = "1", features = ["full"] }
reqwest = "0.11"

[dev-dependencies]
tokio-test = "0.4"
mockito = "1.2"
```

**src/api_client.rs:**
```rust
use reqwest::Error;

pub struct ApiClient {
    base_url: String,
    client: reqwest::Client,
}

impl ApiClient {
    pub fn new(base_url: String) -> Self {
        Self {
            base_url,
            client: reqwest::Client::new(),
        }
    }

    pub async fn get_user(&self, user_id: u64) -> Result<serde_json::Value, Error> {
        let url = format!("{}/users/{}", self.base_url, user_id);
        self.client.get(&url).send().await?.json().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mockito;

    #[tokio::test]
    async fn test_get_user() {
        let mock = mockito::mock("GET", "/users/1")
            .with_status(200)
            .with_body(r#"{"id": 1, "name": "Alice"}"#)
            .create();

        let client = ApiClient::new(mockito::server_url());
        let user = client.get_user(1).await.unwrap();

        assert_eq!(user["id"], 1);
        assert_eq!(user["name"], "Alice");
        mock.assert();
    }
}
```

**Run Micro Agent:**
```bash
micro-agent --file src/api_client.rs \
  --prompt "Add retry logic and better error handling"
```

---

## Common Use Cases

### Use Case 1: Add Property-Based Tests

```bash
micro-agent --file src/validator.rs \
  --prompt "Add proptest property-based tests"
```

**Expected Generation:**
```rust
#[cfg(test)]
mod proptests {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn test_add_commutative(a in any::<i32>(), b in any::<i32>()) {
            prop_assert_eq!(add(a, b), add(b, a));
        }

        #[test]
        fn test_add_associative(a in any::<i32>(), b in any::<i32>(), c in any::<i32>()) {
            prop_assert_eq!(add(add(a, b), c), add(a, add(b, c)));
        }
    }
}
```

### Use Case 2: Fix Clippy Warnings

```bash
micro-agent --file src/legacy.rs \
  --prompt "Fix all clippy warnings and make code idiomatic"
```

**Result:**
- Fixes clippy::needless_return
- Adds missing documentation
- Improves error handling with `?` operator
- Uses iterators instead of loops

### Use Case 3: Add Benchmarks

```bash
micro-agent --file src/algorithm.rs \
  --prompt "Add criterion benchmarks for performance testing"
```

**Expected Generation:**
```rust
#[cfg(test)]
mod benches {
    use super::*;
    use criterion::{black_box, criterion_group, criterion_main, Criterion};

    fn benchmark_algorithm(c: &mut Criterion) {
        c.bench_function("sort 1000 elements", |b| {
            b.iter(|| {
                let mut data = vec![0; 1000];
                sort(black_box(&mut data));
            });
        });
    }

    criterion_group!(benches, benchmark_algorithm);
    criterion_main!(benches);
}
```

### Use Case 4: Improve Error Types

```bash
micro-agent --file src/parser.rs \
  --prompt "Replace String errors with custom Error enum using thiserror"
```

**Expected Generation:**
```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ParseError {
    #[error("Invalid syntax at line {line}: {msg}")]
    SyntaxError { line: usize, msg: String },

    #[error("Unexpected token: {0}")]
    UnexpectedToken(String),

    #[error(transparent)]
    Io(#[from] std::io::Error),
}

pub fn parse(input: &str) -> Result<Ast, ParseError> {
    // ...
}
```

---

## Troubleshooting

### Issue: "cargo test not found"

**Solution:**
```bash
# Verify Rust installation
cargo --version

# Reinstall if needed
rustup update
```

### Issue: "Compilation errors"

**Solution:**
```bash
# Check compiler errors first
cargo check

# Let Micro Agent fix them
micro-agent --file src/main.rs \
  --prompt "Fix all compilation errors"
```

### Issue: "Borrow checker errors"

**Solution:**
```bash
# Micro Agent is trained on Rust ownership patterns
micro-agent --file src/complex.rs \
  --prompt "Fix borrow checker errors while maintaining safety"
```

### Issue: "Test coverage too low"

**Solution:**
```bash
# Install cargo-tarpaulin
cargo install cargo-tarpaulin

# Generate coverage report
cargo tarpaulin --out Html

# Let Micro Agent improve coverage
micro-agent --file src/ \
  --prompt "Increase test coverage to 90%"
```

---

## Best Practices

### 1. Use Result for Errors

```rust
// ✅ Good: Use Result for errors
pub fn divide(a: i32, b: i32) -> Result<i32, String> {
    if b == 0 {
        return Err("Cannot divide by zero".into());
    }
    Ok(a / b)
}

// ❌ Bad: Panicking
pub fn divide(a: i32, b: i32) -> i32 {
    if b == 0 {
        panic!("Cannot divide by zero");
    }
    a / b
}
```

### 2. Write Doc Tests

```rust
/// Add two numbers
///
/// # Examples
///
/// ```
/// use my_lib::add;
/// assert_eq!(add(2, 3), 5);
/// ```
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}
```

### 3. Use cargo fmt and clippy

```bash
# Format code
cargo fmt

# Run clippy
cargo clippy -- -D warnings

# Then run Micro Agent
micro-agent --file src/main.rs
```

### 4. Organize Tests

```rust
// Unit tests in same file
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_internal() {
        // ...
    }
}
```

```rust
// Integration tests in tests/
// tests/integration_test.rs
use my_lib;

#[test]
fn test_public_api() {
    // ...
}
```

---

## Advanced Features

### Code Coverage with cargo-tarpaulin

```bash
# Install
cargo install cargo-tarpaulin

# Generate coverage
cargo tarpaulin --out Html --output-dir coverage

# Micro Agent uses this for coverage metrics
micro-agent --file src/ --prompt "Reach 90% coverage"
```

### Mutation Testing with cargo-mutants

```bash
# Install
cargo install cargo-mutants

# Run mutation testing
cargo mutants

# Micro Agent can use this for stronger tests
```

### Continuous Integration

```yaml
# .github/workflows/micro-agent.yml
name: Micro Agent Rust

on: [push, pull_request]

jobs:
  fix-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable

      - name: Install Micro Agent
        run: npm install -g @builder.io/micro-agent

      - name: Run Micro Agent
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          micro-agent --file src/ \
            --prompt "Fix all failing tests" \
            --max-cost 1.0

      - name: Run tests
        run: cargo test --all-features
```

---

## Next Steps

- ✅ **Read the TypeScript/JavaScript Tutorial**: [typescript-javascript.md](./typescript-javascript.md)
- ✅ **Read the Python Tutorial**: [python.md](./python.md)
- ✅ **Explore Configuration**: [quickstart.md](../specs/001-ralph-loop-2026/quickstart.md)

---

**Need Help?**
- 🐛 [GitHub Issues](https://github.com/BuilderIO/micro-agent/issues)
- 💬 [Discord Community](https://discord.gg/builderio)

---

*Micro Agent - Powered by Ralph Loop 2026 methodology*
