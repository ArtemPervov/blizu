import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Color, ShaderMaterial } from "three";

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;
const fragmentShader = `
varying vec2 vUv;
uniform float uTime;
uniform float uAspect;
uniform vec3 uPetrol;
uniform vec3 uSand;
uniform vec3 uPearl;
void main() {
  vec2 p = (vUv - .5) * vec2(uAspect, 1.0);
  float t = uTime * .16;
  float threads = 0.0;
  float glow = 0.0;
  // A small family of continuous, gently bending caustics, without particles.
  for (int i = 0; i < 7; i++) {
    float f = float(i);
    float curve = .12 * sin(p.x * 1.7 + t + f * .16)
                + .025 * sin(p.x * 3.8 - t * .6 + f * .32)
                - .13 + f * .043;
    float d = abs(p.y - curve);
    float softness = max(fwidth(p.y) * 1.25, .0028);
    threads += exp(-pow(d / softness, 2.0)) * .42;
    glow += exp(-d * 38.0) * .045;
  }
  float edge = smoothstep(0.0, .14, vUv.x) * smoothstep(0.0, .14, 1.0 - vUv.x);
  float vertical = smoothstep(0.0, .18, vUv.y) * smoothstep(0.0, .22, 1.0 - vUv.y);
  float quietCenter = .1 + .9 * smoothstep(.12, .35, abs(vUv.x - .5));
  float span = p.x / max(uAspect * .47, .6);
  float reach = exp(-(span * span * span * span));
  float alpha = clamp((threads + glow) * edge * vertical * quietCenter * reach, 0.0, .5);
  vec3 tint = mix(uPetrol, uSand, .5 + .5 * sin(p.x * .8 + t * .3));
  vec3 color = mix(tint, uPearl, .12);
  gl_FragColor = vec4(color, alpha);
  #include <colorspace_fragment>
}`;

function LightSurface({ active }: { active: boolean }) {
  const { size, invalidate } = useThree();
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
        uniforms: {
          uTime: { value: 0 },
          uAspect: { value: 1 },
          uPetrol: { value: new Color("#326f75") },
          uSand: { value: new Color("#b6996d") },
          uPearl: { value: new Color("#e8eee4") },
        },
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    material.uniforms.uAspect.value = size.width / Math.max(size.height, 1);
    invalidate();
  }, [size.width, size.height, material, invalidate]);
  useFrame((_, delta) => {
    if (active) material.uniforms.uTime.value += Math.min(delta, 0.06);
  });
  useEffect(() => {
    if (!active) return;
    let timer: number;
    const next = () => {
      invalidate();
      timer = window.setTimeout(next, 1000 / 24);
    };
    next();
    return () => window.clearTimeout(timer);
  }, [active, invalidate]);
  return (
    <mesh material={material} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

export default function AdriaticLightScene({
  active,
  onReady,
}: {
  active: boolean;
  onReady: () => void;
}) {
  return (
    <Canvas
      className="adriatic-light-canvas"
      dpr={1}
      frameloop="demand"
      gl={{ alpha: true, antialias: false, powerPreference: "low-power" }}
      camera={{ position: [0, 0, 1] }}
      style={{ pointerEvents: "none" }}
      onCreated={onReady}
    >
      <LightSurface active={active} />
    </Canvas>
  );
}
