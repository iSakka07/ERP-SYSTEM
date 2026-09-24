import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { incomingUser } from "@/lib/incoming-server";

const itemSchema = z.object({
  name: z.string().trim().min(2).max(200),
  unit: z.string().trim().min(1).max(50),
  category: z.string().trim().max(100).optional(),
  minimumQuantity: z.number().int().min(0).max(1e9).default(0),
});

function foldArabic(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي");
}

function normalizeArabic(value: string) {
  return foldArabic(value).toLocaleLowerCase("ar");
}

function searchVariants(value: string) {
  const chars = [...value];
  const positions = chars.map((char, index) => (char === "ا" ? index : -1)).filter((index) => index >= 0).slice(0, 3);
  const variants = new Set([value]);
  const alifs = ["ا", "أ", "إ", "آ", "ٱ"];
  for (const position of positions) {
    for (const variant of [...variants]) {
      for (const alif of alifs) {
        const next = [...variant];
        next[position] = alif;
        variants.add(next.join(""));
      }
    }
  }
  return [...variants];
}

async function permitted(...permissions: string[]) {
  for (const permission of permissions) {
    const user = await incomingUser(permission);
    if (user) return user;
  }
  return null;
}

export async function GET(request: Request) {
  const user = await permitted("warehouse.view", "purchases.view");
  if (!user) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const rawQuery = (params.get("q") || "").trim().slice(0, 100);
  const query = normalizeArabic(rawQuery);
  const take = Math.min(50, Math.max(1, Number(params.get("limit") || 30) || 30));
  const variants = query ? [...new Set([...searchVariants(foldArabic(rawQuery)), ...searchVariants(query)])] : [];
  const where = query
    ? {
        active: true,
        OR: [
          ...variants.map((name) => ({ name: { contains: name } })),
          { code: { contains: rawQuery } },
        ],
      }
    : { active: true };
  const items = await prisma.inventoryItem.findMany({
    where,
    select: { id: true, name: true, unit: true, category: true, minimumQuantity: true },
    orderBy: { name: "asc" },
    take: take + 1,
  });
  const matches = query
    ? items.filter((item) => normalizeArabic(item.name).includes(query))
    : items;
  return NextResponse.json({ items: matches.slice(0, take), hasMore: matches.length > take });
}

export async function POST(request: Request) {
  const user = await permitted("purchases.manage", "warehouse.manage");
  if (!user) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  try {
    const data = itemSchema.parse(await request.json());
    const exact = await prisma.inventoryItem.findUnique({ where: { name_unit: { name: data.name, unit: data.unit } } });
    if (exact) {
      const item = exact.active ? exact : await prisma.$transaction(async (tx) => {
        const restored = await tx.inventoryItem.update({ where: { id: exact.id }, data: { active: true } });
        await tx.auditLog.create({ data: { actorId: user.id, action: "inventory.item.reactivate", target: restored.id, details: JSON.stringify({ name: restored.name, unit: restored.unit }) } });
        return restored;
      });
      return NextResponse.json({ item: { id: item.id, name: item.name, unit: item.unit, category: item.category, minimumQuantity: item.minimumQuantity }, existing: true });
    }

    const similar = await prisma.inventoryItem.findMany({
      where: { active: true },
      select: { id: true, name: true, unit: true, category: true, minimumQuantity: true },
    });
    const normalizedName = normalizeArabic(data.name);
    const candidates = similar.filter((item) => normalizeArabic(item.name) === normalizedName);
    if (candidates.length) {
      return NextResponse.json({ error: "يوجد صنف قريب في الاسم؛ اختره لتجنب تكرار الصنف.", code: "SIMILAR_ITEM_EXISTS", candidates }, { status: 409 });
    }

    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.inventoryItem.create({
        data: {
          code: `ITM-${randomUUID().slice(0, 8).toUpperCase()}`,
          name: data.name,
          unit: data.unit,
          category: data.category || null,
          minimumQuantity: data.minimumQuantity,
        },
      });
      await tx.auditLog.create({ data: { actorId: user.id, action: "inventory.item.create", target: created.id, details: JSON.stringify({ name: created.name, unit: created.unit, category: created.category }) } });
      return created;
    });
    return NextResponse.json({ item: { id: item.id, name: item.name, unit: item.unit, category: item.category, minimumQuantity: item.minimumQuantity }, existing: false }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "راجع اسم الصنف والوحدة والبيانات المدخلة." }, { status: 400 });
    if (error instanceof Error && "code" in error && error.code === "P2002") return NextResponse.json({ error: "الصنف موجود بالفعل بنفس الاسم والوحدة." }, { status: 409 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر حفظ الصنف." }, { status: 400 });
  }
}
