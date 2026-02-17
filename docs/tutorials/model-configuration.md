# Model Configuration Tutorial

How to configure different LLM models for each agent in Micro Agent.

## Quick Start

Micro Agent uses 3 specialized agents, each optimized for different tasks:
- **Librarian**: Analyzes codebase context (fast, cheap model recommended)
- **Artisan**: Generates code fixes (powerful model recommended)
- **Critic**: Reviews code quality (balanced model recommended)

## Configuration Methods

### Method 1: Project Config File (Recommended)

Create `.micro-agent.json` in your project root:

```json
{
  "llm": {
    "librarian": {
      "provider": "google",
      "model": "gemini-2.5-flash",
      "temperature": 0.3
    },
    "artisan": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "temperature": 0.7
    },
    "critic": {
      "provider": "openai",
      "model": "gpt-4o-mini",
      "temperature": 0.2
    }
  },
  "testing": {
    "defaultCommand": "npm test",
    "framework": "vitest"
  },
  "budget": {
    "maxIterations": 5,
    "maxCostUsd": 1.0,
    "maxDurationMinutes": 15
  }
}
```

### Method 2: Environment Variables

Set model overrides via environment:

```bash
# In your .env file
LIBRARIAN_MODEL=gemini-2.5-flash
ARTISAN_MODEL=claude-sonnet-4-20250514
CRITIC_MODEL=gpt-4o-mini

# API Keys
GOOGLE_API_KEY=your-gemini-key
ANTHROPIC_API_KEY=your-claude-key
OPENAI_API_KEY=your-openai-key
```

### Method 3: CLI Arguments

Override models for a single run:

```bash
ma-loop run src/file.ts \
  --librarian gemini-2.5-flash \
  --artisan claude-sonnet-4-20250514 \
  --critic gpt-4o-mini \
  --max-budget 0.50
```

## Available Models (February 2026)

### Google Gemini Models

**Stable Production (Recommended):**
```json
{
  "provider": "google",
  "model": "gemini-2.5-flash"        // Best price/performance
}
```

**Other Options:**
- `gemini-2.5-pro` - Flagship for complex logic
- `gemini-2.5-flash-latest` - Auto-updates to latest stable
- `gemini-3-flash-preview` - Latest generation (preview)
- `gemini-3-pro-preview` - Flagship reasoning (preview)

### Anthropic Claude Models

**Current Stable:**
```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514"  // Balanced power/speed
}
```

**Other Options:**
- `claude-opus-4-20250514` - Most powerful (expensive)
- `claude-haiku-4-20250514` - Fastest (cheapest)

### OpenAI Models

**Current Stable:**
```json
{
  "provider": "openai",
  "model": "gpt-4o-mini"              // Fast, cheap
}
```

**Other Options:**
- `gpt-4o` - More powerful
- `gpt-4-turbo` - Optimized for speed
- `o1-preview` - Advanced reasoning

## Model Selection Strategies

### Strategy 1: Cost-Optimized (Recommended for Testing)

Best for: Rapid iteration, testing, development

```json
{
  "librarian": {
    "provider": "google",
    "model": "gemini-2.5-flash",      // $0.075 per 1M tokens
    "temperature": 0.3
  },
  "artisan": {
    "provider": "anthropic",
    "model": "claude-haiku-4-20250514", // Fast & cheap
    "temperature": 0.7
  },
  "critic": {
    "provider": "openai",
    "model": "gpt-4o-mini",           // $0.15 per 1M tokens
    "temperature": 0.2
  }
}
```

**Expected Cost per Iteration:** $0.01 - $0.03

### Strategy 2: Balanced (Default Configuration)

Best for: Production use, important fixes

```json
{
  "librarian": {
    "provider": "google",
    "model": "gemini-2.5-flash",
    "temperature": 0.3
  },
  "artisan": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514", // Balanced power
    "temperature": 0.7
  },
  "critic": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "temperature": 0.2
  }
}
```

**Expected Cost per Iteration:** $0.02 - $0.05

### Strategy 3: Maximum Power

Best for: Critical bugs, complex refactoring

```json
{
  "librarian": {
    "provider": "google",
    "model": "gemini-2.5-pro",        // Deep analysis
    "temperature": 0.3
  },
  "artisan": {
    "provider": "anthropic",
    "model": "claude-opus-4-20250514", // Most powerful
    "temperature": 0.7
  },
  "critic": {
    "provider": "openai",
    "model": "gpt-4o",               // Advanced reasoning
    "temperature": 0.2
  }
}
```

**Expected Cost per Iteration:** $0.10 - $0.30

### Strategy 4: Single-Provider (Google Only)

Best for: Simplified billing, Gemini API credits

```json
{
  "librarian": {
    "provider": "google",
    "model": "gemini-2.5-flash",
    "temperature": 0.3
  },
  "artisan": {
    "provider": "google",
    "model": "gemini-2.5-pro",
    "temperature": 0.7
  },
  "critic": {
    "provider": "google",
    "model": "gemini-2.5-flash",
    "temperature": 0.2
  }
}
```

**Expected Cost per Iteration:** $0.02 - $0.08

## Testing Different Configurations

### Test 1: Baseline (Default Models)

```bash
cd /tmp/test-project
cat > .micro-agent.json <<EOF
{
  "llm": {
    "librarian": {"provider": "google", "model": "gemini-2.5-flash"},
    "artisan": {"provider": "anthropic", "model": "claude-sonnet-4-20250514"},
    "critic": {"provider": "openai", "model": "gpt-4o-mini"}
  }
}
EOF

ma-loop run src/buggy-file.ts --max-iterations 3 --verbose
```

### Test 2: Cost-Optimized

```bash
cat > .micro-agent.json <<EOF
{
  "llm": {
    "librarian": {"provider": "google", "model": "gemini-2.5-flash"},
    "artisan": {"provider": "anthropic", "model": "claude-haiku-4-20250514"},
    "critic": {"provider": "openai", "model": "gpt-4o-mini"}
  }
}
EOF

ma-loop run src/buggy-file.ts --max-budget 0.10
```

### Test 3: Maximum Power

```bash
cat > .micro-agent.json <<EOF
{
  "llm": {
    "librarian": {"provider": "google", "model": "gemini-2.5-pro"},
    "artisan": {"provider": "anthropic", "model": "claude-opus-4-20250514"},
    "critic": {"provider": "openai", "model": "gpt-4o"}
  }
}
EOF

ma-loop run src/complex-bug.ts --max-budget 1.00
```

### Test 4: Single Provider (Gemini Only)

```bash
cat > .micro-agent.json <<EOF
{
  "llm": {
    "librarian": {"provider": "google", "model": "gemini-2.5-flash"},
    "artisan": {"provider": "google", "model": "gemini-2.5-pro"},
    "critic": {"provider": "google", "model": "gemini-2.5-flash"}
  }
}
EOF

# Only need GOOGLE_API_KEY
export GOOGLE_API_KEY=your-key
ma-loop run src/file.ts
```

## Temperature Settings Explained

**Temperature** controls randomness in model output (0.0 - 1.0):

- **0.0 - 0.3**: Deterministic, consistent (good for Librarian, Critic)
- **0.4 - 0.7**: Balanced creativity (good for Artisan)
- **0.8 - 1.0**: Very creative, experimental (good for Chaos agent)

**Recommended per agent:**
```json
{
  "librarian": {"temperature": 0.3},  // Consistent analysis
  "artisan": {"temperature": 0.7},    // Creative solutions
  "critic": {"temperature": 0.2}      // Strict review
}
```

## Advanced: Per-Language Model Selection

Configure different models for different languages:

```json
{
  "languages": {
    "typescript": {
      "artisan": {
        "provider": "anthropic",
        "model": "claude-sonnet-4-20250514"
      }
    },
    "python": {
      "artisan": {
        "provider": "openai",
        "model": "gpt-4o"
      }
    },
    "rust": {
      "artisan": {
        "provider": "anthropic",
        "model": "claude-opus-4-20250514"
      }
    }
  }
}
```

## Cost Monitoring

Track costs during testing:

```bash
# Run with cost limit
ma-loop run src/file.ts --max-budget 0.50 --verbose

# Check final cost in output:
# Cost: $0.23 / $0.50
```

**Cost breakdown logged per agent:**
```
[INFO] librarian agent completed {"tokensUsed":8457,"cost":0.007246}
[INFO] artisan agent completed {"tokensUsed":1474,"cost":0.001474}
[INFO] critic agent completed {"tokensUsed":1145,"cost":0.000274}
```

## Troubleshooting

### Issue: "API key required" error

**Solution**: Ensure API keys are in .env file:
```bash
# .env
GOOGLE_API_KEY=your-gemini-key
ANTHROPIC_API_KEY=your-claude-key
OPENAI_API_KEY=your-openai-key
```

### Issue: "Model not found" error

**Solution**: Check model name is correct for 2026:
```bash
# Wrong (2024 names):
"gemini-2.0-flash-exp"  ❌
"claude-sonnet-4.5"     ❌
"gpt-4.1-mini"          ❌

# Correct (2026 names):
"gemini-2.5-flash"      ✅
"claude-sonnet-4-20250514" ✅
"gpt-4o-mini"           ✅
```

### Issue: Costs too high

**Solution**: Use cost-optimized strategy:
```json
{
  "artisan": {
    "provider": "anthropic",
    "model": "claude-haiku-4-20250514"  // Cheapest Claude
  }
}
```

## Complete Example: Test Project Setup

```bash
# 1. Create test project
mkdir ma-test && cd ma-test
npm init -y
npm install -D vitest

# 2. Create .env with API keys
cat > .env <<EOF
GOOGLE_API_KEY=your-key
ANTHROPIC_API_KEY=your-key
OPENAI_API_KEY=your-key
EOF

# 3. Create .gitignore
cat > .gitignore <<EOF
.env
.env.*
node_modules/
EOF

# 4. Create config
cat > .micro-agent.json <<EOF
{
  "llm": {
    "librarian": {"provider": "google", "model": "gemini-2.5-flash"},
    "artisan": {"provider": "anthropic", "model": "claude-sonnet-4-20250514"},
    "critic": {"provider": "openai", "model": "gpt-4o-mini"}
  },
  "budget": {
    "maxIterations": 5,
    "maxCostUsd": 0.50
  }
}
EOF

# 5. Create buggy code
cat > src/math.ts <<EOF
export function multiply(a: number, b: number): number {
  return a + b;  // BUG!
}
EOF

# 6. Create test
cat > src/math.test.ts <<EOF
import { test, expect } from 'vitest';
import { multiply } from './math';

test('multiply works', () => {
  expect(multiply(3, 4)).toBe(12);
});
EOF

# 7. Run Micro Agent
ma-loop run src/math.ts --verbose

# 8. Check results
npm test  # Should pass!
```

## Next Steps

- Try different model combinations
- Measure cost vs quality trade-offs
- Share your optimal configurations!

## Resources

- [Gemini Pricing](https://ai.google.dev/pricing)
- [Claude Pricing](https://www.anthropic.com/pricing)
- [OpenAI Pricing](https://openai.com/pricing)
