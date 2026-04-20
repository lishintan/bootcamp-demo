import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config/index.js';

export interface RunState {
  lastRunAt: string | null; // ISO 8601 timestamp of last completed run
  totalRunsCompleted: number;
}

const DEFAULT_STATE: RunState = {
  lastRunAt: null,
  totalRunsCompleted: 0,
};

/**
 * Load run state from disk.
 * Returns default state if the file doesn't exist (AC #6: first run).
 */
export function loadRunState(): RunState {
  const statePath = config.runStatePath;

  if (!fs.existsSync(statePath)) {
    return { ...DEFAULT_STATE };
  }

  try {
    const raw = fs.readFileSync(statePath, 'utf-8');
    const parsed = JSON.parse(raw) as RunState;
    return parsed;
  } catch (err) {
    console.warn(`[STATE] Could not parse run state file, using defaults: ${err}`);
    return { ...DEFAULT_STATE };
  }
}

/**
 * Persist updated run state to disk.
 */
export function saveRunState(state: RunState): void {
  const statePath = config.runStatePath;
  const dir = path.dirname(statePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Advance state after a successful run.
 * Returns the new state.
 */
export function advanceRunState(current: RunState, runAt: Date): RunState {
  return {
    lastRunAt: runAt.toISOString(),
    totalRunsCompleted: current.totalRunsCompleted + 1,
  };
}

/**
 * Determine the "since" date for incremental processing.
 * AC #6: first run processes all historical tickets (returns undefined).
 * AC #7: subsequent runs process only tickets created after the last run.
 */
export function getSinceDate(state: RunState): Date | undefined {
  if (!state.lastRunAt) {
    return undefined; // First run — process all
  }
  return new Date(state.lastRunAt);
}
