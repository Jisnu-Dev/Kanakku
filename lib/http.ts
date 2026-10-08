import { NextResponse } from "next/server";
import { UserError } from "./store";

export function fail(e: unknown) {
  if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof SyntaxError) return NextResponse.json({ error: "That request couldn't be read" }, { status: 400 });
  console.error(e);
  const missingDb = e instanceof Error && e.message.startsWith("DATABASE_URL");
  return NextResponse.json({ error: missingDb ? e.message : "Something went wrong on the server. Try again." }, { status: 500 });
}
