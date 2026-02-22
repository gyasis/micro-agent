# Data Model: 004 — Fix Outstanding Issues

**Branch**: `004-fix-outstanding-issues` | **Date**: 2026-02-20

This feature introduces no new data entities. It modifies one existing class interface and
adds documentation structure. Changes documented below.

---

## Modified Interface: MemoryVault

**File**: `src/memory/memory-vault.ts`

### New field
```
connected: boolean (private)
  Default: true
  Set to false on ChromaDB connection failure in initialize()
  Never reset to true once false (fail-fast pattern)
```

### New method
```
isConnected(): boolean (public)
  Returns: the value of this.connected
  Purpose: allows callers to inspect vault availability without trying an operation
```

### Behaviour change: initialize()
```
Before: throws on any ChromaDB connection error
After:  catches errors and timeouts (≤3s), sets connected=false, logs warn, does NOT throw
        Exactly one warn-level log emitted per vault lifetime
```

### Behaviour change: all public read/write methods
```
Before: call ChromaDB unconditionally, throw on network error
After:  check this.connected first; if false, return early with zero-cost no-op result:
          storeFixPattern()         → returns void (no-op)
          storeTestPattern()        → returns void (no-op)
          searchFixPatterns()       → returns [] (empty array)
          searchTestPatterns()      → returns [] (empty array)
          getStats()                → returns { fixPatterns: 0, testPatterns: 0 }
          subsequent calls log at debug level only (no repeated warn spam)
```

---

## Modified Config: tsconfig.json

```
moduleResolution: "node" → "node16"
  Required for TypeScript 5.x ESM module resolution compatibility
  No new fields; no removed fields
```

---

## New Structure: docs/api/

```
docs/api/
├── README.md
│     title: "Micro Agent API Reference"
│     contents: table of contents, quick-start links, version note
│
├── cli.md
│     covers: all CLI flags for `ma`, `micro-agent`, `ma-loop` / `ralph-loop run`
│     fields per flag: name, type, default, description, example
│
├── config.md
│     covers: full ralph.config.yaml schema
│     fields per entry: key path, type, default, valid values, description
│
├── agents.md
│     covers: AgentContext, LibrarianOutput, ArtisanOutput, CriticOutput, CriticFeedback
│     fields per interface: field name, type, required/optional, description
│
└── lifecycle.md
      covers: IterationManager, ContextMonitor, SessionResetter, TierEngine, TierConfig
      fields per export: function/class name, parameters, return type, description
```

---

## No Changes To

- `AgentContext` interface — no new fields
- `TierConfig` / `TierEscalationConfig` — no changes
- CLI API surface (`--simple`, `--full`, `--no-escalate`, `--tier-config`) — no changes
- Database schema (`better-sqlite3` audit tables) — no changes
- Any test fixtures or test helpers
