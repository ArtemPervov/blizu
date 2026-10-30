import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Component,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supportsWebGL } from "./effects/webgl";
import type { ShaderMaterial } from "three";

type LetterCloud = {
  positions: Float32Array;
  colors: Float32Array;
  seeds: Float32Array;
  alphas: Float32Array;
  width: number;
  height: number;
};
type Phase = "pending" | "assembling" | "revealing" | "settled";
const paddingX = 24,
  paddingY = 38;

function sampleLetters(
  element: HTMLHeadingElement,
  lines: [string, string],
): LetterCloud {
  const style = getComputedStyle(element);
  const accent = getComputedStyle(element.querySelector("span")!).color;
  const width = Math.ceil(element.getBoundingClientRect().width);
  const fontSize = parseFloat(style.fontSize);
  const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.12;
  const height = Math.ceil(element.getBoundingClientRect().height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
  ctx.letterSpacing = style.letterSpacing;
  ctx.fontKerning = "normal";
  const metrics = ctx.measureText(lines[0]);
  const ascent = metrics.fontBoundingBoxAscent || fontSize * 0.83;
  const descent = metrics.fontBoundingBoxDescent || fontSize * 0.2;
  // Measure the actual CSS baseline so the GPU letters land on the native text.
  const probe = document.createElement("span");
  probe.style.cssText =
    "display:inline-block;width:0;height:0;padding:0;margin:0;border:0;vertical-align:baseline";
  element.prepend(probe);
  const measuredBaseline =
    probe.getBoundingClientRect().top - element.getBoundingClientRect().top;
  probe.remove();
  const baseline =
    measuredBaseline || (lineHeight - ascent - descent) / 2 + ascent;
  let row = 0;
  const drawWrapped = (text: string, color: string) => {
    const rows: string[] = [];
    let line = "";
    for (const word of text.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > width) {
        rows.push(line);
        line = word;
      } else line = candidate;
    }
    if (line) rows.push(line);
    ctx.fillStyle = color;
    for (const content of rows)
      ctx.fillText(content, 0, baseline + row++ * lineHeight);
  };
  drawWrapped(lines[0], style.color);
  drawWrapped(lines[1], accent);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const positions: number[] = [],
    colors: number[] = [],
    seeds: number[] = [],
    alphas: number[] = [];
  let seed = 9143;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const totalWidth = width + paddingX * 2,
    totalHeight = height + paddingY * 2;
  for (let y = 0; y < height; y += 2)
    for (let x = 0; x < width; x += 2) {
      const pixel = (y * width + x) * 4;
      if (pixels[pixel + 3] < 75) continue;
      positions.push(
        x + paddingX - totalWidth / 2,
        totalHeight / 2 - y - paddingY,
        0,
      );
      colors.push(
        pixels[pixel] / 255,
        pixels[pixel + 1] / 255,
        pixels[pixel + 2] / 255,
      );
      seeds.push(random());
      alphas.push(pixels[pixel + 3] / 255);
    }
  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    seeds: new Float32Array(seeds),
    alphas: new Float32Array(alphas),
    width: totalWidth,
    height: totalHeight,
  };
}

function LetterVortex({
  cloud,
  onReveal,
  onDone,
  onStarted,
}: {
  cloud: LetterCloud;
  onReveal: () => void;
  onDone: () => void;
  onStarted: () => void;
}) {
  const elapsed = useRef(0),
    revealed = useRef(false),
    done = useRef(false),
    started = useRef(false);
  const dpr = useThree((state) => state.viewport.dpr);
  const material = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uWidth: { value: cloud.width },
      uHeight: { value: cloud.height },
      uDpr: { value: dpr },
    }),
    [cloud, dpr],
  );
  useFrame((_, delta) => {
    if (!started.current) {
      started.current = true;
      onStarted();
    }
    elapsed.current += Math.min(delta, 0.05);
    if (material.current)
      material.current.uniforms.uTime.value = elapsed.current;
    if (elapsed.current >= 3.95 && !revealed.current) {
      revealed.current = true;
      onReveal();
    }
    if (elapsed.current >= 4.65 && !done.current) {
      done.current = true;
      onDone();
    }
  });
  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[cloud.positions, 3]}
        />
        <bufferAttribute attach="attributes-aColor" args={[cloud.colors, 3]} />
        <bufferAttribute attach="attributes-aSeed" args={[cloud.seeds, 1]} />
        <bufferAttribute attach="attributes-aAlpha" args={[cloud.alphas, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={material}
        transparent
        depthWrite={false}
        toneMapped={false}
        uniforms={uniforms}
        vertexShader={`
        attribute vec3 aColor; attribute float aSeed; attribute float aAlpha;
        uniform float uTime; uniform float uWidth; uniform float uHeight; uniform float uDpr;
        varying vec3 vColor; varying float vAlpha;
        void main(){
          float p=clamp((uTime-aSeed*.5)/3.35,0.,1.);
          float arrival=p*p*(3.-2.*p);
          float remaining=1.-arrival;
          float angle=aSeed*25.1327+uTime*4.1+remaining*3.;
          float radius=.45+aSeed*.6;
          vec3 orbit=vec3(cos(angle)*uWidth*.62*radius-uWidth*.08,sin(angle)*(uHeight-76.)*.46*radius,sin(angle*1.3)*24.);
          vec3 point=mix(orbit,position,arrival);
          point.xy+=vec2(sin(aSeed*31.+uTime),cos(aSeed*23.-uTime))*.7*remaining;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(point,1.);
          gl_PointSize=(2.15+aSeed*.45)*uDpr;
          vColor=mix(mix(aColor,vec3(.72,.43,.28),.25),aColor,arrival);
          vAlpha=aAlpha*(.4+.6*arrival)*smoothstep(0.,.32,uTime)*(1.-smoothstep(4.02,4.62,uTime));
        }
      `}
        fragmentShader={`varying vec3 vColor;varying float vAlpha;void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(vColor,(1.-smoothstep(.27,.5,d))*vAlpha);}`}
      />
    </points>
  );
}

class HeadingBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function ParticleHeading({
  first,
  second,
}: {
  first: string;
  second: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const startup = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cloud, setCloud] = useState<LetterCloud | null>(null);
  const [phase, setPhase] = useState<Phase>("pending");
  const [visible, setVisible] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [epoch, setEpoch] = useState(0);
  const motionAllowed = useRef(false);
  const finish = () => {
    if (startup.current) clearTimeout(startup.current);
    setPhase("settled");
  };

  useLayoutEffect(() => {
    const element = heading.current;
    if (!element) return;
    let cancelled = false;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const preference = () => {
      motionAllowed.current = !media.matches;
      if (media.matches) finish();
    };
    preference();
    media.addEventListener("change", preference);
    if (!motionAllowed.current || !supportsWebGL()) {
      finish();
      return () => media.removeEventListener("change", preference);
    }
    setPhase("pending");
    setCloud(null);
    startup.current = setTimeout(() => {
      cancelled = true;
      finish();
    }, 3500);
    const style = getComputedStyle(element);
    document.fonts
      .load(
        `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
        first + second,
      )
      .then(() => {
        if (cancelled || !motionAllowed.current) return;
        const sampled = sampleLetters(element, [first, second]);
        if (sampled.seeds.length < 10) {
          finish();
          return;
        }
        setCloud(sampled);
        setEpoch((value) => value + 1);
        setPhase("assembling");
      })
      .catch(finish);
    const initialWidth = element.getBoundingClientRect().width;
    const resize = new ResizeObserver(() => {
      if (Math.abs(element.getBoundingClientRect().width - initialWidth) > 8) {
        cancelled = true;
        setCloud(null);
        finish();
      }
    });
    resize.observe(element);
    return () => {
      cancelled = true;
      resize.disconnect();
      media.removeEventListener("change", preference);
      if (startup.current) clearTimeout(startup.current);
    };
  }, [first, second]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.1 },
    );
    if (wrapper.current) observer.observe(wrapper.current);
    const visibility = () =>
      setPageVisible(document.visibilityState === "visible");
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  return (
    <div
      ref={wrapper}
      className="particle-heading"
      data-phase={phase}
      onPointerDown={() => {
        if (phase === "settled" && cloud && motionAllowed.current) {
          setEpoch((value) => value + 1);
          setPhase("assembling");
          startup.current = setTimeout(finish, 3500);
        }
      }}
    >
      <h1 ref={heading}>
        {first}
        <br />
        <span>{second}</span>
      </h1>
      {cloud && phase !== "settled" && (
        <div className="heading-particle-scene" aria-hidden="true">
          <HeadingBoundary key={epoch} onError={finish}>
            <Canvas
              key={epoch}
              orthographic
              camera={{ position: [0, 0, 100], zoom: 1, near: 0.1, far: 1000 }}
              dpr={[1, 1.5]}
              gl={{
                alpha: true,
                antialias: false,
                powerPreference: "low-power",
              }}
              frameloop={visible && pageVisible ? "always" : "demand"}
            >
              <LetterVortex
                cloud={cloud}
                onReveal={() => setPhase("revealing")}
                onDone={finish}
                onStarted={() => {
                  if (startup.current) clearTimeout(startup.current);
                  startup.current = setTimeout(finish, 10000);
                }}
              />
            </Canvas>
          </HeadingBoundary>
        </div>
      )}
    </div>
  );
}
