/**
 * Won't Do Resurfacing Engine
 *
 * Sprint 5: Tracks Won't Do'd tickets and detects when ≥3 new semantically-similar
 * tickets arrive after the original ticket was marked Won't Do.
 *
 * State file: state/resurfacing-state.json
 *
 * Schema:
 * {
 *   "wontDoTickets": [
 *     {
 *       "ticketKey": "PF-123",
 *       "summary": "...",
 *       "description": "...",
 *       "wontDoDate": "2026-01-15T00:00:00.000Z"
 *     }
 *   ]
 * }
 *
 * On each monthly digest run:
 *   1. Load the state file
 *   2. For each Won't Do'd ticket, compare it against all current Parking Lot tickets
 *      that arrived AFTER the wontDoDate using computeSimilarity()
 *   3. Count how many new tickets score ≥ similarity threshold
 *   4. If ≥ 3 → include in resurfaced list; if < 3 → exclude
 */

import * as fs from 'fs';
import * as path from 'path';
import type { JiraTicket } from '../jira/client.js';
import { computeSimilarity, ticketToText } from '../similarity/index.js';
import { config } from '../config/index.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WontDoRecord {
  /** Jira ticket key that was moved to Won't Do */
  ticketKey: string;
  /** Ticket summary (for similarity comparison when ticket may be gone) */
  summary: string;
  /** Ticket description (for similarity comparison) */
  description: string | null;
  /** ISO-8601 date when the ticket was moved to Won't Do */
  wontDoDate: string;
  /** Team name at the time the ticket was moved to Won't Do (used for digest routing) */
  team: string;
}

export interface ResurfacingState {
  wontDoTickets: WontDoRecord[];
}

export interface ResurfacingResult {
  ticketKey: string;
  wontDoDate: string;
  newSimilarCount: number;
  /** Team name carried from the WontDoRecord so digest routing works even after the ticket leaves Parking Lot */
  team: string;
}

// ── State Path ────────────────────────────────────────────────────────────────

const DEFAULT_RESURFACING_STATE_PATH = path.join(
  process.cwd(),
  'state',
  'resurfacing-state.json'
);

function getResurfacingStatePath(): string {
  return process.env['RESURFACING_STATE_PATH'] ?? DEFAULT_RESURFACING_STATE_PATH;
}

// ── State I/O ─────────────────────────────────────────────────────────────────

export function loadResurfacingState(): ResurfacingState {
  const statePath = getResurfacingStatePath();

  if (!fs.existsSync(statePath)) {
    return { wontDoTickets: [] };
  }

  try {
    const raw = fs.readFileSync(statePath, 'utf-8');
    return JSON.parse(raw) as ResurfacingState;
  } catch (err) {
    console.warn(`[RESURFACING] Could not parse state file, starting fresh: ${err}`);
    return { wontDoTickets: [] };
  }
}

export function saveResurfacingState(state: ResurfacingState): void {
  const statePath = getResurfacingStatePath();
  const dir = path.dirname(statePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Record a newly Won't Do'd ticket in the resurfacing state.
 * If the ticket is already recorded, this is a no-op (idempotent).
 */
export function recordWontDoTicket(
  state: ResurfacingState,
  ticket: JiraTicket
): ResurfacingState {
  const alreadyRecorded = state.wontDoTickets.some(
    (r) => r.ticketKey === ticket.key
  );

  if (alreadyRecorded) {
    console.log(`[RESURFACING] ${ticket.key} already in resurfacing state — skipping`);
    return state;
  }

  const record: WontDoRecord = {
    ticketKey: ticket.key,
    summary: ticket.summary,
    description: ticket.description,
    wontDoDate: new Date().toISOString(),
    team: '',
  };

  console.log(`[RESURFACING] Recording Won't Do ticket: ${ticket.key}`);

  return {
    ...state,
    wontDoTickets: [...state.wontDoTickets, record],
  };
}

/**
 * Record a newly Won't Do'd ticket by key + summary (when full JiraTicket is unavailable).
 * The `team` parameter is stored so that `buildFeatureDigests()` can route the resurfaced
 * ticket to the correct squad lead even after the ticket has left Parking Lot.
 */
export function recordWontDoByKey(
  state: ResurfacingState,
  ticketKey: string,
  summary: string,
  description: string | null = null,
  team: string = ''
): ResurfacingState {
  const alreadyRecorded = state.wontDoTickets.some(
    (r) => r.ticketKey === ticketKey
  );

  if (alreadyRecorded) {
    return state;
  }

  const record: WontDoRecord = {
    ticketKey,
    summary,
    description,
    wontDoDate: new Date().toISOString(),
    team,
  };

  return {
    ...state,
    wontDoTickets: [...state.wontDoTickets, record],
  };
}

// ── Resurfacing Detection ─────────────────────────────────────────────────────

/**
 * For a single Won't Do record, count how many current Parking Lot tickets
 * are semantically similar (score ≥ threshold) AND arrived after the wontDoDate.
 */
async function countNewSimilarTickets(
  record: WontDoRecord,
  currentTickets: JiraTicket[]
): Promise<number> {
  const threshold = config.similarityThreshold;
  const wontDoTime = new Date(record.wontDoDate).getTime();

  // Only consider tickets created AFTER the wontDoDate
  const newTickets = currentTickets.filter((t) => {
    const createdTime = new Date(t.created).getTime();
    return createdTime > wontDoTime && t.key !== record.ticketKey;
  });

  if (newTickets.length === 0) return 0;

  const recordText =
    record.summary + (record.description ? '\n' + record.description : '');

  let similarCount = 0;

  for (const ticket of newTickets) {
    try {
      const ticketText = ticketToText(ticket);
      const score = await computeSimilarity(recordText, ticketText);
      if (score >= threshold) {
        similarCount++;
        console.log(
          `[RESURFACING] ${ticket.key} is similar to ${record.ticketKey} ` +
          `(score=${score.toFixed(3)})`
        );
      }
    } catch (err) {
      console.warn(
        `[RESURFACING] Similarity check failed for ${ticket.key} vs ${record.ticketKey}: ${err}`
      );
    }
  }

  return similarCount;
}

/**
 * Run the full resurfacing check:
 * - For each Won't Do record, count new similar tickets since the wontDoDate
 * - Return those with ≥ 3 new similar tickets
 *
 * @param currentParkingLotTickets - All current Parking Lot tickets
 * @returns ResurfacingResult[] — tickets that qualify for resurfacing (≥3 new similar)
 */
export async function detectResurfacedTickets(
  currentParkingLotTickets: JiraTicket[]
): Promise<ResurfacingResult[]> {
  const state = loadResurfacingState();

  if (state.wontDoTickets.length === 0) {
    console.log("[RESURFACING] No Won't Do records found — skipping resurfacing check");
    return [];
  }

  console.log(
    `[RESURFACING] Checking ${state.wontDoTickets.length} Won't Do record(s) ` +
    `against ${currentParkingLotTickets.length} current tickets`
  );

  const results: ResurfacingResult[] = [];

  for (const record of state.wontDoTickets) {
    console.log(`[RESURFACING] Checking ${record.ticketKey} (Won't Do: ${record.wontDoDate})`);

    const newSimilarCount = await countNewSimilarTickets(record, currentParkingLotTickets);

    console.log(
      `[RESURFACING] ${record.ticketKey}: ${newSimilarCount} new similar ticket(s) since Won't Do`
    );

    if (newSimilarCount >= 3) {
      results.push({
        ticketKey: record.ticketKey,
        wontDoDate: record.wontDoDate,
        newSimilarCount,
        team: record.team,
      });
    }
  }

  console.log(
    `[RESURFACING] Resurfacing complete: ${results.length} ticket(s) meet the ≥3 threshold`
  );

  return results;
}
