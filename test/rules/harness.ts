import { createRules } from "../../src/rules";
import type { Command, Rules, RulesEvent, RulesOptions, TableRules } from "../../src/rules";

type Kind = Extract<RulesEvent, { t: "switch" }>["kind"];

/**
 * Drives the rules without physics: schedule events by tick, run, assert on the
 * commands and the state.
 *
 *   const h = harness(table, { shots: { ramp: ["enter", "exit"] } });
 *   h.at(100).hit("enter").at(150).hit("exit").run(400);
 *   expect(h.cmds).toContainEqual({ c: "setLamp", lamp: "ramp", state: "lit" });
 */
export function harness(table: TableRules, opts: Partial<RulesOptions> = {}) {
  const rules: Rules = createRules(table, { seed: 1, ...opts });
  const pending = new Map<number, RulesEvent[]>();
  const cmds: Command[] = [];
  let cursor = 0;
  let next = 0; // next tick to run

  const push = (e: RulesEvent) => {
    if (e.tick < next) throw new Error(`event at tick ${e.tick} is in the past (next tick is ${next})`);
    const list = pending.get(e.tick) ?? [];
    list.push(e);
    pending.set(e.tick, list);
  };

  const h = {
    rules,
    state: rules.state,
    cmds,
    at(tick: number) {
      cursor = tick;
      return h;
    },
    hit(sw: string, ball = 0, kind: Kind = "hit", impulse = 1) {
      push({ t: "switch", tick: cursor, ball, sw, kind, impulse });
      return h;
    },
    button(button: "left" | "right" | "plunge" | "coin" | "start" | "buyin", down: boolean) {
      push({ t: "button", tick: cursor, button, down });
      return h;
    },
    drain(ball = 0) {
      push({ t: "drain", tick: cursor, ball });
      return h;
    },
    ballAtPlunger() {
      push({ t: "ballAtPlunger", tick: cursor });
      return h;
    },
    /** Runs every tick up to and including `last`. */
    run(last: number) {
      for (; next <= last; next++) rules.step(next, pending.get(next) ?? [], cmds);
      return h;
    },
    /** Takes the commands so far and clears the list. */
    take(): Command[] {
      return cmds.splice(0);
    },
  };
  return h;
}
