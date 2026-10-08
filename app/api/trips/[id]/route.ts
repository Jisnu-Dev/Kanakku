import { NextResponse } from "next/server";
import { applyAction, getState } from "@/lib/store";
import { fail } from "@/lib/http";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const fresh = { headers: { "Cache-Control": "no-store" } };

export async function GET(_: Request, { params }: Params) {
  try {
    const state = await getState((await params).id);
    if (!state) return NextResponse.json({ error: "This trip doesn't exist" }, { status: 404 });
    return NextResponse.json(state, fresh);
  } catch (e) {
    return fail(e);
  }
}

/** Every change goes through here as { action, actorId, payload } and gets the fresh trip back. */
export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    await applyAction(id, String(body.action), typeof body.actorId === "string" ? body.actorId : null, body.payload ?? {});
    return NextResponse.json(await getState(id), fresh);
  } catch (e) {
    return fail(e);
  }
}
