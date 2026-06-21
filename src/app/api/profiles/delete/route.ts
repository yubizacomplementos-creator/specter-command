import { AuditAction, MembershipRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { getCurrentSession } from "@/server/session";
import { publicUrl } from "@/server/url";

const deleteSchema = z.object({
  companyId: z.string().min(1)
});

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.redirect(publicUrl(request, "/login"), 303);
  }

  const form = await request.formData();
  const parsed = deleteSchema.safeParse({
    companyId: form.get("companyId")
  });

  if (!parsed.success) {
    return NextResponse.redirect(publicUrl(request, "/profiles?profile=delete_invalid"), 303);
  }

  const [membership, activeCount] = await Promise.all([
    prisma.membership.findFirst({
      where: {
        userId: session.user.id,
        companyId: parsed.data.companyId,
        active: true,
        deletedAt: null,
        role: MembershipRole.OWNER,
        company: {
          active: true,
          deletedAt: null
        }
      },
      include: { company: true }
    }),
    prisma.membership.count({
      where: {
        userId: session.user.id,
        active: true,
        deletedAt: null,
        company: {
          active: true,
          deletedAt: null
        }
      }
    })
  ]);

  if (!membership) {
    return NextResponse.redirect(publicUrl(request, "/profiles?profile=delete_forbidden"), 303);
  }

  if (activeCount <= 1) {
    return NextResponse.redirect(publicUrl(request, "/profiles?profile=delete_last"), 303);
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.company.update({
      where: { id: membership.companyId },
      data: {
        active: false,
        deletedAt: now,
        deletedById: session.user.id
      }
    }),
    prisma.membership.updateMany({
      where: { companyId: membership.companyId },
      data: {
        active: false,
        deletedAt: now,
        deletedById: session.user.id
      }
    })
  ]);

  await writeAuditLog({
    companyId: membership.companyId,
    actorId: session.user.id,
    action: AuditAction.DELETE,
    entityType: "Company",
    entityId: membership.companyId,
    after: {
      name: membership.company.name,
      softDeleted: true
    }
  });

  return NextResponse.redirect(publicUrl(request, "/profiles?profile=deleted"), 303);
}
