import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  AdditiveBlending,
  Color,
  CubicBezierCurve3,
  Vector2,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
} from "three";
import type { MotionRef } from "./motion";

const planeVertex = `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

function SeaLight({ motion }: { motion: MotionRef }) {
  const { width, height } = useThree((state) => state.viewport);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPointer: { value: new Vector2() },
      uHover: { value: 0 },
    }),
    [],
  );
  useFrame(() => {
    const m = motion.current;
    uniforms.uTime.value = m.time;
    uniforms.uPointer.value.set(m.x, m.y);
    uniforms.uHover.value = m.hover;
  });
  return (
    <mesh position={[0, 0.25, -1.5]} scale={[width * 1.5, height * 1.4, 1]}>
      <planeGeometry />
      <shaderMaterial
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
        vertexShader={planeVertex}
        fragmentShader={`
        varying vec2 vUv; uniform float uTime; uniform vec2 uPointer; uniform float uHover;
        void main(){
          vec2 uv=vUv; float t=uTime*.13;
          float sea=sin(uv.x*7.+t)*.055+sin(uv.x*13.-t*.6)*.018;
          float ribbonDist=(uv.y-.55-sea)/.038;
          float ribbon=exp(-ribbonDist*ribbonDist);
          float contour=pow(.5+.5*sin((uv.y-sea)*95.+uv.x*4.+t),17.);
          float bandDist=(uv.y-.54-sea)/.22;
          float band=exp(-bandDist*bandDist);
          vec2 cursor=uPointer*.5+.5;
          float glow=exp(-dot(uv-cursor,uv-cursor)*14.)*uHover;
          float edges=smoothstep(0.,.17,uv.x)*(1.-smoothstep(.8,1.,uv.x));
          float alpha=(ribbon*.08+contour*band*.055+glow*.055)*edges;
          gl_FragColor=vec4(mix(vec3(.67,.87,.78),vec3(1.,.84,.56),uv.x),alpha);
        }`}
      />
    </mesh>
  );
}

function DriftingParticles({
  motion,
  coarse,
}: {
  motion: MotionRef;
  coarse: boolean;
}) {
  const { width, height } = useThree((state) => state.viewport);
  const data = useMemo(() => {
    const count = coarse ? 200 : 520;
    const positions = new Float32Array(count * 3),
      sizes = new Float32Array(count),
      seeds = new Float32Array(count);
    let seed = 7643;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (random() - 0.5) * width * 1.25;
      positions[i * 3 + 1] = (random() - 0.5) * height * 1.15;
      positions[i * 3 + 2] = (random() - 0.5) * 3;
      sizes[i] = 0.9 + Math.pow(random(), 3) * 5;
      seeds[i] = random();
    }
    return { positions, sizes, seeds };
  }, [coarse, width, height]);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPointer: { value: new Vector2() },
      uHover: { value: 0 },
    }),
    [],
  );
  useFrame(() => {
    const m = motion.current;
    uniforms.uTime.value = m.time;
    uniforms.uPointer.value.set((m.x * width) / 2, (m.y * height) / 2);
    uniforms.uHover.value = m.hover;
  });
  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[data.positions, 3]}
        />
        <bufferAttribute attach="attributes-aSize" args={[data.sizes, 1]} />
        <bufferAttribute attach="attributes-aSeed" args={[data.seeds, 1]} />
      </bufferGeometry>
      <shaderMaterial
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
        vertexShader={`
        attribute float aSize; attribute float aSeed;
        uniform float uTime; uniform vec2 uPointer; uniform float uHover;
        varying float vAlpha; varying float vSeed;
        void main(){
          vec3 p=position; float t=uTime*.18;
          p.x+=sin(t+position.y+aSeed*6.)*.22;
          p.y+=cos(t*.8+position.x*.6+aSeed*8.)*.18;
          vec2 away=p.xy-uPointer; float proximity=exp(-dot(away,away)*1.5)*uHover;
          p.xy+=normalize(away+vec2(.001))*proximity*.24;
          vec4 mv=modelViewMatrix*vec4(p,1.);
          gl_Position=projectionMatrix*mv;
          gl_PointSize=clamp(aSize*(6.5/-mv.z),1.,9.);
          vAlpha=.2+.5*pow(.5+.5*sin(uTime*.7+aSeed*40.),2.)+proximity*.3;
          vSeed=aSeed;
        }`}
        fragmentShader={`
        varying float vAlpha; varying float vSeed;
        void main(){
          float r=length(gl_PointCoord-.5);
          float halo=exp(-r*r*14.);float core=1.-smoothstep(.06,.2,r);
          vec3 color=mix(vec3(.77,.93,.84),vec3(1.,.83,.56),step(.45,vSeed));
          gl_FragColor=vec4(color,(halo*.3+core*.65)*vAlpha);
        }`}
      />
    </points>
  );
}

function LightRoute({
  motion,
  curve,
  phase,
  tint,
}: {
  motion: MotionRef;
  curve: CubicBezierCurve3;
  phase: number;
  tint: string;
}) {
  const bead = useRef<Mesh>(null),
    halo = useRef<Mesh>(null);
  const end = useMemo(() => curve.getPoint(1), [curve]);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPhase: { value: phase },
      uColor: { value: new Color(tint) },
    }),
    [phase, tint],
  );
  useFrame(() => {
    const t = motion.current.time;
    uniforms.uTime.value = t;
    if (bead.current)
      curve.getPointAt((t * 0.055 + phase) % 1, bead.current.position);
    if (halo.current)
      halo.current.scale.setScalar(1 + Math.sin(t * 1.2 + phase * 7) * 0.15);
  });
  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 64, 0.0055, 4, false]} />
        <shaderMaterial
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
          vertexShader={planeVertex}
          fragmentShader={`varying vec2 vUv;uniform float uTime;uniform float uPhase;uniform vec3 uColor;void main(){float d=abs(fract(vUv.x-uTime*.055-uPhase+.5)-.5);float head=exp(-pow(d/.065,2.));float dash=.55+.45*sin(vUv.x*140.);gl_FragColor=vec4(uColor,.13*dash+head*.65);}`}
        />
      </mesh>
      <mesh ref={bead}>
        <sphereGeometry args={[0.032, 8, 8]} />
        <meshBasicMaterial color={tint} toneMapped={false} />
      </mesh>
      <mesh position={end}>
        <sphereGeometry args={[0.026, 8, 8]} />
        <meshBasicMaterial
          color={tint}
          transparent
          opacity={0.8}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={halo} position={end}>
        <ringGeometry args={[0.075, 0.083, 32]} />
        <meshBasicMaterial
          color={tint}
          transparent
          opacity={0.45}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function ClickRipple({
  motion,
  reduced,
}: {
  motion: MotionRef;
  reduced: boolean;
}) {
  const ref = useRef<Mesh>(null),
    lastPress = useRef(0),
    started = useRef(-10);
  const { width, height } = useThree((state) => state.viewport);
  useFrame(() => {
    if (!ref.current) return;
    const m = motion.current;
    if (m.press !== lastPress.current && !reduced) {
      lastPress.current = m.press;
      started.current = m.time;
      ref.current.position.set(
        (m.pressX * width) / 2,
        (m.pressY * height) / 2,
        0,
      );
    }
    const age = m.time - started.current;
    ref.current.visible = !reduced && age < 1.8;
    if (ref.current.visible) {
      ref.current.scale.setScalar(0.1 + age * 1.45);
      (ref.current.material as MeshBasicMaterial).opacity =
        (1 - age / 1.8) * 0.48;
    }
  });
  return (
    <mesh ref={ref} visible={false}>
      <ringGeometry args={[0.49, 0.5, 80]} />
      <meshBasicMaterial
        color="#ffe3b5"
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

export function CoastEffects({
  motion,
  coarse,
  reduced,
}: {
  motion: MotionRef;
  coarse: boolean;
  reduced: boolean;
}) {
  const group = useRef<Group>(null);
  const { width, height } = useThree((state) => state.viewport);
  const curves = useMemo(
    () => [
      new CubicBezierCurve3(
        new Vector3(-3.4, -0.15, 0),
        new Vector3(-1.6, 1.6, 0.2),
        new Vector3(0.6, -1.15, -0.2),
        new Vector3(3.15, 0.5, 0),
      ),
      new CubicBezierCurve3(
        new Vector3(-2.9, 0.95, -0.3),
        new Vector3(-0.9, 1.7, 0.1),
        new Vector3(0.9, 1.1, -0.1),
        new Vector3(2.6, -0.35, -0.2),
      ),
      new CubicBezierCurve3(
        new Vector3(-3.2, -0.7, -0.2),
        new Vector3(-1.2, -0.85, 0.2),
        new Vector3(1.4, 0.45, 0.3),
        new Vector3(3.35, 1.1, -0.1),
      ),
    ],
    [],
  );
  useFrame(() => {
    if (!group.current) return;
    const m = motion.current;
    group.current.rotation.set(-m.y * 0.025, m.x * 0.045, 0);
    group.current.position.set(m.x * 0.045, m.y * 0.035 + m.scroll * 0.07, 0);
  });
  return (
    <>
      <SeaLight motion={motion} />
      <group ref={group}>
        <DriftingParticles motion={motion} coarse={coarse} />
        <group scale={[width / 8, height / 5, 1]} position={[0, 0.25, 0]}>
          {curves.slice(0, coarse ? 2 : 3).map((curve, i) => (
            <LightRoute
              key={i}
              motion={motion}
              curve={curve}
              phase={i * 0.29}
              tint={i === 1 ? "#d2ecd8" : "#f4d5a1"}
            />
          ))}
        </group>
      </group>
      <ClickRipple motion={motion} reduced={reduced} />
    </>
  );
}
