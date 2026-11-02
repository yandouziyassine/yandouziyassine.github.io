// Can this browser draw the football replay's 3D view? three.js (r163+) needs WebGL 2. Asked once the replay data is
// ready, not on page load; the test context is released at once.
type CanvasLike = { getContext(id: string): unknown };
type GL = { getExtension?(name: string): { loseContext?(): void } | null };

export function hasWebGL(make: () => CanvasLike = () => document.createElement("canvas")): boolean {
  try {
    const gl = make().getContext("webgl2") as GL | null;
    if (!gl) return false;
    gl.getExtension?.("WEBGL_lose_context")?.loseContext?.();
    return true;
  } catch {
    return false;
  }
}
