import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { incomingUser } from "@/lib/incoming-server";
export async function GET(_: Request,{params}:{params:Promise<{id:string}>}){const user=await incomingUser("pettycash.view");if(!user)return new NextResponse("Forbidden",{status:403});const item=await prisma.pettyCashAttachment.findUnique({where:{id:(await params).id}});if(!item)return new NextResponse("Not found",{status:404});return new NextResponse(new Uint8Array(item.data),{headers:{"Content-Type":item.mime||"application/octet-stream","Content-Disposition":`inline; filename="${encodeURIComponent(item.name)}"`}})}
