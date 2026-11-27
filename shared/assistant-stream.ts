export const chatStreamType = "application/x-ndjson";

export type ChatEvent = { delta: string } | { done: true } | { error: string };

export async function* readJsonLines(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const lines = (pending + decoder.decode(value, { stream: true })).split(
        "\n",
      );
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) yield JSON.parse(line) as unknown;
      }
    }
    const remaining = pending + decoder.decode();
    if (remaining.trim()) yield JSON.parse(remaining) as unknown;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
