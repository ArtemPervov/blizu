let supported: boolean | undefined;

export function supportsWebGL() {
  if (supported !== undefined) return supported;
  try {
    const canvas = document.createElement("canvas");
    // Three.js r180 requires WebGL 2; a WebGL 1 probe is a false positive.
    const context = canvas.getContext("webgl2");
    supported = Boolean(context);
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    supported = false;
  }
  return supported;
}
