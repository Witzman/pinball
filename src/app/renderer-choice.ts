export type RendererName = "playcanvas" | "canvas";

/**
 * Which renderer to draw with (#45): the 3D PlayCanvas table, or the plain canvas placeholder when
 * the browser has no WebGL (`webgl` says whether it has). No address parameter changes it.
 */
export function chooseRenderer(webgl: boolean): RendererName {
  return webgl ? "playcanvas" : "canvas";
}
