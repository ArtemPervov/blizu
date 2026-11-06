import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supportsWebGL } from "./effects/webgl";

const LightScene = lazy(() => import("./effects/AdriaticLightScene"));

class LightBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Decorative only: the normal HTML hero is always rendered independently. */
export function AdriaticLight() {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [inView, setInView] = useState(false);
  const [visible, setVisible] = useState(true);
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
    if (reduced || !inView || !visible || ready) return;
    // Let the typography, search and catalogue settle before loading WebGL.
    const timer = window.setTimeout(() => {
      if (supportsWebGL()) setReady(true);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [reduced, inView, visible, ready]);
  return (
    <div ref={host} className="adriatic-light" aria-hidden="true" inert>
      {ready && !reduced && (
        <LightBoundary>
          <Suspense fallback={null}>
            <LightScene active={inView && visible} />
          </Suspense>
        </LightBoundary>
      )}
    </div>
  );
}
