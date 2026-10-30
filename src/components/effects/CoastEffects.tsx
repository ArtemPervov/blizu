import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { MathUtils, SRGBColorSpace, TextureLoader, Vector2 } from "three";
import type { ShaderMaterial } from "three";

// One continuous glass surface: ambient light and transitions never follow the cursor.
export function CoastEffects({
  imageUrls,
  imageFocus,
  activeSlide,
  reduced,
}: {
  imageUrls: string[];
  imageFocus?: number[];
  activeSlide: number;
  reduced: boolean;
}) {
  const textures = useLoader(TextureLoader, imageUrls);
  const { width, height, aspect } = useThree((state) => state.viewport);
  const invalidate = useThree((state) => state.invalidate);
  const material = useRef<ShaderMaterial>(null);
  const time = useRef(0),
    reveal = useRef(0);
  const transition = useRef({
    from: activeSlide,
    to: activeSlide,
    progress: 1,
    started: 0,
  });
  const covers = useMemo(
    () =>
      textures.map((texture) => {
        texture.colorSpace = SRGBColorSpace;
        const image = texture.image as { width: number; height: number };
        const ratio = image.width / image.height;
        return new Vector2(
          Math.min(aspect / ratio, 1),
          Math.min(ratio / aspect, 1),
        );
      }),
    [textures, aspect],
  );
  const uniforms = useMemo(
    () => ({
      uFrom: { value: textures[activeSlide] },
      uTo: { value: textures[activeSlide] },
      uFromCover: { value: covers[activeSlide].clone() },
      uToCover: { value: covers[activeSlide].clone() },
      uTime: { value: 0 },
      uProgress: { value: 1 },
      uReveal: { value: 0 },
      uMotion: { value: reduced ? 0 : 1 },
      uFromFocus: { value: imageFocus?.[activeSlide] ?? 0.5 },
      uToFocus: { value: imageFocus?.[activeSlide] ?? 0.5 },
    }),
    [textures, covers, reduced],
  );

  useLayoutEffect(() => {
    if (transition.current.to !== activeSlide) {
      transition.current = {
        from: transition.current.to,
        to: activeSlide,
        progress: reduced ? 1 : 0,
        started: performance.now(),
      };
    }
    invalidate();
  }, [activeSlide, reduced, invalidate]);

  useFrame((_, delta) => {
    const step = Math.min(delta, 0.05);
    if (!reduced) time.current += step;
    const current = transition.current;
    current.progress = reduced
      ? 1
      : current.progress === 1
        ? 1
        : Math.min(1, (performance.now() - current.started) / 1500);
    reveal.current = reduced ? 1 : MathUtils.damp(reveal.current, 1, 5, step);
    if (!material.current) return;
    const live = material.current.uniforms;
    live.uFrom.value = textures[current.from];
    live.uTo.value = textures[current.to];
    live.uFromCover.value.copy(covers[current.from]);
    live.uToCover.value.copy(covers[current.to]);
    live.uFromFocus.value = imageFocus?.[current.from] ?? 0.5;
    live.uToFocus.value = imageFocus?.[current.to] ?? 0.5;
    live.uTime.value = time.current;
    live.uProgress.value = current.progress;
    live.uReveal.value = reveal.current;
    live.uMotion.value = reduced ? 0 : 1;
  });
  return (
    <mesh scale={[width, height, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        toneMapped={false}
        vertexShader={`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`}
        fragmentShader={`
          varying vec2 vUv;
          uniform sampler2D uFrom; uniform sampler2D uTo;
          uniform vec2 uFromCover; uniform vec2 uToCover;
          uniform float uTime; uniform float uProgress; uniform float uReveal; uniform float uMotion;
          uniform float uFromFocus; uniform float uToFocus;
          vec3 photograph(sampler2D photo,vec2 cover,float focus,vec2 uv){
            vec2 photoUv=uv*cover+(1.-cover)*vec2(focus,.5);
            vec3 color=texture2D(photo,photoUv).rgb;
            float luma=dot(color,vec3(.2126,.7152,.0722));
            return mix(color,vec3(luma),.09)*.97;
          }
          void main(){
            float t=uTime;
            float progress=smoothstep(0.,1.,uProgress);
            float envelope=sin(progress*3.14159265)*uMotion;
            float zoom=.958-sin(t*.075)*.009*uMotion;
            vec2 drift=vec2(sin(t*.07),cos(t*.055))*.006*uMotion;
            vec2 uv=(vUv-.5)*zoom+.5+drift;
            vec2 refraction=vec2(sin(uv.y*5.+t*.21),cos(uv.x*4.-t*.17))*.0022*uMotion;
            vec2 dissolve=vec2(sin(uv.y*7.+t*.3),cos(uv.x*5.-t*.2))*.013*envelope;
            float contour=vUv.x*.76+vUv.y*.24+sin(vUv.y*6.+t*.12)*.035;
            float front=mix(-.3,1.3,progress);
            float blend=smoothstep(contour-.24,contour+.24,front);
            vec3 from=photograph(uFrom,uFromCover,uFromFocus,uv+refraction+dissolve*progress);
            vec3 to=photograph(uTo,uToCover,uToFocus,uv+refraction-dissolve*(1.-progress));
            vec3 color=mix(from,to,blend);
            // Broad, slowly travelling caustics, like sunlight through shallow water.
            float ribbon=vUv.y-.54-sin(vUv.x*4.2+t*.19)*.12;
            float light=exp(-pow(ribbon/.14,2.));
            float silk=pow(.5+.5*sin(vUv.x*4.8+vUv.y*3.2-t*.23),6.);
            float seam=exp(-pow((contour-front)/.12,2.))*envelope;
            vec3 pearl=mix(vec3(.64,.84,.78),vec3(1.,.83,.57),.5+.5*sin(t*.09));
            color+=pearl*(light*.038+silk*.021+seam*.055)*uMotion;
            float edgeLight=pow(max(0.,1.-vUv.x),5.)*.018*uMotion;
            color+=vec3(.62,.82,.76)*edgeLight;
            gl_FragColor=vec4(color,uReveal);
            #include <colorspace_fragment>
          }
        `}
      />
    </mesh>
  );
}
