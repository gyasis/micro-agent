# Contract: Error Message Remediation Steps

## Format standard

Every updated error message MUST contain a `→ Fix:` line as a separate line after the
problem description. The `→` character is U+2192 (RIGHTWARDS ARROW).

```
<problem description>
→ Fix: <actionable step the developer can perform immediately>
```

## Changes

### 1. Anthropic API key missing
**File**: `src/llm/provider-router.ts` line 221

```diff
- throw new Error('Anthropic API key required');
+ throw new Error('Anthropic API key required\n→ Fix: Set ANTHROPIC_API_KEY=sk-... in your .env file (copy from https://console.anthropic.com)');
```

### 2. Google API key missing
**File**: `src/llm/provider-router.ts` line 269

```diff
- throw new Error('Google API key required');
+ throw new Error('Google API key required\n→ Fix: Set GOOGLE_API_KEY=... or GEMINI_API_KEY=... in your .env file (copy from https://aistudio.google.com/app/apikey)');
```

### 3. OpenAI API key missing
**File**: `src/llm/provider-router.ts` line 336

```diff
- throw new Error('OpenAI API key required');
+ throw new Error('OpenAI API key required\n→ Fix: Set OPENAI_API_KEY=sk-... in your .env file (copy from https://platform.openai.com/api-keys)');
```

### 4. Tier config file not found
**File**: `src/lifecycle/tier-config.ts` line 41

```diff
- throw new Error(`Tier config not found: ${filePath}\n  ${err.message}`);
+ throw new Error(`Tier config not found: ${filePath}\n  ${err.message}\n→ Fix: Verify the file exists at that path (use absolute path or path relative to cwd: ${process.cwd()})`);
```

### 5. Tier config JSON parse failure
**File**: `src/lifecycle/tier-config.ts` line 48

```diff
- throw new Error(`Tier config parse error in ${filePath}: ${err.message}`);
+ throw new Error(`Tier config parse error in ${filePath}: ${err.message}\n→ Fix: Validate your JSON with: cat "${filePath}" | jq .`);
```

## Security constraint

Remediation lines MUST reference environment variable **names** only — never their values.
API keys must never appear in error output.

## Acceptance gate

```bash
# Trigger each error and verify → Fix: line appears
npm test   # 269/269 pass
```
