import { getTicketFile } from "@/lib/store";
import { fail } from "@/lib/http";

/** Serves a ticket file. Add ?download=1 to save it instead of showing it. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; tid: string }> }) {
  try {
    const { id, tid } = await params;
    const t = await getTicketFile(id, tid);
    if (!t) return new Response("Not found", { status: 404 });
    const download = new URL(req.url).searchParams.has("download");
    const ascii = t.filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
    return new Response(new Uint8Array(t.data), {
      headers: {
        "Content-Type": t.mime,
        "Content-Length": String(t.data.length),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(t.filename)}`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return fail(e);
  }
}
