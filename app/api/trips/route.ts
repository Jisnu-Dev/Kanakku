import { NextResponse } from "next/server";
import { createTrip } from "@/lib/store";
import { fail } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const id = await createTrip(await req.json());
    return NextResponse.json({ id });
  } catch (e) {
    return fail(e);
  }
}
