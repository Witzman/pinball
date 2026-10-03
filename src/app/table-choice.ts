import type { FlowConfig, TableSetup } from "../rules";
import type { TableDef } from "../table/schema";
import { allTables, tableSetups } from "../tables";

export interface Choice {
  def: TableDef;
  setup: TableSetup;
  flow: FlowConfig;
}

/** The table to play: `?table=<id>` in the address, the demo table by default and for an id nobody knows. */
export function chooseTable(search: string): Choice {
  const id = new URLSearchParams(search).get("table") ?? "demo";
  const def = allTables.find((t) => t.id === id) ?? allTables.find((t) => t.id === "demo")!;
  const setup = tableSetups[def.id]!;
  return { def, setup, flow: setup.flow! };
}
