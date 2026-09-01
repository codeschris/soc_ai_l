import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { CONSENT_SCOPE } from "@/lib/publisher";

const schema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8, "Use at least 8 characters"),
  /** The creator must actively opt in to AI ghostwriting. */
  consent: z.literal(true),
});

export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    const email = body.email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with that email already exists." },
        { status: 409 },
      );
    }

    const user = await prisma.user.create({
      data: {
        email,
        name: body.name,
        passwordHash: await bcrypt.hash(body.password, 12),
        consents: { create: { scope: CONSENT_SCOPE, granted: true } },
        voiceProfiles: {
          create: {
            name: "My voice",
            isDefault: true,
            toneKeywords: [],
            forbidden: [],
          },
        },
      },
      select: { id: true, email: true, name: true },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
