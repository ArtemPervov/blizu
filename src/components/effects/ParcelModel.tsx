import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  CanvasTexture,
  ExtrudeGeometry,
  Shape,
  SRGBColorSpace,
  type Group,
  type Mesh,
} from "three";
import type { MotionRef } from "./motion";

function makeCarton() {
  const shape = new Shape();
  const w = 0.8,
    h = 0.63,
    r = 0.07;
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);
  const geometry = new ExtrudeGeometry(shape, {
    depth: 1.25,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.025,
    bevelThickness: 0.025,
    curveSegments: 8,
  });
  geometry.translate(0, 0, -0.625);
  return geometry;
}

function ShippingLabel() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 160;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#fffdf2";
    context.fillRect(0, 0, 256, 160);
    context.fillStyle = "#53664e";
    context.font = "bold 38px sans-serif";
    context.fillText("blizu.", 20, 49);
    context.fillStyle = "#c46b45";
    context.font = "17px sans-serif";
    context.fillText("RU / EU / CN  →  ME", 20, 78);
    context.fillStyle = "#64725b";
    let x = 20;
    for (let i = 0; i < 43; i++) {
      const w = i % 3 === 0 ? 4 : 2;
      context.fillRect(x, 96, w, 35);
      x += w + 2;
    }
    const result = new CanvasTexture(canvas);
    result.colorSpace = SRGBColorSpace;
    return result;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={[0.34, -0.1, 0.654]}>
      <planeGeometry args={[0.65, 0.4]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

function Orbit({
  motion,
  radius,
  tilt,
  phase,
  color,
  coarse,
}: {
  motion: MotionRef;
  radius: number;
  tilt: [number, number, number];
  phase: number;
  color: string;
  coarse: boolean;
}) {
  const bead = useRef<Mesh>(null);
  useFrame(() => {
    if (!bead.current) return;
    const angle = motion.current.time * 0.28 + phase;
    bead.current.position.set(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      0,
    );
  });
  return (
    <group rotation={tilt} scale={[1, 0.69, 1]}>
      <mesh>
        <torusGeometry args={[radius, 0.006, 4, coarse ? 64 : 96]} />
        <meshBasicMaterial color={color} transparent opacity={0.38} />
      </mesh>
      <mesh ref={bead}>
        <sphereGeometry args={[0.065, 12, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.25}
          roughness={0.4}
        />
      </mesh>
    </group>
  );
}

export function ParcelModel({
  motion,
  coarse,
  compact,
  reduced,
}: {
  motion: MotionRef;
  coarse: boolean;
  compact: boolean;
  reduced: boolean;
}) {
  const carton = useRef<Group>(null),
    world = useRef<Group>(null);
  const geometry = useMemo(makeCarton, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    const m = motion.current;
    if (carton.current) {
      carton.current.position.y = reduced
        ? 0.06
        : Math.sin(m.time * 1.05) * 0.105;
      carton.current.rotation.set(
        0.18 + m.y * 0.13,
        -0.43 + Math.sin(m.time * 0.36) * 0.14 + m.x * 0.32,
        -0.08 + m.x * 0.045,
      );
    }
    if (world.current) world.current.rotation.z = m.x * 0.025;
  });
  return (
    <>
      <ambientLight intensity={2.2} />
      <directionalLight position={[3, 5, 5]} intensity={3} color="#fff1d6" />
      <directionalLight position={[-3, 0, 2]} intensity={1.1} color="#bcd4c0" />
      <group ref={world} scale={compact ? 1.03 : 1.1}>
        <Orbit
          motion={motion}
          radius={2.02}
          tilt={[0.35, 0.3, -0.35]}
          phase={0}
          color="#dba46a"
          coarse={coarse}
        />
        <Orbit
          motion={motion}
          radius={2.12}
          tilt={[-0.7, -0.2, 0.5]}
          phase={2.3}
          color="#93af8a"
          coarse={coarse}
        />
        {!coarse && (
          <Orbit
            motion={motion}
            radius={1.93}
            tilt={[0.9, -0.3, -0.9]}
            phase={4.4}
            color="#cc8d70"
            coarse={coarse}
          />
        )}
        <group ref={carton} scale={1.28}>
          <mesh geometry={geometry}>
            <meshStandardMaterial color="#cda577" roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.644, 0]}>
            <boxGeometry args={[1.61, 0.025, 1.29]} />
            <meshStandardMaterial color="#e5c798" roughness={0.8} />
          </mesh>
          <mesh>
            <boxGeometry args={[0.27, 1.34, 1.32]} />
            <meshStandardMaterial color="#ecdbb3" roughness={0.95} />
          </mesh>
          <mesh position={[-0.37, 0.37, 0.656]}>
            <planeGeometry args={[0.42, 0.11]} />
            <meshBasicMaterial color="#dfbd8e" />
          </mesh>
          <ShippingLabel />
        </group>
        <mesh position={[0, -1.28, -0.9]} scale={[3, 0.7, 1]}>
          <planeGeometry />
          <shaderMaterial
            transparent
            depthWrite={false}
            vertexShader={`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`}
            fragmentShader={`varying vec2 vUv;void main(){float d=length((vUv-.5)*2.);gl_FragColor=vec4(.3,.4,.27,exp(-d*d*4.)*.12);}`}
          />
        </mesh>
      </group>
    </>
  );
}
