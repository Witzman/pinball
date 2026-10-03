import { serialize } from "./serialize";
import type { RulesState } from "./types";

/** FNV-1a over the stable text of the state: equal states, equal hash, whatever the key order. For checks and replays, not per tick. */
export function hashRules(s: RulesState): number {
  const text = serialize(s);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
}
