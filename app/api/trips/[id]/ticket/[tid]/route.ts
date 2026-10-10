import { NextResponse } from "next/server";
import { TICKET_CHUNK } from "@/lib/constants";
import { getTicketInfo, getTicketPart, putTicketChunk, UserError } from "@/lib/store";
import { fail } from "@/lib/http";

type Params = { params: Promise<{ id: string; tid: string }> };

/**
 * GET ?part=n   one piece of the file (always under Vercel's 4.5 MB response cap). The app uses this.
 * GET           the whole file, streamed piece by piece. Add ?download=1 to save instead of show.
 */
export async function GET(req: Request, { params }: Params) {
  try {
    const { id, tid } = await params;
    const info = await getTicketInfo(id, tid);
    if (!info) return new Response("Not found", { status: 404 });
    const url = new URL(req.url);

    if (url.searchParams.has("part")) {
      const data = await getTicketPart(tid, Number(url.searchParams.get("part")));
      if (!data) return new Response("Not found", { status: 404 });
      return new Response(new Uint8Array(data), { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, max-age=86400, immutable" } });
    }

    let part = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const data = part < info.parts ? await getTicketPart(tid, part++) : null;
        if (data) controller.enqueue(new Uint8Array(data));
        else controller.close();
      },
    });
    const ascii = info.filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
    return new Response(body, {
      headers: {
        "Content-Type": info.mime,
        "Content-Disposition": `${url.searchParams.has("download") ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(info.filename)}`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return fail(e);
  }
}

/** POST ?seq=n with the raw bytes of one piece of a ticket that "ticket.add" has reserved. */
export async function POST(req: Request, { params }: Params) {
  try {
    const { id, tid } = await params;
    const seq = Number(new URL(req.url).searchParams.get("seq"));
    const data = Buffer.from(await req.arrayBuffer());
    if (data.length === 0 || data.length > TICKET_CHUNK) throw new UserError("Part of the file didn't arrive whole. Try again.");
    await putTicketChunk(id, tid, seq, data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
