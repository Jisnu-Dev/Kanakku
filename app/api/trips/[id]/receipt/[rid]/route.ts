import { getReceipt } from "@/lib/store";
import { fail } from "@/lib/http";

export async function GET(_: Request, { params }: { params: Promise<{ id: string; rid: string }> }) {
  try {
    const { id, rid } = await params;
    const r = await getReceipt(id, rid);
    if (!r) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(r.data), { headers: { "Content-Type": r.mime, "Cache-Control": "private, max-age=31536000, immutable" } });
  } catch (e) {
    return fail(e);
  }
}
