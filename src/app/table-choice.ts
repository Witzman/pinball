import type { FlowConfig, TableSetup } from "../rules";
import type { TableDef } from "../table/schema";
import { allTables, tableSetups } from "../tables";

export interface Choice {
  def: TableDef;
  setup: TableSetup;
  flow: FlowConfig;
}

/** The table the page plays: The Colony. The demo table stays in the tables list as the test table; no address parameter chooses another. */
export function chooseTable(): Choice {
  const def = allTables.find((t) => t.id === "colony")!;
  const setup = tableSetups[def.id]!;
  return { def, setup, flow: setup.flow! };
}
