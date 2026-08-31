import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { CONSENT_SCOPE } from "@/lib/publisher";

const schema = z.object({ granted: z.boolean() });

export async function GET() {
  try {
    const user = await requireUser();
    const consent = await prisma.consent.findFirst({
      where: { userId: user.id, scope: CONSENT_SCOPE, granted: true, revokedAt: null },
    });
    return NextResponse.json({ granted: Boolean(consent), consent });
  } catch (err) {
    return apiError(err);
  }
}

/** Grant or revoke the AI's permission to write as the creator. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { granted } = schema.parse(await req.json());

    if (granted) {
      await prisma.consent.create({
        data: { userId: user.id, scope: CONSENT_SCOPE, granted: true },
      });
    } else {
      await prisma.consent.updateMany({
        where: { userId: user.id, scope: CONSENT_SCOPE, revokedAt: null },
        data: { granted: false, revokedAt: new Date() },
      });
      // Revoking consent immediately stops anything queued from going out.
      await prisma.post.updateMany({
        where: { userId: user.id, status: { in: ["SCHEDULED", "APPROVED"] } },
        data: { status: "PENDING_APPROVAL", approvedAt: null, approvedBy: null },
      });
    }

    await logAction({
      userId: user.id,
      action: granted ? "consent.granted" : "consent.revoked",
      metadata: { scope: CONSENT_SCOPE },
    });

    return NextResponse.json({ granted });
  } catch (err) {
    return apiError(err);
  }
}
