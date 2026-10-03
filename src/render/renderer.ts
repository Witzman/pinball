import type { Snapshot, StaticScene } from "../sim/snapshot";

/**
 * What the app needs of a renderer (#21). `draw` is a pure function of the scene, the
 * snapshot and the size: it reads, never writes back, and uses no clock but `snap.tick`.
 * The Canvas 2D placeholder is the first implementation; a WebGL one (#45) must pass the
 * same conformance test.
 */
export interface Renderer {
  /** Size in CSS pixels and the device pixel ratio; call on start and on every resize. */
  resize(cssW: number, cssH: number, dpr: number): void;
  /** Once per table: a renderer may bake layers here. */
  setScene(scene: StaticScene): void;
  draw(snap: Readonly<Snapshot>): void;
  dispose(): void;
}
