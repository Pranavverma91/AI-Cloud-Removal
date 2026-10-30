import { processInput, type Input } from "../lib/personal/process";
self.onmessage = async (event: MessageEvent<Input>) => {
  try {
    const output = await processInput(event.data, (stage) =>
      self.postMessage({ stage }),
    );
    self.postMessage(
      { output },
      {
        transfer: output.products.flatMap(
          (p) => [p.tif, p.png.buffer, p.map.buffer] as ArrayBuffer[],
        ),
      },
    );
  } catch (e) {
    self.postMessage({
      error: e instanceof Error ? e.message : "Processing failed.",
    });
  }
};
