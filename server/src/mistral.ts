import type { BrainQuery, BrainAnswer } from './types.js';

const MODEL = process.env.MISTRAL_MODEL || 'mistral-small-latest';
const API_URL = 'https://api.mistral.ai/v1/chat/completions';

interface KeyState {
  key: string;
  cooldownUntil: number;
}

const keys: KeyState[] = (process.env.MISTRAL_API_KEYS || '')
  .split(',')
  .map((k) => k.trim())
  .filter(Boolean)
  .map((key) => ({ key, cooldownUntil: 0 }));

const COOLDOWN_MS = 60_000;

export function availableKeyCount(): number {
  return keys.filter((k) => Date.now() >= k.cooldownUntil).length;
}

function nextKey(): KeyState | null {
  const now = Date.now();
  const ready = keys.filter((k) => now >= k.cooldownUntil);
  return ready[0] ?? null;
}

const SYSTEM_PROMPT = `You are a web-automation recovery brain for an anime download resolver.
You receive a situation description, the current URL, page title, and an HTML snippet.
Decide the single best next action to reach the goal.

Respond with ONLY a JSON object (no markdown, no code fences):
{
  "action": "click" | "navigate" | "wait" | "extract" | "give_up",
  "selector": "css selector (for click/extract)",
  "url": "target url (for navigate)",
  "waitMs": number (for wait),
  "extracted": "value (for extract)",
  "reason": "short explanation"
}

Rules:
- Prefer "click" on real content links/buttons; avoid anything that looks like an ad, popup, or overlay.
- If the page looks like an ad redirect or unrelated site, use "navigate" back to a known good URL if provided, or "give_up".
- If a selector is missing from the snippet, try "extract" with a best-guess selector or "give_up".
- Keep it minimal and safe. Never invent URLs not grounded in the snippet except navigating back.`;

export async function askBrain(query: BrainQuery): Promise<BrainAnswer | null> {
  const keyState = nextKey();
  if (!keyState) return null;

  const userPrompt = [
    `SITUATION: ${query.situation}`,
    `GOAL: ${query.goal}`,
    `URL: ${query.url}`,
    `TITLE: ${query.title}`,
    `HTML SNIPPET:\n${query.htmlSnippet.slice(0, 4000)}`,
  ].join('\n\n');

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${keyState.key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.1,
        max_tokens: 300,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (res.status === 429 || res.status === 401 || res.status === 403) {
      keyState.cooldownUntil = Date.now() + COOLDOWN_MS;
      return null;
    }
    if (!res.ok) return null;

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as BrainAnswer;
    if (!parsed.action) return null;
    return parsed;
  } catch {
    return null;
  }
}
