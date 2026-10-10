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
  const task = (await pdfjs()).getDocument({ data: bytes.slice() }); // PDF.js takes ownership of the buffer, so hand it a copy
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

export interface OpenPdf {
  /** height / width of each page, in order */
  ratios: number[];
  /** Draw page `n` (1-based) into a new canvas that is `pixelWidth` device pixels wide. */
  render(n: number, pixelWidth: number): Promise<HTMLCanvasElement>;
  close(): void;
}

export async function openPdf(bytes: Uint8Array): Promise<OpenPdf> {
  const task = (await pdfjs()).getDocument({ data: bytes.slice() });
  const pdf = await task.promise;
  const ratios: number[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const v = (await pdf.getPage(n)).getViewport({ scale: 1 });
    ratios.push(v.height / v.width);
  }
  return {
    ratios,
    async render(n, pixelWidth) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: pixelWidth / page.getViewport({ scale: 1 }).width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
      return canvas;
    },
    close: () => void task.destroy(),
  };
}
