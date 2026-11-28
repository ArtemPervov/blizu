const characterInterval = 34;
const catchUpWindow = 1_800;
const tailFadeTime = 150;
const tailLength = 5;

const segmenter =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : undefined;

export type ReplyFrame = {
  text: string;
  fading: { offset: number; text: string }[];
};

export function createReplyReveal(publish: (frame: ReplyFrame) => void) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const skipAnimation = () => reducedMotion.matches || document.hidden;
  const queue: string[] = [];
  let text = "";
  let fading: ReplyFrame["fading"] = [];
  let deadline = 0;
  let lastFrame = -Infinity;
  let timer: number | undefined;
  let resolveCompletion: (() => void) | undefined;

  function stop() {
    window.clearTimeout(timer);
    timer = undefined;
    queue.length = 0;
    resolveCompletion?.();
    resolveCompletion = undefined;
  }

  function flush() {
    text += queue.join("");
    stop();
    fading = [];
    publish({ text, fading });
  }

  function advance() {
    timer = undefined;
    if (skipAnimation()) {
      flush();
      return;
    }
    if (!queue.length) {
      stop();
      return;
    }

    lastFrame = performance.now();
    const frames = Math.max(
      1,
      Math.ceil((deadline - lastFrame) / characterInterval),
    );
    const characters = queue.splice(0, Math.ceil(queue.length / frames));
    const recent = [...fading];
    for (const character of characters) {
      recent.push({ offset: text.length, text: character });
      text += character;
    }
    fading = recent.slice(-tailLength);
    publish({ text, fading });
    schedule();
  }

  function schedule() {
    if (skipAnimation()) {
      if (queue.length || resolveCompletion) flush();
      return;
    }
    if (timer !== undefined || (!queue.length && !resolveCompletion)) return;
    const wait = Math.max(
      0,
      (queue.length ? characterInterval : tailFadeTime) -
        (performance.now() - lastFrame),
    );
    if (queue.length && wait === 0) advance();
    else timer = window.setTimeout(advance, wait);
  }

  function append(value: string) {
    if (!value) return;
    if (!queue.length) deadline = performance.now() + catchUpWindow;
    queue.push(
      ...(segmenter
        ? Array.from(segmenter.segment(value), ({ segment }) => segment)
        : Array.from(value)),
    );
    schedule();
  }

  return {
    append,
    replace(value: string) {
      stop();
      if (!value.startsWith(text)) {
        text = "";
        fading = [];
        lastFrame = -Infinity;
        publish({ text, fading });
      }
      append(value.slice(text.length));
    },
    flush,
    finish() {
      return new Promise<void>((resolve) => {
        resolveCompletion = resolve;
        schedule();
      });
    },
    stop,
  };
}
