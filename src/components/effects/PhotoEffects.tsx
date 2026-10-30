import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { MathUtils, SRGBColorSpace, TextureLoader, Vector2 } from "three";
import type { ShaderMaterial } from "three";
import type { MotionRef } from "./motion";

// The HTML photo remains underneath as a loading and no-WebGL fallback.
// Only the hovered/focused card mounts this renderer.
export function PhotoEffects({
  motion,
  imageUrl,
  reduced,
  mood = "card",
}: {
  motion: MotionRef;
  imageUrl: string;
  reduced: boolean;
  mood?: "card" | "coast";
}) {
  const texture = useLoader(TextureLoader, imageUrl);
  texture.colorSpace = SRGBColorSpace;
  const { width, height, aspect } = useThree((state) => state.viewport);
  const reveal = useRef(0);
  const material = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(() => {
    const image = texture.image as { width: number; height: number };
    const imageAspect = image.width / image.height;
    return {
      uPhoto: { value: texture },
      uCover: {
        value: new Vector2(
          Math.min(aspect / imageAspect, 1),
          Math.min(imageAspect / aspect, 1),
        ),
      },
      uPointer: { value: new Vector2() },
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uMotion: { value: reduced ? 0 : 1 },
      uAspect: { value: aspect },
      uCoast: { value: mood === "coast" ? 1 : 0 },
    };
  }, [texture, aspect, reduced, mood]);
  useFrame((_, delta) => {
    const m = motion.current;
    reveal.current = reduced
      ? 1
      : MathUtils.damp(reveal.current, 1, 5, Math.min(delta, 0.05));
    if (!material.current) return;
    const live = material.current.uniforms;
    live.uReveal.value = reveal.current;
    live.uTime.value = m.time;
    live.uPointer.value.set(m.x, m.y);
  });
  return (
    <mesh scale={[width, height, 1]}>
      <planeGeometry args={[1, 1, 24, 18]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        toneMapped={false}
        vertexShader={`
        varying vec2 vUv;
        uniform vec2 uPointer; uniform float uMotion;
        void main(){
          vUv=uv; vec3 p=position;
          p.z+=sin(uv.x*3.14159)*sin(uv.y*3.14159)*.07*length(uPointer)*uMotion;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
        }
      `}
        fragmentShader={`
        varying vec2 vUv;
        uniform sampler2D uPhoto;
        uniform vec2 uCover; uniform vec2 uPointer;
        uniform float uTime; uniform float uReveal; uniform float uMotion; uniform float uAspect;
        uniform float uCoast;
        void main(){
          vec2 uv=vUv;
          vec2 cursor=uPointer*.5+.5;
          vec2 delta=(uv-cursor)*vec2(uAspect,1.);
          float distanceToCursor=length(delta);
          float lens=exp(-distanceToCursor*distanceToCursor*5.);
          float wave=sin(distanceToCursor*17.-uTime*1.35)*.0025*lens*uMotion;
          vec2 offset=-uPointer*.014*uMotion+normalize(delta+vec2(.001))*wave;
          vec2 photoUv=((uv+offset-.5)*.94)*uCover+.5;
          vec3 color=texture2D(uPhoto,photoUv).rgb;
          float depth=dot(color,vec3(.2126,.7152,.0722));
          photoUv-=uPointer*(depth-.5)*.008*uMotion;
          color=texture2D(uPhoto,photoUv).rgb;
          if(uCoast>.5){
            float luminance=dot(color,vec3(.2126,.7152,.0722));
            color=mix(color,vec3(luminance),.18);
            color*=mix(.18,.72,smoothstep(0.,.95,uv.y));
          }
          float diagonal=uv.x*.68+uv.y*.32;
          float beamCenter=.5+uPointer.x*.24+sin(uTime*.28)*.09*uMotion;
          float beamDistance=(diagonal-beamCenter)/.13;
          float beam=exp(-beamDistance*beamDistance);
          float rim=exp(-abs(distanceToCursor-.34)*55.);
          vec3 pearl=mix(vec3(.79,.91,.86),vec3(1.,.86,.68),uv.x);
          color+=pearl*(beam*.12+lens*.025+rim*.035)*uMotion*mix(1.,.45,uCoast);
          float waterY=uv.y-.52-sin(uv.x*7.+uTime*.16)*.035;
          float caustic=exp(-waterY*waterY*300.)*pow(.5+.5*sin(uv.y*64.-uv.x*4.+uTime*.24),10.);
          color+=vec3(.66,.84,.77)*caustic*.035*uCoast*uMotion;
          float edge=smoothstep(0.,.045,uv.x)*(1.-smoothstep(.955,1.,uv.x));
          gl_FragColor=vec4(color,uReveal*edge);
          #include <colorspace_fragment>
        }
      `}
      />
    </mesh>
  );
}
