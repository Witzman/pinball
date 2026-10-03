import type { TableSetup } from "../rules";
import type { TableDef } from "../table/schema";
import { colonyTable } from "./colony";
import { demoTable } from "./demo";
import { colonyFlow, colonyRules } from "./colony-rules";
import { demoFlow, demoRules } from "./demo-rules";

/** Every table that ships; the validation test runs over this list. */
export const allTables: TableDef[] = [demoTable, colonyTable];

/** The rules and flow each shipping table runs with, by table id. */
export const tableSetups: Record<string, TableSetup> = {
  demo: { rules: demoRules, flow: demoFlow },
  colony: { rules: colonyRules, flow: colonyFlow },
};
