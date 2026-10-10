"use client";
// PDF.js is large, so it is loaded only when someone opens or adds a PDF ticket.
// The "legacy" build is used because it runs on older phone browsers too.

type PdfJs = typeof import("pdfjs-dist");
let lib: Promise<PdfJs> | null = null;

export function pdfjs(): Promise<PdfJs> {
  lib ??= (import("pdfjs-dist/legacy/build/pdf.mjs") as unknown as Promise<PdfJs>).then((m) => {
    m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"; // copied from pdfjs-dist; keep the versions in step
    return m;
  });
  return lib;
}

/** The text of the first pages of a PDF, used to pre-fill the ticket form. */
export async function pdfText(bytes: Uint8Array, maxPages = 2): Promise<string> {
  const task = (await pdfjs()).getDocument({ data: bytes });
  const pdf = await task.promise;
  try {
    let text = "";
    for (let n = 1; n <= Math.min(pdf.numPages, maxPages); n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
    }
    return text;
  } finally {
    void task.destroy();
  }
}

/** Draws every page (up to `maxPages`) into `host` as canvases that fill its width. Returns a cancel function. */
export function renderPdf(url: string, host: HTMLElement, done: (result: { pages: number; shown: number } | { error: true }) => void, maxPages = 12): () => void {
  let cancelled = false;
  let cleanup = () => {};
  (async () => {
    try {
      const task = (await pdfjs()).getDocument({ url });
      cleanup = () => void task.destroy();
      const pdf = await task.promise;
      const width = host.clientWidth || 340;
      const ratio = Math.min(window.devicePixelRatio || 1, 2.5);
      const shown = Math.min(pdf.numPages, maxPages);
      for (let n = 1; n <= shown && !cancelled; n++) {
        const page = await pdf.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (width / base.width) * ratio });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.cssText = "width:100%;height:auto;display:block;background:#fff;border-radius:10px";
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `Ticket page ${n} of ${pdf.numPages}`);
        if (cancelled) break;
        host.appendChild(canvas);
        await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
      }
      if (!cancelled) done({ pages: pdf.numPages, shown });
    } catch (e) {
      if (!cancelled) {
        console.error(e);
        done({ error: true });
      }
    }
  })();
  return () => {
    cancelled = true;
    cleanup();
    host.replaceChildren();
  };
}
