import { AuditAction, MembershipRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { getCurrentSession } from "@/server/session";
import { publicUrl } from "@/server/url";

const createSchema = z.object({
  name: z.string().min(2).max(80)
});

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.redirect(publicUrl(request, "/login"), 303);
  }

  const form = await request.formData();
  const parsed = createSchema.safeParse({
    name: form.get("name")
  });

  if (!parsed.success) {
    return NextResponse.redirect(publicUrl(request, "/profiles?profile=invalid"), 303);
  }

  const membershipCount = await prisma.membership.count({
    where: {
      userId: session.user.id,
      active: true,
      deletedAt: null,
      company: {
        active: true,
        deletedAt: null
      }
    }
  });

  if (membershipCount >= 3) {
    return NextResponse.redirect(publicUrl(request, "/profiles?profile=limit"), 303);
  }

  const baseSlug = slug(parsed.data.name) || `negocio-${session.user.id.slice(-6)}`;
  const company = await prisma.$transaction(async (tx) => {
    let candidate = baseSlug;
    let suffix = 1;
    while (await tx.company.findUnique({ where: { slug: candidate }, select: { id: true } })) {
      suffix += 1;
      candidate = `${baseSlug}-${suffix}`;
    }

    const created = await tx.company.create({
      data: {
        name: parsed.data.name.trim(),
        legalName: parsed.data.name.trim(),
        slug: candidate,
        brand: {
          primaryColor: "#22d3ee",
          commandMode: true
        },
        memberships: {
          create: {
            userId: session.user.id,
            role: MembershipRole.OWNER,
            permissions: { all: true }
          }
        }
      }
    });

    const modules = await tx.moduleDefinition.findMany({ where: { active: true } });
    for (const module of modules) {
      await tx.companyModule.create({
        data: {
          companyId: created.id,
          moduleId: module.id,
          enabled: true,
          enabledAt: new Date(),
          settings: { configurable: true }
        }
      });
    }

    return created;
  });

  await writeAuditLog({
    companyId: company.id,
    actorId: session.user.id,
    action: AuditAction.CREATE,
    entityType: "Company",
    entityId: company.id,
    after: { name: company.name, slug: company.slug }
  });

  return NextResponse.redirect(publicUrl(request, "/profiles"), 303);
}
