import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supportsWebGL } from "./effects/webgl";

const LightScene = lazy(() => import("./effects/AdriaticLightScene"));

class LightBoundary extends Component<
  { children: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function LightContours() {
  const id = useId();
  return (
    <svg
      className="adriatic-light-contours"
      viewBox="0 0 1200 420"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#397c83" stopOpacity="0" />
          <stop offset="0.12" stopColor="#397c83" stopOpacity="0.7" />
          <stop offset="0.42" stopColor="#709c96" stopOpacity="0.1" />
          <stop offset="0.58" stopColor="#b49a70" stopOpacity="0.1" />
          <stop offset="0.88" stopColor="#b49a70" stopOpacity="0.8" />
          <stop offset="1" stopColor="#b49a70" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3, 4, 5].map((line) => (
        <path
          key={line}
          d={`M -80 ${235 + line * 15} C 130 ${65 + line * 20}, 275 ${340 + line * 9}, 560 ${240 + line * 13} S 980 ${92 + line * 22}, 1280 ${220 + line * 15}`}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={line % 3 === 0 ? 1.7 : 1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

/** Decorative only: the normal HTML hero is always rendered independently. */
export function AdriaticLight() {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [inView, setInView] = useState(false);
  const [visible, setVisible] = useState(true);
  const [failed, setFailed] = useState(false);
  const [rendered, setRendered] = useState(false);
  const onReady = useCallback(() => setRendered(true), []);
  useEffect(() => {
    if (reduced || failed) setRendered(false);
  }, [reduced, failed]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (
      navigator as Navigator & {
        connection?: EventTarget & { saveData?: boolean };
      }
    ).connection;
    const preference = () =>
      setReduced(media.matches || !!connection?.saveData);
    const visibility = () => setVisible(document.visibilityState === "visible");
    preference();
    visibility();
    media.addEventListener("change", preference);
    connection?.addEventListener("change", preference);
    document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.02 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", preference);
      connection?.removeEventListener("change", preference);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (reduced || !inView || !visible || ready || failed) return;
    // Let the typography, search and catalogue settle before loading WebGL.
    const timer = window.setTimeout(() => {
      if (supportsWebGL()) setReady(true);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [reduced, inView, visible, ready, failed]);
  return (
    <div
      ref={host}
      className="adriatic-light"
      aria-hidden="true"
      inert
      data-renderer={rendered && !reduced && !failed ? "webgl" : "static"}
    >
      <LightContours />
      {ready && !reduced && !failed && (
        <LightBoundary onFailure={() => setFailed(true)}>
          <Suspense fallback={null}>
            <LightScene active={inView && visible} onReady={onReady} />
          </Suspense>
        </LightBoundary>
      )}
    </div>
  );
}
