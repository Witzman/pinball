import type { TableDef } from "../table/schema";
import { demoTable } from "./demo";

/** Every table that ships; the validation test runs over this list. */
export const allTables: TableDef[] = [demoTable];
