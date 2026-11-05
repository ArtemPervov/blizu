import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Handshake,
  MapPin,
  Pause,
  Play,
} from "lucide-react";

const ParticleScene = lazy(() => import("./Particles"));
import { supportsWebGL } from "./effects/webgl";
const SLIDE_DURATION = 7200;
const TRANSITION_DURATION = 1600;
const slides = [
  {
    image: "/images/kotor.jpg",
    focalX: 0.5,
    location: "Котор",
    alt: "Терракотовые крыши Котора на берегу Бока-Которского залива",
  },
  {
    image: "/images/sveti-stefan.jpg",
    focalX: 0,
    location: "Свети-Стефан",
    alt: "Остров Свети-Стефан и бирюзовое Адриатическое море",
  },
  {
    image: "/images/perast.jpg",
    focalX: 0.5,
    location: "Пераст",
    alt: "Каменные дома и колокольня Пераста у подножия гор",
  },
  {
    image: "/images/durmitor.jpg",
    focalX: 0.5,
    location: "Дурмитор",
    alt: "Отражение гор и леса в зелёной воде Чёрного озера в Дурмиторе",
  },
];
const imageUrls = slides.map((slide) => slide.image);
const imageFocus = slides.map((slide) => slide.focalX);

export function HeroCarousel() {
  const host = useRef<HTMLDivElement>(null);
  const transitionLock = useRef(false);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [reduced, setReduced] = useState(true);
  const [ready, setReady] = useState<number[]>([]);
  const [failed, setFailed] = useState<number[]>([]);
  const [transitioning, setTransitioning] = useState(false);
  const [webgl, setWebgl] = useState(false);
  const running = playing && inView && pageVisible && ready.length > 1;

  useEffect(() => {
    setWebgl(supportsWebGL());
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const preference = () => {
      setReduced(media.matches);
      if (media.matches) setPlaying(false);
    };
    preference();
    media.addEventListener("change", preference);
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.15 },
    );
    if (host.current) observer.observe(host.current);
    const visibility = () =>
      setPageVisible(document.visibilityState === "visible");
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", preference);
      document.removeEventListener("visibilitychange", visibility);
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
    };
  }, []);

  const goTo = (next: number) => {
    if (next === active || !ready.includes(next) || transitionLock.current)
      return;
    if (!reduced) {
      transitionLock.current = true;
      setTransitioning(true);
      transitionTimer.current = setTimeout(() => {
        transitionLock.current = false;
        setTransitioning(false);
      }, TRANSITION_DURATION);
    }
    setActive(next);
  };
  const step = (direction: number) => {
    for (let offset = 1; offset < slides.length; offset++) {
      const next =
        (active + direction * offset + slides.length) % slides.length;
      if (ready.includes(next)) {
        goTo(next);
        return;
      }
    }
  };

  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => step(1), SLIDE_DURATION);
    return () => clearTimeout(timer);
  }, [active, running, ready, reduced]);

  useEffect(() => {
    if (failed.includes(active) && ready.length) setActive(ready[0]);
  }, [active, ready, failed]);

  return (
    <div
      ref={host}
      className="hero-visual hero-carousel"
      role="region"
      aria-roledescription="карусель"
      aria-label="Пейзажи Черногории"
      data-running={running}
      data-slide={active + 1}
      style={{ "--slide-duration": `${SLIDE_DURATION}ms` } as CSSProperties}
      onFocusCapture={(event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.matches(":focus-visible")
        )
          setPlaying(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        setPlaying(false);
        step(event.key === "ArrowLeft" ? -1 : 1);
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "touch")
          touch.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const start = touch.current;
        touch.current = null;
        if (!start) return;
        const dx = event.clientX - start.x,
          dy = event.clientY - start.y;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4)
          step(dx < 0 ? 1 : -1);
      }}
      onPointerCancel={() => {
        touch.current = null;
      }}
    >
      <div className="hero-photo-shell">
        {slides.map((slide, index) => (
          <div
            className="hero-carousel-slide"
            key={slide.image}
            data-active={active === index}
            aria-hidden={active !== index}
          >
            <img
              src={slide.image}
              alt={slide.alt}
              draggable={false}
              style={{
                objectPosition: `${slide.focalX * 100}% 50%`,
                transformOrigin: `${slide.focalX * 100}% 50%`,
              }}
              fetchPriority={index === 0 ? "high" : "low"}
              onLoad={() =>
                setReady((current) =>
                  current.includes(index) ? current : [...current, index],
                )
              }
              onError={() =>
                setFailed((current) =>
                  current.includes(index) ? current : [...current, index],
                )
              }
            />
          </div>
        ))}
      </div>
      {failed.length === 0 && webgl && (
        <Suspense fallback={null}>
          <ParticleScene
            imageUrls={imageUrls}
            imageFocus={imageFocus}
            activeSlide={active}
          />
        </Suspense>
      )}
      <div className="hero-shade" />
      <span className="photo-location" key={active}>
        <MapPin size={13} /> {slides[active].location}, Черногория
      </span>
      <div className="hero-photo-title">
        Маленькая страна.
        <br />
        <em>Большое чувство дома.</em>
      </div>
      <div className="floating-trust">
        <div className="trust-icon">
          <Handshake size={23} />
        </div>
        <div>
          <strong>Свои люди — рядом</strong>
          <span>От первой заявки до результата</span>
        </div>
        <span className="tiny-sparkle">✳</span>
      </div>
      <div className="carousel-footer">
        <div
          className="carousel-pagination"
          role="group"
          aria-label="Выбор фотографии"
        >
          {slides.map((slide, index) => (
            <button
              type="button"
              key={slide.image}
              aria-label={`Показать фото: ${slide.location}`}
              aria-current={active === index ? "true" : undefined}
              disabled={transitioning || !ready.includes(index)}
              onClick={() => goTo(index)}
            >
              <span>
                <i />
              </span>
            </button>
          ))}
          <span className="carousel-count" aria-hidden="true">
            {String(active + 1).padStart(2, "0")}{" "}
            <b>/ {String(slides.length).padStart(2, "0")}</b>
          </span>
        </div>
        <div
          className="carousel-actions"
          role="group"
          aria-label="Управление каруселью"
        >
          <button
            type="button"
            aria-label={
              playing ? "Приостановить слайд-шоу" : "Включить слайд-шоу"
            }
            onClick={() => setPlaying((value) => !value)}
          >
            {playing ? (
              <Pause size={13} fill="currentColor" />
            ) : (
              <Play size={13} fill="currentColor" />
            )}
          </button>
          <button
            type="button"
            aria-label="Предыдущее фото"
            disabled={transitioning || ready.length < 2}
            onClick={() => step(-1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            type="button"
            aria-label="Следующее фото"
            disabled={transitioning || ready.length < 2}
            onClick={() => step(1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <span className="sr-only" aria-live={playing ? "off" : "polite"}>
        {slides[active].location}. Фото {active + 1} из {slides.length}.
      </span>
      <span className="visual-stamp" aria-hidden="true">
        <svg width="44" height="44" viewBox="0 0 44 44">
          <path
            d="M22 3v38M5.5 12.5l33 19M5.5 31.5l33-19"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </svg>
      </span>
    </div>
  );
}
