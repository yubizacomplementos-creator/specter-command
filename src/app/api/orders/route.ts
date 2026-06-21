import { AuditAction, MembershipRole, OrderStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { getCurrentSession } from "@/server/session";
import { publicUrl, redirectBackUrl } from "@/server/url";

const orderSchema = z.object({
  customerId: z.string().optional(),
  productId: z.string().min(1),
  quantity: z.coerce.number().positive().max(999999),
  unitPrice: z.coerce.number().nonnegative().max(999999999),
  couponCode: z.string().max(60).optional(),
  discount: z.coerce.number().nonnegative().max(999999999).default(0),
  tax: z.coerce.number().nonnegative().max(999999999).default(0)
});

const defaultInventoryLocation = "principal";
const insufficientStockError = "INSUFFICIENT_STOCK";

function clientIp(request: NextRequest) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  );
}

function cleanOptional(value?: string) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function orderCodeFromCount(count: number) {
  const today = new Date();
  const stamp = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0")
  ].join("");
  return `ORD-${stamp}-${String(count + 1).padStart(4, "0")}`;
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.redirect(publicUrl(request, "/login"), 303);
  }

  if (session.role === MembershipRole.VIEWER) {
    return NextResponse.redirect(redirectBackUrl(request, "/command", { order: "forbidden" }), 303);
  }

  const form = await request.formData();
  const parsed = orderSchema.safeParse({
    customerId: form.get("customerId"),
    productId: form.get("productId"),
    quantity: form.get("quantity"),
    unitPrice: form.get("unitPrice"),
    couponCode: form.get("couponCode"),
    discount: form.get("discount") || 0,
    tax: form.get("tax") || 0
  });

  if (!parsed.success) {
    return NextResponse.redirect(redirectBackUrl(request, "/command", { order: "invalid" }), 303);
  }

  const product = await prisma.product.findFirst({
    where: {
      id: parsed.data.productId,
      companyId: session.company.id,
      active: true,
      deletedAt: null
    }
  });

  if (!product || !product.sellable) {
    return NextResponse.redirect(redirectBackUrl(request, "/command", { order: "invalid_product" }), 303);
  }

  const customerId = cleanOptional(parsed.data.customerId);
  if (customerId) {
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        companyId: session.company.id,
        active: true,
        deletedAt: null
      },
      select: { id: true }
    });

    if (!customer) {
      return NextResponse.redirect(redirectBackUrl(request, "/command", { order: "invalid_customer" }), 303);
    }
  }

  const subtotal = parsed.data.quantity * parsed.data.unitPrice;
  const total = Math.max(0, subtotal - parsed.data.discount + parsed.data.tax);

  try {
    const order = await prisma.$transaction(async (tx) => {
      if (product.controlsStock) {
        const stockUpdate = await tx.inventoryItem.updateMany({
          where: {
            companyId: session.company.id,
            productId: product.id,
            locationKey: defaultInventoryLocation,
            active: true,
            deletedAt: null,
            quantity: { gte: parsed.data.quantity }
          },
          data: {
            quantity: { decrement: parsed.data.quantity }
          }
        });

        if (stockUpdate.count !== 1) {
          throw new Error(insufficientStockError);
        }
      }

      const orderCount = await tx.order.count({ where: { companyId: session.company.id } });
      const code = orderCodeFromCount(orderCount);
      return tx.order.create({
        data: {
          companyId: session.company.id,
          customerId,
          code,
          status: OrderStatus.OPEN,
          subtotal,
          discount: parsed.data.discount,
          tax: parsed.data.tax,
          total,
          metadata: {
            couponCode: cleanOptional(parsed.data.couponCode),
            inventoryLocation: product.controlsStock ? defaultInventoryLocation : null,
            stockDeducted: product.controlsStock
          },
          createdById: session.user.id,
          updatedById: session.user.id,
          items: {
            create: {
              companyId: session.company.id,
              productId: product.id,
              description: product.name,
              quantity: parsed.data.quantity,
              unitPrice: parsed.data.unitPrice,
              total: subtotal
            }
          }
        }
      });
    });

    await writeAuditLog({
      companyId: session.company.id,
      actorId: session.user.id,
      action: AuditAction.CREATE,
      entityType: "Order",
      entityId: order.id,
      after: {
        code: order.code,
        status: order.status,
        customerId: order.customerId,
        productId: product.id,
        subtotal,
        couponCode: cleanOptional(parsed.data.couponCode),
        discount: parsed.data.discount,
        tax: parsed.data.tax,
        total,
        inventoryLocation: product.controlsStock ? defaultInventoryLocation : null,
        stockDeducted: product.controlsStock
      },
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined
    });

    return NextResponse.redirect(redirectBackUrl(request, "/command", { order: "created" }), 303);
  } catch (error) {
    if (error instanceof Error && error.message === insufficientStockError) {
      return NextResponse.redirect(redirectBackUrl(request, "/command", { order: "insufficient_stock" }), 303);
    }

    return NextResponse.redirect(redirectBackUrl(request, "/command", { order: "failed" }), 303);
  }
}
