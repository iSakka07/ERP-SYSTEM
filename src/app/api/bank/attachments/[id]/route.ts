import { NextResponse } from "next/server";
import { incomingUser } from "@/lib/incoming-server";
import { prisma } from "@/lib/prisma";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) { if (!(await incomingUser("bank.view"))) return new NextResponse("غير مصرح", { status: 403 }); const attachment = await prisma.bankAttachment.findUnique({ where: { id: (await params).id } }); if (!attachment) return new NextResponse("غير موجود", { status: 404 }); return new NextResponse(new Uint8Array(attachment.data), { headers: { "Content-Type": attachment.mime, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.name)}` } }); }
