import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config/index.js';

export interface RunLogEntry {
  timestamp: string; // ISO 8601
  runNumber: number;
  ticketsProcessed: number;
  groupsCreated: number;
  groupsUpdated: number;
  linksCreated: number;
  securitySkipped: number;
  standaloneTickets: number;
  sinceDate: string | null;
  durationMs: number;
}

/**
 * Append a log entry to the JSONL run log file.
 * AC #8: After each run, a log entry records timestamp, tickets processed, groups created/updated.
 */
export function writeRunLog(entry: RunLogEntry): void {
  const logPath = config.runLogPath;
  const dir = path.dirname(logPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const line = JSON.stringify(entry) + '\n';
  fs.appendFileSync(logPath, line, 'utf-8');

  console.log(
    `[LOG] Run #${entry.runNumber} complete — ` +
    `${entry.ticketsProcessed} tickets processed, ` +
    `${entry.groupsCreated} groups created, ` +
    `${entry.groupsUpdated} groups updated, ` +
    `${entry.linksCreated} links created, ` +
    `${entry.securitySkipped} security-skipped, ` +
    `${entry.standaloneTickets} standalone` +
    ` (${entry.durationMs}ms)`
  );
}
