const updateInterval = 20;
const revealWindow = 120;

export function createReplyReveal(publish: (text: string) => void) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let visibleText = "";
  let queuedText = "";
  let deadline = 0;
  let timer: number | undefined;
  let resolveCompletion: (() => void) | undefined;

  function advance() {
    timer = undefined;
    const remaining = Array.from(queuedText);
    const steps = Math.max(
      1,
      Math.ceil((deadline - performance.now()) / updateInterval),
    );
    const count =
      reducedMotion.matches || document.hidden
        ? remaining.length
        : Math.max(6, Math.ceil(remaining.length / steps));
    const next = remaining.slice(0, count).join("");
    visibleText += next;
    queuedText = queuedText.slice(next.length);
    publish(visibleText);
    if (queuedText) timer = window.setTimeout(advance, updateInterval);
    else resolveCompletion?.();
  }

  function stop() {
    window.clearTimeout(timer);
    timer = undefined;
    queuedText = "";
    resolveCompletion?.();
    resolveCompletion = undefined;
  }

  return {
    append(text: string) {
      if (!text) return;
      queuedText += text;
      if (timer !== undefined) return;
      deadline = performance.now() + revealWindow;
      advance();
    },
    replace(text: string) {
      stop();
      visibleText = text;
      publish(text);
    },
    finish() {
      return timer === undefined
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            resolveCompletion = resolve;
          });
    },
    stop,
  };
}
