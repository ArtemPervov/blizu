import { Canvas, useFrame } from "@react-three/fiber";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { MathUtils } from "three";
import { CoastEffects } from "./effects/CoastEffects";
import { ParcelModel } from "./effects/ParcelModel";
import type { MotionRef } from "./effects/motion";

type SceneVariant = "coast" | "delivery";

function MotionController({
  motion,
  reduced,
  surface,
  parallax,
}: {
  motion: MotionRef;
  reduced: boolean;
  surface: HTMLElement | null;
  parallax: boolean;
}) {
  useFrame((_, delta) => {
    const m = motion.current;
    const step = Math.min(delta, 0.05);
    if (!reduced) m.time += step;
    m.x = MathUtils.damp(m.x, reduced ? 0 : m.targetX, 4, step);
    m.y = MathUtils.damp(m.y, reduced ? 0 : m.targetY, 4, step);
    m.hover = MathUtils.damp(m.hover, reduced ? 0 : m.targetHover, 4, step);
    m.scroll = MathUtils.damp(m.scroll, reduced ? 0 : m.targetScroll, 3, step);
    if (surface && parallax) {
      surface.style.setProperty("--scene-x", `${m.x * 9}px`);
      surface.style.setProperty("--scene-y", `${m.y * 7}px`);
      surface.style.setProperty("--scene-scroll", `${m.scroll * 9}px`);
    }
  }, -2);
  return null;
}

class CanvasBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function ParticleScene({
  variant = "coast",
  compact = false,
}: {
  variant?: SceneVariant;
  compact?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const motion: MotionRef = useRef({
    time: 0,
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    hover: 0,
    targetHover: 0,
    scroll: 0,
    targetScroll: 0,
    press: 0,
    pressX: 0,
    pressY: 0,
  });
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [reduced, setReduced] = useState(true);
  const [coarse, setCoarse] = useState(true);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [surface, setSurface] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const element = host.current;
    const parent = element?.parentElement;
    if (!element || !parent) return;
    const interaction = compact ? (parent.parentElement ?? parent) : parent;
    setSurface(parent);
    const reducedMedia = matchMedia("(prefers-reduced-motion: reduce)");
    const coarseMedia = matchMedia("(pointer: coarse)");
    const updatePreferences = () => {
      setReduced(reducedMedia.matches);
      setCoarse(coarseMedia.matches);
      if (reducedMedia.matches) {
        const m = motion.current;
        m.x =
          m.y =
          m.hover =
          m.scroll =
          m.targetX =
          m.targetY =
          m.targetHover =
          m.targetScroll =
            0;
        parent.style.setProperty("--scene-x", "0px");
        parent.style.setProperty("--scene-y", "0px");
        parent.style.setProperty("--scene-scroll", "0px");
      }
    };
    updatePreferences();
    reducedMedia.addEventListener("change", updatePreferences);
    coarseMedia.addEventListener("change", updatePreferences);
    // Release the capability probe before mounting the actual R3F renderer.
    try {
      const probe = document.createElement("canvas");
      const context = probe.getContext("webgl2") || probe.getContext("webgl");
      setWebgl(Boolean(context));
      context?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      setWebgl(false);
    }
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.02 },
    );
    observer.observe(element);
    const visibility = () =>
      setPageVisible(document.visibilityState === "visible");
    visibility();
    document.addEventListener("visibilitychange", visibility);
    // Observe the surrounding card without intercepting its links or touch scroll.
    const move = (event: PointerEvent) => {
      if (reducedMedia.matches || event.pointerType === "touch") return;
      const rect = element.getBoundingClientRect();
      const m = motion.current;
      m.targetX = MathUtils.clamp(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -1,
        1,
      );
      m.targetY = MathUtils.clamp(
        1 - ((event.clientY - rect.top) / rect.height) * 2,
        -1,
        1,
      );
      m.targetHover = 1;
    };
    const leave = () => {
      motion.current.targetX = 0;
      motion.current.targetY = 0;
      motion.current.targetHover = 0;
    };
    const press = (event: PointerEvent) => {
      if (reducedMedia.matches || variant !== "coast") return;
      const rect = element.getBoundingClientRect();
      motion.current.pressX =
        ((event.clientX - rect.left) / rect.width) * 2 - 1;
      motion.current.pressY =
        1 - ((event.clientY - rect.top) / rect.height) * 2;
      motion.current.press += 1;
    };
    const scroll = () => {
      const rect = parent.getBoundingClientRect();
      motion.current.targetScroll = MathUtils.clamp(
        (window.innerHeight * 0.42 - rect.top - rect.height / 2) /
          window.innerHeight,
        -1,
        1,
      );
    };
    scroll();
    interaction.addEventListener("pointermove", move, { passive: true });
    interaction.addEventListener("pointerleave", leave, { passive: true });
    interaction.addEventListener("pointerdown", press, { passive: true });
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      reducedMedia.removeEventListener("change", updatePreferences);
      coarseMedia.removeEventListener("change", updatePreferences);
      interaction.removeEventListener("pointermove", move);
      interaction.removeEventListener("pointerleave", leave);
      interaction.removeEventListener("pointerdown", press);
      window.removeEventListener("scroll", scroll);
      parent.style.removeProperty("--scene-x");
      parent.style.removeProperty("--scene-y");
      parent.style.removeProperty("--scene-scroll");
    };
  }, [variant, compact]);
  const fallback =
    variant === "delivery" ? (
      <div className="parcel-fallback">
        <span>✳</span>
      </div>
    ) : null;
  return (
    <div
      ref={host}
      className={`particle-scene scene-${variant}${compact ? " scene-compact" : ""}`}
      aria-hidden="true"
    >
      {webgl ? (
        <CanvasBoundary fallback={fallback}>
          <Canvas
            camera={{
              position: [0, 0, variant === "coast" ? 5 : 7],
              fov: variant === "coast" ? 52 : 40,
            }}
            dpr={coarse ? 1 : [1, 1.5]}
            frameloop={inView && pageVisible && !reduced ? "always" : "demand"}
            gl={{
              alpha: true,
              antialias: !coarse,
              powerPreference: "low-power",
            }}
            fallback={fallback}
          >
            <MotionController
              motion={motion}
              reduced={reduced}
              surface={surface}
              parallax={variant === "coast"}
            />
            {variant === "coast" ? (
              <CoastEffects motion={motion} coarse={coarse} reduced={reduced} />
            ) : (
              <ParcelModel
                motion={motion}
                coarse={coarse}
                compact={compact}
                reduced={reduced}
              />
            )}
          </Canvas>
        </CanvasBoundary>
      ) : (
        fallback
      )}
    </div>
  );
}
