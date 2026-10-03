import type { TableSetup } from "../rules";
import type { TableDef } from "../table/schema";
import { demoTable } from "./demo";
import { demoFlow, demoRules } from "./demo-rules";

/** Every table that ships; the validation test runs over this list. */
export const allTables: TableDef[] = [demoTable];

/** The rules and flow each shipping table runs with, by table id. */
export const tableSetups: Record<string, TableSetup> = {
  demo: { rules: demoRules, flow: demoFlow },
};
