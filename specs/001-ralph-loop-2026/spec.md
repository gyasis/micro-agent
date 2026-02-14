# Feature Specification: Ralph Loop 2026 - Multi-Agent Testing System

**Feature Branch**: `001-ralph-loop-2026`
**Created**: 2026-02-12
**Status**: Draft
**Input**: User description: "Transform micro-agent iterative testing loop into Ralph Loop 2026: multi-agent state machine with Librarian (Gemini for context), Artisan (Claude for codegen), Critic (GPT for review), Chaos Agent (adversarial testing), polyglot testing support (TS/JS/Python/Rust), intelligent error handling with vector database memory vault, plugin system, completion promise pattern, and LiteLLM unified abstraction for 100+ providers"

## Clarifications

### Session 2026-02-12

- Q: How should the system handle multiple concurrent ralph-loop instances running on the same project? → A: Allow concurrent execution with instance-level isolation - each instance gets unique session ID, separate state files in .ralph/session-{id}/, shared MemoryVault uses atomic writes
- Q: Should MemoryVault persist fix attempts across different projects (global learning) or be project-specific? → A: Project-specific MemoryVault with optional global sharing - each project has isolated .ralph/memory.db, users can opt-in to sync anonymized patterns to global store
- Q: When codebase exceeds Librarian's context window, how should files be prioritized for inclusion? → A: Intelligent file ranking with dependency analysis - analyze import/require statements, rank by distance from target file in dependency graph, include closest dependencies first
- Q: Do adversarial test failures count toward the entropy detection threshold (3 identical errors trigger circuit breaker)? → A: Adversarial failures do NOT count toward entropy threshold - only unit test failures count toward the 3-identical-error circuit breaker, adversarial failures trigger backtracking but not entropy detection
- Q: How does the system discover ralph.config.yaml when --config flag is not provided? → A: Auto-discover with fallback to sensible defaults - check ./ralph.config.yaml, then parent directories up to git root, then use built-in defaults (librarian=gemini, artisan=claude, critic=gpt, max_iterations=30, max_cost=$2.00)
- Q: Should each iteration start with fresh LLM context (true Ralph loop) or accumulate context across iterations? → A: Fresh context each iteration is the GOLD STANDARD DEFAULT (read codebase + test results from disk, execute workflow, write to disk, exit session completely). Advanced users can optionally configure context_reset_frequency=N to reset every N iterations instead of every iteration, but this degrades quality as context accumulates (enters "dumb zone" after ~40% context usage)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Multi-Agent Code Generation (Priority: P1)

A developer runs the modernized micro-agent CLI to generate code, and the system orchestrates multiple specialized AI agents (Librarian for context, Artisan for generation, Critic for review) to collaboratively produce working code that passes all tests.

**Why this priority**: This is the core value proposition - transforming from single-LLM to multi-agent architecture. Without this, there's no Ralph Loop 2026.

**Independent Test**: Can be fully tested by running `ralph-loop ./file.ts --models librarian=gemini,artisan=claude,critic=gpt` and verifying that all three agents are invoked in sequence and produce passing code. Delivers immediate value of improved code quality through multi-model consensus.

**Acceptance Scenarios**:

1. **Given** a TypeScript file with failing tests, **When** developer runs ralph-loop with multi-agent configuration, **Then** Librarian analyzes codebase context, Artisan generates fix based on context, Critic reviews logic before test execution, and final code passes all tests
2. **Given** a Python file with logic errors, **When** developer runs ralph-loop, **Then** system routes to appropriate language-specific test runner (pytest) and agents collaborate to fix errors
3. **Given** a complex bug requiring historical context, **When** Librarian retrieves similar past errors from vector database, **Then** Artisan applies learned solutions reducing iterations by 30%
4. **Given** code generation in progress, **When** max iterations (30) is reached without success, **Then** system exits gracefully with detailed error report and recommendations

---

### User Story 2 - Intelligent Error Learning (Priority: P2)

A developer encounters an error that the system has seen before. The vector database (MemoryVault) retrieves past successful fixes, applies learned patterns, and resolves the error faster than starting from scratch.

**Why this priority**: Intelligent error handling is a key differentiator from naive retry loops. It enables the system to improve over time, reducing costs and iterations.

**Independent Test**: Can be tested by intentionally introducing a common error pattern (e.g., null pointer exception), verifying the system queries the vector database for similar errors, applies the top-ranked fix attempt, and resolves faster than baseline. Delivers measurable value in token cost reduction.

**Acceptance Scenarios**:

1. **Given** an error signature that exists in MemoryVault, **When** system encounters this error, **Then** system retrieves top 5 similar fix attempts ranked by success rate and applies highest-ranked solution first
2. **Given** a new error pattern not in MemoryVault, **When** system successfully fixes it, **Then** fix attempt is recorded with error signature, hypothesis, action taken, success status, and token cost
3. **Given** system detects entropy (same unit test error signature 3 times), **When** circuit breaker triggers, **Then** system pauses execution and asks user for guidance rather than continuing infinite loop
4. **Given** a flaky test (intermittent failures), **When** system categorizes error as FLAKY based on race condition patterns, **Then** specialized retry strategy is applied with different timing approach

---

### User Story 3 - Adversarial Testing Discovery (Priority: P2)

After initial tests pass, the Chaos Agent automatically generates property-based tests, fuzzing inputs, and mutation tests to discover edge cases that standard tests miss.

**Why this priority**: Adversarial testing is a major competitive advantage in 2026 and directly addresses the "test-only validation" limitation. It's core to achieving 95% success rate goal.

**Independent Test**: Can be tested by generating code that passes unit tests, running adversarial testing phase, and verifying Chaos Agent discovers at least 2 edge cases (e.g., null byte injection, max integer overflow) that weren't covered by original tests. Delivers 3x edge case detection as per KPI.

**Acceptance Scenarios**:

1. **Given** code that passes all unit tests, **When** Chaos Agent runs property-based tests, **Then** system generates invariants (e.g., "output must be non-null for all valid inputs") and fuzzes 100+ input combinations
2. **Given** TypeScript code with 80% coverage, **When** mutation testing runs (Stryker), **Then** system rejects code if mutation score < 80% (weak tests detected)
3. **Given** async code with race condition vulnerabilities, **When** Chaos Agent runs race condition detector, **Then** edge case failures are caught and fed back to Artisan for fixing
4. **Given** boundary value testing enabled, **When** Chaos Agent tests with null, undefined, 0, MAX_INT, empty string, **Then** at least one edge case failure is discovered that wasn't in original test suite

---

### User Story 4 - Polyglot Testing Support (Priority: P1)

A developer working on a Python, Rust, or JavaScript/TypeScript project can use the same ralph-loop CLI, and the system automatically detects the language, uses the native test framework, and provides language-specific error handling.

**Why this priority**: Polyglot support is essential for Ralph Loop 2026's market competitiveness and directly addresses the "language-agnostic testing" limitation. It's a launch requirement.

**Independent Test**: Can be tested by running ralph-loop on sample projects in each language (TS with Vitest, Python with pytest, Rust with cargo test) and verifying correct test runner detection, native feature usage (coverage reporting, snapshot testing), and unified ralph-test-json output format. Delivers MVP value for 4+ language support KPI.

**Acceptance Scenarios**:

1. **Given** a JavaScript project with package.json containing "jest" in test script, **When** ralph-loop runs, **Then** system detects Jest framework, executes `npm test`, parses output via JestReporter, and returns ralph-test-json format
2. **Given** a Python project with pytest imports, **When** ralph-loop runs, **Then** system detects pytest, executes `pytest --json-report`, parses via PytestReporter, and leverages Hypothesis for property testing
3. **Given** a Rust project with Cargo.toml, **When** ralph-loop runs, **Then** system detects cargo test, executes `cargo test --message-format=json`, parses via CargoTestReporter, and includes benchmark test results
4. **Given** mixed language project, **When** ralph-loop detects multiple manifest files, **Then** system prompts user to specify target language or runs tests for all detected languages sequentially

---

### User Story 5 - Plugin Extensibility (Priority: P3)

A developer wants to extend ralph-loop functionality (e.g., auto-generate documentation, run security scans, save benchmarks) by installing community plugins or creating custom ones.

**Why this priority**: Plugin system enables community growth and customization but isn't critical for MVP. It's a future-proofing feature that can be added post-launch.

**Independent Test**: Can be tested by installing a sample plugin (e.g., @ralph/prettier), configuring it to run onAfterGen hook, generating code, and verifying plugin executes and modifies output (formats code). Delivers extensibility value for power users.

**Acceptance Scenarios**:

1. **Given** ralph-plugins.yaml with "@ralph/prettier" enabled, **When** code generation completes, **Then** plugin's onAfterGen hook executes, code is auto-formatted, and formatted code is written to file
2. **Given** "@ralph/security-scan" plugin configured for onBeforeSuccess hook, **When** tests pass, **Then** plugin runs semgrep and snyk scans, and blocks success if critical vulnerabilities found
3. **Given** developer creates custom DocGenPlugin, **When** ralph-loop succeeds, **Then** plugin's onSuccess hook generates README.md from code comments and test results
4. **Given** plugin throws error during execution, **When** ralph-loop handles plugin failure, **Then** main workflow continues (plugins don't block core functionality) and error is logged to .ralph/plugin-errors.log

---

### User Story 6 - Completion Promise Pattern (Priority: P1)

A developer configures success criteria (tests pass, adversarial tests pass, coverage > 90%) and budget constraints (max $2.00 cost, 15 minutes timeout). The system exits when criteria are met OR budget is exceeded, providing clear completion status.

**Why this priority**: Intelligent exit conditions prevent infinite loops and wasted tokens. This is core infrastructure that enables all other features to work efficiently.

**Independent Test**: Can be tested by configuring ralph.config.yaml with strict budget ($0.50 max cost), running on complex problem, and verifying system stops exactly when budget is exceeded with status "budget_exceeded" and detailed cost breakdown. Delivers cost control value immediately.

**Acceptance Scenarios**:

1. **Given** ralph.config.yaml with `success_criteria: {tests_pass: true, adversarial_tests_pass: true, coverage_threshold: 90}`, **When** all criteria met in iteration 12, **Then** system exits with status "success" and reports iterations: 12, cost: $0.67
2. **Given** max_cost_usd: 2.00 budget, **When** cumulative LLM API costs reach $2.01, **Then** system exits with status "budget_exceeded" and reason "Cost limit reached: $2.01 / $2.00"
3. **Given** entropy_threshold: 3 configured, **When** same unit test error signature repeats 3 times with no progress, **Then** system exits with status "entropy_detected" and stuck_on: "TypeError: Cannot read property 'x' of undefined"
4. **Given** max_iterations: 30, **When** iteration 30 completes without meeting success criteria, **Then** system exits with status "max_iterations" and last_error: detailed final failure message

---

### Edge Cases

- **What happens when API key for one model (e.g., Gemini) is invalid?** System should fallback to alternative model routing (e.g., skip Librarian, use Claude for context analysis) and log warning
- **How does system handle network timeouts during LLM API calls?** Implement exponential backoff with 3 retries, then fallback to alternative provider if available
- **What if test framework detection fails** (e.g., no package.json, no pytest, no Cargo.toml)? System should prompt user to specify test command manually or exit with helpful error message
- **How does system prevent sensitive data** (API keys, credentials) from being sent to LLM providers? Local Guard agent (if enabled) masks PII/secrets using regex patterns before API calls
- **What if vector database** (ChromaDB/LanceDB) is unreachable? System continues without MemoryVault features, logs warning, and uses standard retry logic
- **How does MemoryVault handle learning across different projects?** Each project maintains isolated .ralph/memory.db with project-specific fix patterns. Users can opt-in to global pattern sharing via config (memory.global_sharing: true) to anonymize and sync successful patterns to community database for cross-project learning
- **What if codebase is too large for Librarian's context window?** System performs dependency analysis by parsing import/require statements, builds file dependency graph, ranks files by distance from target file (direct imports = distance 1, transitive = distance 2+), includes closest dependencies first up to context window limit, ensuring target file and distance-1 dependencies always included
- **Do adversarial test failures trigger the same circuit breaker as unit test failures?** No. Adversarial test failures trigger intelligent backtracking to try alternative fix strategies but do NOT increment the entropy counter (3 identical unit test errors = circuit breaker). Adversarial testing intentionally discovers edge cases, so failures are expected and handled differently from stuck-state unit test loops
- **What if user doesn't provide --config flag and no ralph.config.yaml exists in project?** System auto-discovers config by checking ./ralph.config.yaml, then parent directories up to git root. If no config found, falls back to built-in defaults (librarian=gemini-2.0-pro, artisan=claude-sonnet-4.5, critic=gpt-4.1-mini, max_iterations=30, max_cost=$2.00, adversarial_tests=true, coverage_threshold=90%, context_reset_frequency=1). Zero-config experience for simple use cases
- **How does the system prevent context bloat and "dumb zone" degradation?** Each iteration starts with fresh LLM session by default (context_reset_frequency=1). System reads codebase + test results from disk, executes multi-agent workflow, writes changes to disk, exits session completely. Next iteration starts fresh. This prevents context accumulation. Advanced users can set context_reset_frequency=N to reset every N iterations, but system warns about quality degradation and automatically resets if context usage exceeds 40%
- **Where is state persisted between iterations if each iteration uses fresh context?** Git working tree (code files), test output saved to .ralph/session-{id}/test-results-iteration-{N}.json, MemoryVault database (.ralph/memory.db), session iteration log (.ralph/session-{id}/iterations.log). Next iteration reads this persisted state fresh from disk, not from in-session memory
- **How does system handle plugin crashes?** Plugins run in isolated try-catch blocks; failures are logged but don't crash main workflow
- **What if user cancels mid-execution** (Ctrl+C)? System saves current state to .ralph/session-[id].json for potential resume, closes all LLM connections gracefully
- **How are race conditions handled in concurrent parallel testing?** System uses semaphore locks for file writes and sequential execution for tasks affecting same files
- **What if multiple ralph-loop instances run simultaneously on same project?** Each instance receives unique session ID (UUID), maintains separate state in .ralph/session-{id}/ directory (logs, checkpoints, temp files), shared MemoryVault uses atomic write operations with row-level locking to prevent corruption
- **What if adversarial tests find bugs after 25 iterations?** System applies intelligent backtracking: reverts to last known good state and tries alternative fix strategy. Adversarial test failures do NOT count toward entropy threshold (3 identical errors) - only unit test failures trigger circuit breaker. Adversarial testing is a discovery mechanism where finding bugs is the intended outcome
- **How does system handle multiple programming languages in one project** (e.g., TypeScript + Python)? User must specify target language via --language flag or system processes each language sequentially

## Requirements *(mandatory)*

### Functional Requirements

#### Core Multi-Agent Orchestration

- **FR-001**: System MUST implement state machine architecture with transitions between agent phases (context gathering → code generation → review → testing → adversarial testing → completion) that executes WITHIN each iteration, then resets completely for next iteration
- **FR-002**: System MUST support four specialized agent types: Librarian (context provider), Artisan (code generator), Critic (logic reviewer), and Chaos Agent (adversarial tester)
- **FR-003**: System MUST route requests to appropriate LLM providers via unified LiteLLM interface supporting Anthropic (Claude), Google (Gemini), OpenAI (GPT), Ollama (local models), and Azure OpenAI
- **FR-004**: System MUST allow users to configure agent-to-model mappings via configuration file (e.g., librarian=gemini, artisan=claude, critic=gpt)
- **FR-005**: System MUST track token usage and cost per agent with real-time cost reporting during execution
- **FR-006**: System MUST perform dependency analysis on codebase by parsing import/require statements to build file dependency graph for intelligent context prioritization
- **FR-007**: System MUST rank files by distance from target file in dependency graph (direct imports = distance 1, transitive imports = distance 2+) when Librarian context window cannot fit entire codebase
- **FR-008**: System MUST include closest dependencies first when providing context to Librarian, truncating at context window limit while ensuring target file and distance-1 dependencies always included

#### Iteration Lifecycle & Context Freshness (Ralph Loop Core)

- **FR-009**: System MUST start a fresh LLM session for each iteration by default (context_reset_frequency=1), destroying all in-session context from previous iteration to prevent "dumb zone" degradation
- **FR-010**: System MUST read codebase state from disk at iteration start (git working tree files, test output files, MemoryVault database) rather than accumulating context across iterations
- **FR-011**: System MUST execute complete multi-agent workflow within single iteration (Librarian reads disk → Artisan generates code → Critic reviews → test execution writes results to disk), then exit session before next iteration
- **FR-012**: System MUST persist all state changes to disk before exiting iteration (code changes written to files, test results saved, MemoryVault updated, session log appended to .ralph/session-{id}/iterations.log)
- **FR-013**: System MUST support optional context_reset_frequency configuration (default=1 for fresh context every iteration, advanced users can set N>1 to reset every N iterations with explicit warning about quality degradation)
- **FR-014**: System MUST monitor cumulative context usage per agent and emit warning when approaching 40% of context window limit (smart zone boundary), automatically triggering context reset regardless of context_reset_frequency setting
- **FR-015**: System MUST treat git working tree + test output + MemoryVault as the "memory" between iterations, not in-session LLM conversation history (stateless iteration principle)

#### Intelligent Error Handling & Memory

- **FR-016**: System MUST categorize errors into types (SYNTAX, LOGIC, ENVIRONMENT, FLAKY, PERFORMANCE) based on error message patterns and stack traces
- **FR-017**: System MUST store fix attempts in project-specific vector database (.ralph/memory.db) with error signature (normalized message), hypothesis, action taken, success status, timestamp, and token cost
- **FR-018**: System MUST query project-specific MemoryVault for similar errors (similarity threshold >= 0.85) and present top 5 past fixes ranked by success rate
- **FR-019**: System MUST detect entropy when identical unit test error signature repeats 3 times and trigger circuit breaker (pause and ask user for guidance); adversarial test failures do NOT count toward entropy threshold
- **FR-020**: System MUST record new successful fixes to project-specific MemoryVault for future learning
- **FR-021**: System MUST support optional global pattern sharing where users can opt-in via config to anonymize and sync successful fix patterns to global community database for cross-project learning

#### Polyglot Testing Framework Support

- **FR-022**: System MUST auto-detect project language by checking for manifest files (package.json for JS/TS, pyproject.toml/requirements.txt for Python, Cargo.toml for Rust)
- **FR-023**: System MUST detect native test framework from manifest (jest/vitest/mocha for JS/TS, pytest/unittest for Python, cargo test for Rust)
- **FR-024**: System MUST execute language-specific test commands with appropriate flags (e.g., `npm test` for JS, `pytest --json-report` for Python, `cargo test --message-format=json` for Rust)
- **FR-025**: System MUST parse test output via language-specific reporters (JestReporter, PytestReporter, CargoTestReporter) into unified ralph-test-json schema
- **FR-026**: System MUST include test metadata in ralph-test-json: status (pass/fail/skip/timeout), test name, duration, error type/message/stack trace, source location, coverage data, stdout/stderr
- **FR-027**: System MUST save test execution results to disk (.ralph/session-{id}/test-results-iteration-{N}.json) at end of each iteration for next iteration to read fresh from disk

#### Adversarial Testing

- **FR-028**: System MUST run adversarial testing phase AFTER initial unit tests pass
- **FR-029**: System MUST generate property-based tests using language-specific libraries (fast-check for TS/JS, Hypothesis for Python)
- **FR-030**: System MUST perform boundary value testing with edge inputs (null, undefined, 0, MAX_INT, MIN_INT, empty string, max length string)
- **FR-031**: System MUST integrate mutation testing frameworks (Stryker for TS/JS, mutmut for Python) and reject code if mutation score < 80%
- **FR-032**: System MUST detect race condition vulnerabilities in async code and generate timing-variation tests
- **FR-033**: System MUST handle adversarial test failures by triggering intelligent backtracking (revert to last known good state, try alternative fix) without incrementing entropy counter used for circuit breaker detection

#### Completion Promise Pattern

- **FR-034**: System MUST evaluate success criteria from configuration: tests_pass (required), adversarial_tests_pass (required), coverage_threshold (optional), linter_errors (optional), mutation_score_min (optional)
- **FR-035**: System MUST enforce budget constraints: max_iterations, max_cost_usd, max_duration_minutes
- **FR-036**: System MUST exit with appropriate status: "success" (all criteria met), "budget_exceeded" (cost/time/iterations limit), "entropy_detected" (stuck in loop), "max_iterations" (hard limit reached)
- **FR-037**: System MUST provide detailed completion report including iterations used, duration, cost breakdown by agent, patterns learned, next steps

#### Plugin System

- **FR-038**: System MUST load plugins from ralph-plugins.yaml configuration with enabled/disabled flag and hook configuration (onBeforeGen, onAfterGen, onTestFail, onSuccess, onBeforeSuccess)
- **FR-039**: System MUST execute plugin hooks at appropriate lifecycle stages with relevant context (code, test results, errors)
- **FR-040**: System MUST handle plugin failures gracefully (log error, continue main workflow) without crashing core functionality
- **FR-041**: System MUST provide plugin SDK with TypeScript interfaces (RalphPlugin, Context, TestError, Results) for community plugin development

#### Configuration & User Experience

- **FR-042**: System MUST support ralph.config.yaml configuration file with sections: models (provider, model name, temperature), languages (test framework, patterns, coverage tool), testing (strategies enabled), success_criteria, budgets, memory (vector DB settings, opt-in global sharing, context_reset_frequency), plugins, sandbox (type, limits)
- **FR-043**: System MUST auto-discover configuration by checking ./ralph.config.yaml in current directory, then searching parent directories up to git root, then falling back to built-in defaults if no config found
- **FR-044**: System MUST provide sensible built-in defaults: librarian=gemini-2.0-pro, artisan=claude-sonnet-4.5, critic=gpt-4.1-mini, max_iterations=30, max_cost_usd=2.00, adversarial_tests=true, coverage_threshold=90, mutation_score_min=80, context_reset_frequency=1 (fresh context every iteration - GOLD STANDARD)
- **FR-045**: System MUST provide CLI interface accepting arguments: file path, --config (path to config, overrides auto-discovery), --adversarial (enable adversarial testing), --models (model assignments), --budget (cost limit), --ui (enable web dashboard)
- **FR-046**: System MUST display real-time progress updates including current phase, iteration count, cost spent, duration, context usage percentage, thought stream from each agent
- **FR-047**: System MUST output structured summary on completion with test results, coverage, mutation score, agent usage breakdown, memory vault stats, context resets performed, next steps

#### Concurrent Execution

- **FR-048**: System MUST support multiple concurrent instances on same project by assigning unique session ID (UUID) to each instance on startup
- **FR-049**: System MUST isolate instance-specific state in separate .ralph/session-{id}/ directories (logs, checkpoints, temporary files, test results per iteration) to prevent conflicts
- **FR-050**: System MUST use atomic write operations with row-level locking when accessing shared project-specific MemoryVault (.ralph/memory.db) to prevent data corruption from concurrent instances

### Key Entities

- **Agent**: Represents a specialized AI agent with properties: name (Librarian/Artisan/Critic/Chaos/LocalGuard), role (context/codegen/review/adversarial/privacy), provider (anthropic/google/openai/ollama), model name, temperature, responsibilities. Relationships: orchestrated by state machine, consumes Context, produces Output
- **TestResult**: Represents execution outcome of a test with properties: status (pass/fail/skip/timeout), test_name, duration_ms, error (type/message/stack_trace/source_location), coverage (line/branch percentages), stdout, stderr. Relationships: produced by TestRunner, consumed by Agents for analysis
- **ErrorPattern**: Represents a categorized error signature with properties: category (SYNTAX/LOGIC/ENVIRONMENT/FLAKY/PERFORMANCE), signature (normalized error message), frequency (occurrence count), fixes (list of FixAttempts), success_rate, project_id (for isolation), anonymized_version (for optional global sharing). Relationships: stored in project-specific MemoryVault (.ralph/memory.db), queried during error analysis, optionally synced to global community database if user opts in
- **FixAttempt**: Represents an attempted solution to an error with properties: error_signature, hypothesis (agent's reasoning), action_taken (code changes), success (boolean), timestamp, cost_tokens. Relationships: belongs to ErrorPattern, stored in vector database for similarity search
- **Plugin**: Represents an extension module with properties: name, version, enabled flag, hooks (onBeforeGen/onAfterGen/onTestFail/onSuccess/onBeforeSuccess), config (hook-specific settings). Relationships: loaded from ralph-plugins.yaml, executed at lifecycle stages
- **CompletionPromise**: Represents success criteria and budget constraints with properties: required_criteria (tests_pass, adversarial_tests_pass), optional_criteria (coverage_threshold, linter_errors, complexity_score, mutation_score_min, performance_regression), budgets (max_iterations, max_cost_usd, max_duration_minutes), circuit_breaker (entropy_threshold). Relationships: evaluated after each iteration, determines system exit
- **StateTransition**: Represents workflow phase with properties: from_state, to_state, trigger (condition for transition), agent_assigned, actions (operations during state). Relationships: managed by XState state machine, determines execution flow
- **LanguageConfig**: Represents polyglot support settings with properties: language (typescript/python/rust), test_framework (jest/pytest/cargo), test_pattern (glob for test files), test_command (CLI command), coverage_tool (c8/coverage/cargo-tarpaulin), parser (JestReporter/PytestReporter/CargoTestReporter). Relationships: detected from project manifest, configures TestRunner
- **Session**: Represents a single ralph-loop execution instance with properties: session_id (UUID), start_time, end_time, status (running/completed/failed), state_directory (.ralph/session-{id}/), iteration_count, total_cost, agents_used. Relationships: owns isolated state files, writes to shared MemoryVault atomically, can run concurrently with other Sessions
- **DependencyGraph**: Represents codebase file relationships with properties: nodes (file paths), edges (import/require relationships), distance_matrix (shortest path distances between files), target_file (file being fixed). Relationships: built during Librarian phase via static analysis, used to rank files for context prioritization, cached per project for performance

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Code generated by multi-agent system passes adversarial tests 90% of the time (measured across 100 test runs on diverse codebases)
- **SC-002**: Average cost per successful execution is under $0.50 USD (measured by LiteLLM cost tracking across all agent API calls)
- **SC-003**: User satisfaction score exceeds 4.5/5 based on post-execution feedback survey (ease of use, code quality, value)
- **SC-004**: System supports at least 4 programming languages with native test framework integration (TypeScript, JavaScript, Python, Rust confirmed working)
- **SC-005**: Edge case detection increases by 3x compared to single-agent baseline (measured by number of bugs caught by Chaos Agent that weren't in original test suite)
- **SC-006**: 95% test pass rate within budget constraints (max 30 iterations, $2.00 cost) across benchmark problem set
- **SC-007**: Token cost reduces by 30% compared to baseline through intelligent error learning and MemoryVault usage (measured after 100 executions with warm cache)
- **SC-008**: Repeated error patterns resolve 40% faster on second occurrence due to vector database lookup (measured by iteration count reduction)
- **SC-009**: System completes 95% of executions without infinite loops (entropy detection triggers circuit breaker successfully)
- **SC-010**: Plugin system supports community contributions with at least 3 example plugins working (auto-docs, security-scan, benchmark) and public SDK documentation

### Quality Gates

- **SC-011**: Ralph Loop 2026 codebase itself achieves 95% test coverage with its own testing suite
- **SC-012**: All 6 phases of implementation (Core Infrastructure, Multi-LLM Orchestration, Polyglot Testing, Adversarial Testing, Memory & Learning, Plugin System) deliver working functionality as specified in PRD
- **SC-013**: System handles all documented edge cases without crashes (API failures, network timeouts, invalid configs, missing dependencies)
- **SC-014**: Performance benchmarks show no regression: median execution time within 20% of single-agent baseline despite multi-agent overhead
- **SC-015**: Security validation passes: sandbox escape prevention verified, API key protection working, dependency scanning via plugins detects known vulnerabilities
- **SC-016**: Context usage remains below 40% per agent per iteration when using default context_reset_frequency=1 (smart zone operation per Ralph loop methodology), preventing quality degradation from context bloat

## Assumptions

- **ASM-001**: LiteLLM library provides reliable unified interface to 100+ LLM providers with consistent error handling and cost tracking (verified in PRD technical stack)
- **ASM-002**: Vector database (ChromaDB or LanceDB) can handle 1000+ fix attempts with <100ms similarity search latency for real-time error lookup
- **ASM-003**: Users have API keys for at least one LLM provider (Claude OR Gemini OR GPT) to use the multi-agent system; local Ollama models are optional fallback
- **ASM-004**: Project manifest files (package.json, pyproject.toml, Cargo.toml) are present and properly configured for language/framework detection to work
- **ASM-005**: Docker or WebContainers are available for sandboxed test execution to prevent malicious code from affecting host system
- **ASM-006**: Users accept default model-to-agent assignments (Librarian=Gemini, Artisan=Claude, Critic=GPT) unless overridden in config; this is based on 2026 market research in PRD
- **ASM-007**: Adversarial testing libraries (fast-check, Hypothesis, Stryker, mutmut) are compatible with current versions of supported languages and can be installed automatically
- **ASM-008**: Network connectivity is stable enough for multiple LLM API calls (Librarian + Artisan + Critic = 3 minimum per iteration); system will fallback on transient failures
- **ASM-009**: Users can optionally provide ralph.config.yaml for customization, but system works with sensible defaults if no config provided; users who do provide config understand basic YAML syntax
- **ASM-010**: Code generation tasks are scoped to file-level changes (not multi-file refactoring) for MVP; multi-file support is post-launch enhancement
- **ASM-011**: Primary use case is iterative testing workflow (run tests → read failures from disk → fix code → write to disk → re-run tests → repeat until all pass); fresh context each iteration is optimal for this pattern as test results are persisted to disk between iterations

## Dependencies

- **DEP-001**: External LLM APIs (Anthropic Claude API, Google Gemini API, OpenAI GPT API) with valid authentication and sufficient rate limits
- **DEP-002**: LiteLLM library (unified LLM interface) compatible with Node.js 20+ and TypeScript 5.0+
- **DEP-003**: XState library for state machine orchestration compatible with TypeScript 5.0+
- **DEP-004**: Vector database (ChromaDB or LanceDB) with Node.js client libraries for MemoryVault functionality
- **DEP-005**: Language-specific test frameworks (Jest/Vitest/Mocha for JS/TS, pytest for Python, cargo test for Rust) installed in user projects
- **DEP-006**: Adversarial testing libraries (fast-check npm package for TS/JS, Hypothesis PyPI package for Python, Stryker npm package for mutation testing, mutmut PyPI package)
- **DEP-007**: Docker or WebContainers runtime for sandboxed test execution to prevent code injection attacks
- **DEP-008**: Coverage tools (c8 for JS/TS, coverage.py for Python, cargo-tarpaulin for Rust) for coverage threshold validation
- **DEP-009**: SQLite (included in Node.js) or external vector DB for storing MemoryVault fix patterns with embedding search
- **DEP-010**: Ollama (optional) for local model support (Llama 4) if users want privacy-first or offline operation

## Out of Scope

- **OOS-001**: Multi-file refactoring and cross-file dependency analysis (reserved for post-MVP v2.0)
- **OOS-002**: Visual web dashboard with live thought stream (reserved for Phase 6 or later; MVP will use CLI progress bars)
- **OOS-003**: Distributed agent execution across multiple machines (scalability feature for enterprise version)
- **OOS-004**: Cloud-hosted "Ralph as a Service" offering (requires separate deployment infrastructure)
- **OOS-005**: Team collaboration features like shared MemoryVault across developers (enterprise feature)
- **OOS-006**: Support for compiled languages beyond Rust (C++, Go, Java) - adds complexity; post-launch
- **OOS-007**: Custom LLM fine-tuning or model training (relies on pre-trained API models only)
- **OOS-008**: Integration with CI/CD pipelines (GitHub Actions, GitLab CI) - users can manually invoke ralph-loop in CI scripts for MVP
- **OOS-009**: IDE extensions (VSCode, JetBrains) - CLI-first approach for MVP
- **OOS-010**: Automatic git commit after success (made optional in config; not default behavior for MVP)
- **OOS-011**: Real-time collaboration / pair programming features (single-user tool for MVP)
- **OOS-012**: Support for non-LLM AI models (traditional ML, symbolic reasoning) - LLM-only for MVP

## Constraints

- **CON-001**: **Budget Limit**: Individual execution must respect user-configured max_cost_usd (default $2.00) to prevent runaway API costs
- **CON-002**: **Iteration Limit**: Hard maximum of 30 iterations per execution to prevent infinite loops even if entropy detection fails
- **CON-003**: **Timeout Limit**: Sandbox execution timeout of 300 seconds (5 minutes) per test run to prevent hanging processes
- **CON-004**: **Memory Limit**: Sandbox memory limit of 2048 MB to prevent resource exhaustion on shared systems
- **CON-005**: **Language Support**: MVP limited to TypeScript, JavaScript, Python, Rust; other languages require additional parser adapters
- **CON-006**: **LLM Provider Availability**: System requires at least ONE of Claude/Gemini/GPT API to be reachable; cannot function fully offline unless Ollama configured
- **CON-007**: **Vector Database Size**: MemoryVault limited to 1000 fix patterns for MVP to keep storage manageable; oldest patterns pruned when limit reached
- **CON-008**: **Similarity Threshold**: Error matching requires >=0.85 cosine similarity in vector space to prevent false positive fix suggestions
- **CON-009**: **Mutation Score**: Adversarial testing requires >=80% mutation score; cannot be lowered below 70% even in config
- **CON-010**: **Plugin Isolation**: Plugins cannot access file system outside project directory or make network requests to non-whitelisted domains for security
- **CON-011**: **Backward Compatibility**: Must maintain compatibility with existing micro-agent CLI flags for seamless migration (users can run `micro-agent` or `ralph-loop`)
- **CON-012**: **File Size Limit**: Code files > 10,000 lines trigger warning and recommendation to split; Librarian context window may be exceeded
- **CON-013**: **Context Reset Frequency**: Default context_reset_frequency=1 (fresh context every iteration) is STRONGLY RECOMMENDED; setting context_reset_frequency>1 trades quality for marginal performance gain and system will emit warnings. Automatic override triggers if context usage exceeds 40% regardless of user configuration

## Risks & Mitigations

- **RISK-001**: **LLM API Cost Overruns** - Mitigation: Strict budget enforcement, early exit on cost threshold, local model fallback option
- **RISK-002**: **API Rate Limiting** - Mitigation: Exponential backoff, provider fallback routing (Gemini → Claude → GPT), request queuing
- **RISK-003**: **Vector DB Inconsistency** - Mitigation: Graceful degradation (continue without MemoryVault if unreachable), local SQLite fallback
- **RISK-004**: **Test Framework Detection Failures** - Mitigation: Manual test command override via --test-command flag, clear error messages with suggestions
- **RISK-005**: **Adversarial Testing False Positives** - Mitigation: Allow users to disable specific adversarial strategies in config, mutation score threshold configurable 70-90%
- **RISK-006**: **Plugin Security Vulnerabilities** - Mitigation: Sandboxed plugin execution, file system access restrictions, network request whitelisting
- **RISK-007**: **State Machine Deadlocks** - Mitigation: XState has built-in deadlock detection, max_duration_minutes timeout, manual cancel support
- **RISK-008**: **Multi-Agent Coordination Failures** - Mitigation: Each agent phase has independent try-catch, fallback to single-agent mode if coordination fails
- **RISK-009**: **Context Window Overflow** (Librarian) - Mitigation: Build dependency graph via import/require statement parsing, rank files by distance from target file, include closest dependencies first (distance-1 always included), cache dependency graph for performance, truncate at context window limit with summary of excluded files
- **RISK-010**: **User Adoption Friction** - Mitigation: Maintain backward compatibility with micro-agent CLI, provide migration guide, default config templates
