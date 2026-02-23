# Contract: TypeScript Upgrade (4.9.5 → 5.9.3)

## package.json changes

```json
{
  "devDependencies": {
    "typescript": "^5.9.3",
    "@typescript-eslint/parser": "^8.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@types/node": "^18.21.0"
  }
}
```

## tsconfig.json changes

```diff
-   "moduleResolution": "node",
+   "moduleResolution": "node16",
```

All other fields unchanged.

## Acceptance gate

```bash
npx tsc --noEmit   # exits 0, zero output
npm test           # 269/269 pass
```

## Source file changes

None required. The `summary-reporter.ts:311` error is resolved by the TS upgrade alone.
