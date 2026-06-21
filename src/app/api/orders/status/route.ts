import { AuditAction, MembershipRole, OrderStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { getCurrentSession } from "@/server/session";
import { publicUrl } from "@/server/url";

const statusSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum([OrderStatus.CLOSED, OrderStatus.CANCELLED])
});

function clientIp(request: NextRequest) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  );
}

function metadataObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.redirect(publicUrl(request, "/login"), 303);
  }

  if (session.role === MembershipRole.VIEWER) {
    return NextResponse.redirect(publicUrl(request, "/command?order=forbidden"), 303);
  }

  const form = await request.formData();
  const parsed = statusSchema.safeParse({
    orderId: form.get("orderId"),
    status: form.get("status")
  });

  if (!parsed.success) {
    return NextResponse.redirect(publicUrl(request, "/command?order=invalid_status"), 303);
  }

  const order = await prisma.order.findFirst({
    where: {
      id: parsed.data.orderId,
      companyId: session.company.id,
      active: true,
      deletedAt: null
    },
    include: {
      items: true
    }
  });

  if (!order || order.status !== OrderStatus.OPEN) {
    return NextResponse.redirect(publicUrl(request, "/command?order=invalid_status"), 303);
  }

  const metadata = metadataObject(order.metadata);
  const stockDeducted = metadata.stockDeducted === true;
  const inventoryLocation =
    typeof metadata.inventoryLocation === "string" && metadata.inventoryLocation
      ? metadata.inventoryLocation
      : "principal";

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (parsed.data.status === OrderStatus.CANCELLED && stockDeducted) {
        for (const item of order.items) {
          if (!item.productId) {
            continue;
          }

          await tx.inventoryItem.updateMany({
            where: {
              companyId: session.company.id,
              productId: item.productId,
              locationKey: inventoryLocation,
              active: true,
              deletedAt: null
            },
            data: {
              quantity: { increment: item.quantity }
            }
          });
        }
      }

      return tx.order.update({
        where: { id: order.id },
        data: {
          status: parsed.data.status,
          updatedById: session.user.id,
          metadata: {
            ...metadata,
            stockReturned: parsed.data.status === OrderStatus.CANCELLED && stockDeducted,
            statusChangedById: session.user.id,
            statusChangedAt: new Date().toISOString()
          }
        }
      });
    });

    await writeAuditLog({
      companyId: session.company.id,
      actorId: session.user.id,
      action: AuditAction.UPDATE,
      entityType: "Order",
      entityId: updated.id,
      before: { status: order.status },
      after: {
        status: updated.status,
        stockReturned: parsed.data.status === OrderStatus.CANCELLED && stockDeducted
      },
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined
    });

    return NextResponse.redirect(publicUrl(request, `/command?order=${updated.status.toLowerCase()}`), 303);
  } catch {
    return NextResponse.redirect(publicUrl(request, "/command?order=status_failed"), 303);
  }
}
