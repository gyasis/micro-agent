/**
 * Tier Audit Database
 * @module lifecycle/tier-db
 */

import path from 'path';
import { mkdirSync } from 'fs';
import { createLogger } from '../utils/logger';
import type { TierAttemptRecord, RunMetadataRow } from './types';

const logger = createLogger();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Database = require('better-sqlite3');
export type AuditDatabase = InstanceType<typeof Database>;

const DDL = `
CREATE TABLE IF NOT EXISTS tier_attempts (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id              TEXT    NOT NULL,
  tier_index          INTEGER NOT NULL,
  tier_name           TEXT    NOT NULL,
  tier_mode           TEXT    NOT NULL CHECK (tier_mode IN ('simple', 'full')),
  model_artisan       TEXT    NOT NULL,
  model_librarian     TEXT,
  model_critic        TEXT,
  iteration           INTEGER NOT NULL,
  code_change_summary TEXT    NOT NULL DEFAULT '',
  test_status         TEXT    NOT NULL CHECK (test_status IN ('passed', 'failed', 'error')),
  failed_tests        TEXT    NOT NULL DEFAULT '[]',
  error_messages      TEXT    NOT NULL DEFAULT '[]',
  cost_usd            REAL    NOT NULL DEFAULT 0.0,
  duration_ms         INTEGER NOT NULL DEFAULT 0,
  timestamp           TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS run_metadata (
  run_id              TEXT    PRIMARY KEY,
  objective           TEXT    NOT NULL,
  working_directory   TEXT    NOT NULL,
  test_command        TEXT    NOT NULL,
  tier_config_path    TEXT    NOT NULL,
  started_at          TEXT    NOT NULL,
  completed_at        TEXT,
  outcome             TEXT    CHECK (outcome IN ('success', 'failed', 'budget_exhausted', 'in_progress')),
  resolved_tier_name  TEXT,
  resolved_iteration  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tier_attempts_run_id ON tier_attempts(run_id);
CREATE INDEX IF NOT EXISTS idx_tier_attempts_run_tier ON tier_attempts(run_id, tier_index);
CREATE INDEX IF NOT EXISTS idx_tier_attempts_timestamp ON tier_attempts(timestamp);
`;

export function openAuditDatabase(dbPath: string): AuditDatabase {
  const dir = path.dirname(dbPath);
  mkdirSync(dir, { recursive: true });
  const db: AuditDatabase = new Database(dbPath);
  db.exec(DDL);
  return db;
}

export function writeAttemptRecord(
  db: AuditDatabase,
  record: TierAttemptRecord,
): void {
  try {
    db.prepare(
      `
      INSERT INTO tier_attempts (
        run_id, tier_index, tier_name, tier_mode,
        model_artisan, model_librarian, model_critic,
        iteration, code_change_summary, test_status,
        failed_tests, error_messages, cost_usd, duration_ms, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      record.runId,
      record.tierIndex,
      record.tierName,
      record.tierMode,
      record.modelArtisan,
      record.modelLibrarian ?? null,
      record.modelCritic ?? null,
      record.iteration,
      record.codeChangeSummary,
      record.testStatus,
      JSON.stringify(record.failedTests),
      JSON.stringify(record.errorMessages),
      record.costUsd,
      record.durationMs,
      record.timestamp,
    );
  } catch (err: any) {
    logger.warn(
      `[audit] DB write failed (tier_attempts): ${err.message} — continuing`,
    );
  }
}

export function writeRunMetadata(
  db: AuditDatabase,
  metadata: RunMetadataRow,
): void {
  try {
    db.prepare(
      `
      INSERT INTO run_metadata (
        run_id, objective, working_directory, test_command,
        tier_config_path, started_at, completed_at, outcome,
        resolved_tier_name, resolved_iteration
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      metadata.runId,
      metadata.objective,
      metadata.workingDirectory,
      metadata.testCommand,
      metadata.tierConfigPath,
      metadata.startedAt,
      metadata.completedAt ?? null,
      metadata.outcome ?? 'in_progress',
      metadata.resolvedTierName ?? null,
      metadata.resolvedIteration ?? null,
    );
  } catch (err: any) {
    logger.warn(
      `[audit] DB write failed (run_metadata insert): ${err.message} — continuing`,
    );
  }
}

export function updateRunMetadata(
  db: AuditDatabase,
  runId: string,
  updates: Partial<
    Pick<
      RunMetadataRow,
      'completedAt' | 'outcome' | 'resolvedTierName' | 'resolvedIteration'
    >
  >,
): void {
  try {
    db.prepare(
      `
      UPDATE run_metadata
      SET completed_at = ?, outcome = ?, resolved_tier_name = ?, resolved_iteration = ?
      WHERE run_id = ?
    `,
    ).run(
      updates.completedAt ?? null,
      updates.outcome ?? null,
      updates.resolvedTierName ?? null,
      updates.resolvedIteration ?? null,
      runId,
    );
  } catch (err: any) {
    logger.warn(
      `[audit] DB write failed (run_metadata update): ${err.message} — continuing`,
    );
  }
}

export function closeAuditDatabase(db: AuditDatabase): void {
  try {
    db.close();
  } catch (err: any) {
    logger.warn(`[audit] DB close failed: ${err.message}`);
  }
}
