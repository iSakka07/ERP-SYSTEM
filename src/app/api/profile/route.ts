import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const profileSchema = z.object({ name: z.string().trim().min(2).max(80) });
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxAvatarSize = 2 * 1024 * 1024;

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { avatarData: true, avatarMime: true } });
  if (!user?.avatarData || !user.avatarMime) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(user.avatarData), { headers: { "Content-Type": user.avatarMime, "Cache-Control": "private, max-age=300" } });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });

  const form = await request.formData();
  const parsed = profileSchema.safeParse({ name: form.get("name") });
  if (!parsed.success) return NextResponse.json({ error: "INVALID_NAME" }, { status: 400 });
  const uploaded = form.get("avatar");
  const avatar = uploaded instanceof File && uploaded.size ? uploaded : null;
  if (avatar && (!allowedImageTypes.has(avatar.type) || avatar.size > maxAvatarSize))
    return NextResponse.json({ error: "INVALID_AVATAR" }, { status: 400 });

  const avatarData = avatar ? Buffer.from(await avatar.arrayBuffer()) : undefined;
  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: session.user.id },
      data: { name: parsed.data.name, ...(avatarData ? { avatarData, avatarMime: avatar!.type } : {}) },
      select: { name: true, avatarData: true },
    });
    await tx.auditLog.create({ data: { actorId: session.user.id, action: "profile.update", target: session.user.id, details: JSON.stringify({ changedName: updated.name !== session.user.name, changedAvatar: Boolean(avatarData) }) } });
    return updated;
  });
  return NextResponse.json({ ok: true, name: user.name, avatarUrl: user.avatarData ? `/api/profile?avatar=${Date.now()}` : null });
}
