import type { TableRules } from "../rules";
import { demoFlow } from "./demo-rules";

/** Placeholder: the numbers of the proving ground until the scoring scale (#46) is worked out. */
export const colonyFlow = { ...demoFlow };

/** No scoring yet: the rules of The Colony come with #26 to #41. */
export const colonyRules: TableRules = {
  modes: {},
  onSwitch() {},
  bonus: () => 0,
};
