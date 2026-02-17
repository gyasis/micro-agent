# Quickstart: Simple Mode with Auto-Escalation

## The Idea

By default, Micro Agent now starts cheap and fast. It tries to fix your code using only the code generator and your tests — no expensive codebase scanning or review agent. If the simple approach doesn't work after a few tries, it automatically escalates to the full pipeline, armed with everything it already learned.

## Basic Usage

```bash
# Just point it at your file — simple mode is now the default
ma-loop run src/spending.ts --test "npm test -- spending"
```

That's it. Under the hood:
1. Tries to fix `spending.ts` using 5 simple iterations (Artisan + Tests only)
2. If fixed: done. Cost: ~$0.01–$0.03
3. If not fixed: escalates to full mode with a summary of what was tried
4. Full mode takes over with context about the failures, solves it
5. Final report shows cost and iterations for both phases

## Common Scenarios

### Quick single-method fix

```bash
# Fix a logic bug in one method, no frills
ma-loop run src/math.ts --test "npm test -- math" --simple 3
```

### Complex bug, start directly in full mode

```bash
# Skip simple mode — you know this is a multi-file problem
ma-loop run src/checkout.ts --full
```

### Simple only, no escalation (fast-fail mode)

```bash
# Try 5 times, exit if not solved — don't spend more
ma-loop run src/parser.ts --simple 5 --no-escalate --max-budget 0.05
```

### Tune the escalation threshold

```bash
# Give simple mode 10 shots before escalating
ma-loop run src/algorithm.ts --simple 10
```

## Understanding the Output

When simple mode runs and escalates, you'll see:

```
[Simple Mode] Iteration 1/5 — generating fix...
[Simple Mode] Tests: FAILED (multiply returned NaN)
[Simple Mode] Iteration 2/5 — adjusting...
[Simple Mode] Tests: FAILED (multiply returned NaN)
...
[Simple Mode] 5/5 exhausted — escalating to Full Mode

⚡ Escalating: "multiply() failed with 'Expected 12, received NaN' across 5 attempts"

[Full Mode] Phase 1: Librarian analyzing codebase (with failure history)...
[Full Mode] Phase 2: Artisan generating fix...
[Full Mode] Phase 3: Critic reviewing...
[Full Mode] Phase 4: Tests: PASSED ✓

✓ SUCCESS — solved in 5 simple + 1 full = 6 total iterations
   Cost: $0.025 + $0.015 = $0.040 total
```

## Cost Guide

| Scenario | Approx Cost |
|---|---|
| Simple mode solves in 1-2 iterations | $0.005–$0.015 |
| Simple mode solves in 3-5 iterations | $0.015–$0.030 |
| Escalates, full mode solves in 1-2 more | $0.040–$0.080 |
| Full mode from start (`--full`) | $0.020–$0.050 per iteration |
