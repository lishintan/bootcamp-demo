import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/index.js';
import type { JiraTicket } from '../jira/client.js';

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

/**
 * Build a plain-text representation of a ticket for similarity computation.
 */
export function ticketToText(ticket: JiraTicket): string {
  const parts: string[] = [ticket.summary];
  if (ticket.description) {
    parts.push(ticket.description);
  }
  if (ticket.labels.length > 0) {
    parts.push(`Labels: ${ticket.labels.join(', ')}`);
  }
  return parts.join('\n').trim();
}

/**
 * Use Claude to compute semantic similarity between two ticket texts.
 * Returns a float between 0 and 1.
 *
 * Decision: We use Claude (Anthropic API) rather than @xenova/transformers
 * because it produces consistently high-quality similarity judgements,
 * handles domain jargon well, and avoids the heavy model download burden
 * of local embedding models in a first-run scenario.
 */
export async function computeSimilarity(textA: string, textB: string): Promise<number> {
  const prompt = `You are a semantic similarity judge for product feedback tickets.

Given two product feedback ticket texts, rate their semantic similarity on a scale from 0.0 to 1.0:
- 1.0 = identical meaning (same issue described differently)
- 0.8+ = clearly the same underlying problem or request
- 0.5–0.8 = related but distinct concerns
- 0.0–0.5 = unrelated or only superficially similar

Rules:
- Focus on the core user problem or request, not wording
- Ignore differences in tone, grammar, or verbosity
- If both describe the same feature request or bug type from the same user perspective, score ≥ 0.8
- If they are about different features or different problem areas, score < 0.5

Respond with ONLY a JSON object like: {"similarity": 0.85}

Ticket A:
${textA}

Ticket B:
${textB}`;

  const message = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 64,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawContent = message.content[0];
  if (rawContent.type !== 'text') {
    throw new Error('Unexpected response type from Claude similarity API');
  }

  const text = rawContent.text.trim();
  // Extract JSON from response, handling potential extra text
  const jsonMatch = text.match(/\{[^}]+\}/);
  if (!jsonMatch) {
    throw new Error(`Could not parse similarity score from: ${text}`);
  }

  const parsed = JSON.parse(jsonMatch[0]) as { similarity: number };
  const score = parsed.similarity;

  if (typeof score !== 'number' || score < 0 || score > 1) {
    throw new Error(`Invalid similarity score: ${score}`);
  }

  return score;
}

/**
 * Compute similarity between a candidate ticket and a group (represented by
 * its parent ticket and all its children). Returns the max similarity score
 * against any member of the group.
 */
export async function computeGroupSimilarity(
  candidate: JiraTicket,
  groupTickets: JiraTicket[]
): Promise<number> {
  const candidateText = ticketToText(candidate);
  let maxScore = 0;

  // Compare against parent and up to 3 children to keep API calls bounded
  const representatives = groupTickets.slice(0, 4);

  for (const rep of representatives) {
    const repText = ticketToText(rep);
    const score = await computeSimilarity(candidateText, repText);
    if (score > maxScore) {
      maxScore = score;
    }
    // Early exit if we already exceed threshold
    if (maxScore >= config.similarityThreshold) {
      break;
    }
  }

  return maxScore;
}
