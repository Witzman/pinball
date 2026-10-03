import type { FlowConfig } from "./flow";
import type { TableRules } from "./types";

/** What a table brings to a game besides its geometry. */
export interface TableSetup {
  /** The table's rules; plain rules (free play when there is no flow) if absent. */
  rules?: TableRules;
  /** Run it as a game: credits, balls per game, game over. No flow = no game, a ball on the plunger from the start. */
  flow?: FlowConfig;
}
