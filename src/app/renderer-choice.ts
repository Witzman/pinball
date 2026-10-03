export type RendererName = "playcanvas" | "canvas";

/**
 * Which renderer to draw with (#45): the 3D PlayCanvas table by default, the plain canvas placeholder
 * with `?renderer=canvas` or when the browser has no WebGL. `webgl` says whether it has.
 */
export function chooseRenderer(search: string, webgl: boolean): RendererName {
  const asked = new URLSearchParams(search).get("renderer");
  if (asked === "canvas") return "canvas";
  return webgl ? "playcanvas" : "canvas";
}
