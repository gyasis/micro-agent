# Micro Agent - Python Tutorial

Complete guide for using Micro Agent with Python projects using pytest.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Project Setup](#project-setup)
- [Configuration](#configuration)
- [Basic Usage](#basic-usage)
- [pytest Examples](#pytest-examples)
- [Common Use Cases](#common-use-cases)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

---

## Prerequisites

- **Python**: 3.9+ (3.11+ recommended)
- **pip** or **poetry** or **uv**
- **pytest**: 7.x or 8.x
- **Node.js**: 18.x+ (for Micro Agent CLI)
- **Git**: For version control

---

## Installation

### Install Micro Agent (Global)

```bash
npm install -g @builder.io/micro-agent

# Verify installation
micro-agent --version
```

### Python Project Setup

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install pytest and coverage
pip install pytest pytest-cov pytest-mock

# Or use poetry
poetry add --group dev pytest pytest-cov pytest-mock
```

---

## Project Setup

### Initialize Python Project

```bash
# Create project structure
mkdir my-python-project && cd my-python-project

# Initialize pyproject.toml
cat > pyproject.toml <<EOF
[build-system]
requires = ["setuptools>=61.0"]
build-backend = "setuptools.build_meta"

[project]
name = "my-project"
version = "0.1.0"
requires-python = ">=3.9"

[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py", "*_test.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
addopts = "--cov=src --cov-report=html --cov-report=term"

[tool.coverage.run]
source = ["src"]
omit = ["*/tests/*", "*/test_*.py"]

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "def __repr__",
    "raise AssertionError",
    "raise NotImplementedError",
]
EOF
```

### Project Structure

```
my-python-project/
├── src/
│   └── calculator.py
├── tests/
│   └── test_calculator.py
├── pyproject.toml
├── ralph.config.yaml
└── .env
```

---

## Configuration

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
  python:
    testPattern: 'test_*.py'
    coverageTool: 'coverage'

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

# Python environment
PYTHONPATH=src
```

---

## Basic Usage

### 1. Fix Failing Tests

```bash
# Let Micro Agent fix test failures
micro-agent --file src/calculator.py

# With specific prompt
micro-agent --file src/calculator.py \
  --prompt "Fix the zero division edge case"
```

**What happens:**
1. 📚 **Librarian** analyzes Python imports and test failures
2. ✍️ **Artisan** generates Pythonic fix
3. 🔎 **Critic** reviews code quality, type hints, and PEP 8
4. 🧪 pytest runs automatically (detected from pyproject.toml)
5. 💥 **Chaos** runs property-based tests using Hypothesis
6. 🔄 Iterates until all tests pass

### 2. Interactive Mode

```bash
# Run without arguments
micro-agent

# You'll be prompted for:
# - Target file or module
# - Objective/prompt
# - Test command (auto-detected as 'pytest')
```

---

## pytest Examples

### Example 1: Basic Calculator

**src/calculator.py:**
```python
"""Simple calculator module."""

def add(a: int | float, b: int | float) -> int | float:
    """Add two numbers."""
    return a + b

def divide(a: int | float, b: int | float) -> float:
    """Divide two numbers.

    Bug: No check for division by zero
    """
    return a / b  # Will raise ZeroDivisionError
```

**tests/test_calculator.py:**
```python
"""Tests for calculator module."""
import pytest
from src.calculator import add, divide

def test_add():
    """Test addition."""
    assert add(2, 3) == 5
    assert add(-1, 1) == 0

def test_divide():
    """Test division."""
    assert divide(10, 2) == 5.0

def test_divide_by_zero():
    """Test division by zero handling."""
    with pytest.raises(ValueError, match="Cannot divide by zero"):
        divide(10, 0)  # This test will fail initially
```

**Run Micro Agent:**
```bash
micro-agent --file src/calculator.py
```

**Expected Fix:**
```python
def divide(a: int | float, b: int | float) -> float:
    """Divide two numbers.

    Args:
        a: The numerator
        b: The denominator

    Returns:
        The quotient

    Raises:
        ValueError: If b is zero
    """
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b
```

### Example 2: API Client with Mocking

**src/api_client.py:**
```python
"""HTTP API client."""
import requests

class APIClient:
    def __init__(self, base_url: str):
        self.base_url = base_url

    def get_user(self, user_id: int) -> dict:
        """Fetch user by ID."""
        response = requests.get(f"{self.base_url}/users/{user_id}")
        response.raise_for_status()
        return response.json()
```

**tests/test_api_client.py:**
```python
"""Tests for API client."""
import pytest
from unittest.mock import Mock, patch
from src.api_client import APIClient

def test_get_user_success():
    """Test successful user fetch."""
    client = APIClient("https://api.example.com")

    with patch('requests.get') as mock_get:
        mock_response = Mock()
        mock_response.json.return_value = {"id": 1, "name": "Alice"}
        mock_response.raise_for_status.return_value = None
        mock_get.return_value = mock_response

        user = client.get_user(1)

        assert user == {"id": 1, "name": "Alice"}
        mock_get.assert_called_once_with("https://api.example.com/users/1")

def test_get_user_not_found():
    """Test 404 error handling."""
    client = APIClient("https://api.example.com")

    with patch('requests.get') as mock_get:
        mock_response = Mock()
        mock_response.raise_for_status.side_effect = requests.HTTPError("404")
        mock_get.return_value = mock_response

        with pytest.raises(requests.HTTPError):
            client.get_user(999)
```

**Run Micro Agent:**
```bash
micro-agent --file src/api_client.py \
  --prompt "Add proper error handling and retry logic"
```

### Example 3: Async Code with pytest-asyncio

**src/async_worker.py:**
```python
"""Async worker example."""
import asyncio
import aiohttp

async def fetch_data(url: str) -> dict:
    """Fetch data asynchronously."""
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            return await response.json()
```

**tests/test_async_worker.py:**
```python
"""Tests for async worker."""
import pytest
from unittest.mock import AsyncMock, patch
from src.async_worker import fetch_data

@pytest.mark.asyncio
async def test_fetch_data():
    """Test async data fetching."""
    mock_response = AsyncMock()
    mock_response.json.return_value = {"result": "success"}

    with patch('aiohttp.ClientSession.get', return_value=mock_response):
        data = await fetch_data("https://api.example.com/data")
        assert data == {"result": "success"}
```

**Install pytest-asyncio:**
```bash
pip install pytest-asyncio

# Or add to pyproject.toml
[project.optional-dependencies]
test = ["pytest-asyncio"]
```

---

## Common Use Cases

### Use Case 1: Generate Tests from Docstrings

```bash
micro-agent --file src/utils.py \
  --prompt "Generate comprehensive tests based on docstrings"
```

**Result:** Artisan generates tests for all public functions with edge cases.

### Use Case 2: Improve Type Hints

```bash
micro-agent --file src/legacy_code.py \
  --prompt "Add type hints and fix mypy errors"
```

**Result:**
- Adds proper type annotations
- Fixes mypy strict mode errors
- Updates docstrings with type information

### Use Case 3: Add Property-Based Tests

```bash
micro-agent --file src/validator.py \
  --prompt "Add Hypothesis property-based tests"
```

**Expected Generation:**
```python
from hypothesis import given, strategies as st

@given(st.integers(), st.integers())
def test_add_commutative(a, b):
    """Test that addition is commutative."""
    assert add(a, b) == add(b, a)

@given(st.text(), st.text())
def test_concat_associative(a, b, c):
    """Test string concatenation associativity."""
    assert concat(concat(a, b), c) == concat(a, concat(b, c))
```

### Use Case 4: Refactor for Python 3.11+

```bash
micro-agent --file src/old_code.py \
  --prompt "Refactor to use Python 3.11 features (match/case, TypedDict, etc.)"
```

---

## Troubleshooting

### Issue: "pytest not found"

**Solution:**
```bash
# Verify pytest installation
pytest --version

# Install if missing
pip install pytest

# Or specify test command explicitly
micro-agent --file src/app.py \
  --test "python -m pytest" \
  --framework pytest
```

### Issue: "Import errors in tests"

**Solution:**
```bash
# Add PYTHONPATH to .env
echo "PYTHONPATH=src" >> .env

# Or use pytest's pythonpath
# In pyproject.toml:
[tool.pytest.ini_options]
pythonpath = ["src"]
```

### Issue: "Coverage too low"

**Solution:**
```bash
# Generate coverage report
pytest --cov=src --cov-report=html

# Open coverage report
open htmlcov/index.html

# Let Micro Agent improve coverage
micro-agent --file src/ \
  --prompt "Increase coverage to 90%"
```

### Issue: "Async tests not running"

**Solution:**
```bash
# Install pytest-asyncio
pip install pytest-asyncio

# Add to pyproject.toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
```

---

## Best Practices

### 1. Use Type Hints

```python
# ✅ Good: Type hints help Micro Agent generate better code
def process_data(items: list[dict[str, Any]]) -> pd.DataFrame:
    """Process data items."""
    pass

# ❌ Bad: No type information
def process_data(items):
    pass
```

### 2. Write Descriptive Docstrings

```python
# ✅ Good: Clear docstring with examples
def validate_email(email: str) -> bool:
    """Validate email format.

    Args:
        email: Email address to validate

    Returns:
        True if valid, False otherwise

    Examples:
        >>> validate_email("user@example.com")
        True
        >>> validate_email("invalid")
        False
    """
    pass
```

### 3. Use pytest Fixtures

```python
@pytest.fixture
def sample_data():
    """Provide sample test data."""
    return {"id": 1, "name": "Test"}

def test_process(sample_data):
    """Test with fixture."""
    result = process(sample_data)
    assert result is not None
```

### 4. Organize Tests by Module

```
tests/
├── __init__.py
├── unit/
│   ├── test_calculator.py
│   └── test_validator.py
├── integration/
│   └── test_api.py
└── conftest.py  # Shared fixtures
```

### 5. Use Code Formatters

```bash
# Install black and ruff
pip install black ruff

# Format before running Micro Agent
black src/ tests/
ruff check --fix src/ tests/

# Then run Micro Agent
micro-agent --file src/module.py
```

---

## Advanced Features

### Integration with Black

Create plugin for auto-formatting:

```python
# plugins/black_format.py
import type { RalphPlugin } from '@builder.io/micro-agent/plugin-sdk'
import subprocess

export const blackPlugin: RalphPlugin = {
  name: 'black-formatter',
  version: '1.0.0',

  async onAfterGen(context, generated):
    # Format with Black
    subprocess.run(['black', generated.filePath])
    return generated
}
```

### Integration with mypy

```yaml
# ralph.config.yaml
plugins:
  - path: './plugins/mypy_check.py'
    enabled: true
    config:
      strictMode: true
```

### Integration with pytest-xdist (Parallel Tests)

```bash
# Install pytest-xdist
pip install pytest-xdist

# Run tests in parallel
pytest -n auto

# Micro Agent will detect and use parallel mode
micro-agent --file src/
```

---

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/micro-agent.yml
name: Micro Agent Python

on: [push, pull_request]

jobs:
  fix-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install pytest pytest-cov

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
        run: pytest --cov=src --cov-report=xml

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

## Next Steps

- ✅ **Read the TypeScript/JavaScript Tutorial**: [typescript-javascript.md](./typescript-javascript.md)
- ✅ **Read the Rust Tutorial**: [rust.md](./rust.md)
- ✅ **Explore Configuration**: [quickstart.md](../specs/001-ralph-loop-2026/quickstart.md)

---

**Need Help?**
- 🐛 [GitHub Issues](https://github.com/BuilderIO/micro-agent/issues)
- 💬 [Discord Community](https://discord.gg/builderio)

---

*Micro Agent - Powered by Ralph Loop 2026 methodology*
