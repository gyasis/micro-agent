import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { rmSync, mkdirSync } from 'fs';
import {
  openAuditDatabase,
  writeAttemptRecord,
  writeRunMetadata,
  updateRunMetadata,
  closeAuditDatabase,
} from '../../../src/lifecycle/tier-db';
import type { TierAttemptRecord, RunMetadataRow } from '../../../src/lifecycle/types';

const TMP_DIR = '/tmp/tier-db-tests';

beforeEach(() => mkdirSync(TMP_DIR, { recursive: true }));
afterEach(() => rmSync(TMP_DIR, { recursive: true, force: true }));

function getDb(name = 'test.db') {
  return openAuditDatabase(join(TMP_DIR, name));
}

function makeAttemptRecord(overrides: Partial<TierAttemptRecord> = {}): TierAttemptRecord {
  return {
    runId: 'run-001',
    tierIndex: 0,
    tierName: 'local',
    tierMode: 'simple',
    modelArtisan: 'llama3',
    modelLibrarian: null,
    modelCritic: null,
    iteration: 1,
    codeChangeSummary: 'added null check',
    testStatus: 'failed',
    failedTests: ['test_foo'],
    errorMessages: ['AssertionError'],
    costUsd: 0.0,
    durationMs: 500,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeRunMetadata(overrides: Partial<RunMetadataRow> = {}): RunMetadataRow {
  return {
    runId: 'run-001',
    objective: 'fix tests',
    workingDirectory: '/tmp/proj',
    testCommand: 'npm test',
    tierConfigPath: '/tmp/tiers.json',
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('openAuditDatabase', () => {
  it('creates database and tables', () => {
    const db = getDb();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const names = tables.map((t: { name: string }) => t.name);
    expect(names).toContain('tier_attempts');
    expect(names).toContain('run_metadata');
    closeAuditDatabase(db);
  });

  it('is idempotent (CREATE IF NOT EXISTS)', () => {
    const dbPath = join(TMP_DIR, 'idempotent.db');
    const db1 = openAuditDatabase(dbPath);
    closeAuditDatabase(db1);
    const db2 = openAuditDatabase(dbPath);
    closeAuditDatabase(db2);
  });
});

describe('writeAttemptRecord', () => {
  it('inserts a record into tier_attempts', () => {
    const db = getDb();
    writeAttemptRecord(db, makeAttemptRecord());
    const rows = db.prepare('SELECT * FROM tier_attempts').all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].run_id).toBe('run-001');
    expect(rows[0].test_status).toBe('failed');
    closeAuditDatabase(db);
  });

  it('stores failedTests as JSON string', () => {
    const db = getDb();
    writeAttemptRecord(db, makeAttemptRecord({ failedTests: ['a', 'b'] }));
    const row = db.prepare('SELECT failed_tests FROM tier_attempts').get() as any;
    expect(JSON.parse(row.failed_tests)).toEqual(['a', 'b']);
    closeAuditDatabase(db);
  });
});

describe('writeRunMetadata + updateRunMetadata', () => {
  it('inserts and updates run_metadata', () => {
    const db = getDb();
    writeRunMetadata(db, makeRunMetadata());
    updateRunMetadata(db, 'run-001', { outcome: 'success', completedAt: new Date().toISOString() });
    const row = db.prepare('SELECT * FROM run_metadata WHERE run_id = ?').get('run-001') as any;
    expect(row.outcome).toBe('success');
    closeAuditDatabase(db);
  });
});
