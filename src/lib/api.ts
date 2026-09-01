import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "./auth";
import { MissingProviderError } from "./ai";
import { PublishGuardError } from "./publisher";
import { MetaApiError } from "./social/meta";

export function apiError(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid request", issues: err.issues },
      { status: 422 },
    );
  }
  if (err instanceof PublishGuardError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof MissingProviderError) {
    return NextResponse.json({ error: err.message }, { status: 503 });
  }
  if (err instanceof MetaApiError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.status >= 400 && err.status < 600 ? err.status : 502 },
    );
  }

  console.error(err);
  const message = err instanceof Error ? err.message : "Unexpected error";
  return NextResponse.json({ error: message }, { status: 500 });
}
