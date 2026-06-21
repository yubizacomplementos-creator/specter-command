import { AuditAction, MembershipRole, OrderStatus, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { decryptSecrets } from "@/server/integrations";
import { getCurrentSession } from "@/server/session";
import { publicUrl, redirectBackUrl } from "@/server/url";

type ShopifyOrderNode = {
  id: string;
  legacyResourceId?: string;
  name: string;
  displayFinancialStatus?: string | null;
  displayFulfillmentStatus?: string | null;
  email?: string | null;
  phone?: string | null;
  customer?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    displayName?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  subtotalPriceSet?: { shopMoney?: { amount?: string | null; currencyCode?: string | null } | null } | null;
  totalDiscountsSet?: { shopMoney?: { amount?: string | null } | null } | null;
  totalTaxSet?: { shopMoney?: { amount?: string | null } | null } | null;
  totalPriceSet?: { shopMoney?: { amount?: string | null } | null } | null;
  lineItems: {
    nodes: Array<{
      title: string;
      quantity: number;
      sku?: string | null;
      variant?: { id: string; sku?: string | null } | null;
      discountedTotalSet?: { shopMoney?: { amount?: string | null } | null } | null;
      originalUnitPriceSet?: { shopMoney?: { amount?: string | null } | null } | null;
    }>;
  };
};

type ShopifyOrdersResponse = {
  data?: {
    orders?: {
      nodes: ShopifyOrderNode[];
    };
  };
  errors?: Array<{ message: string }>;
};

const ordersQuery = `
  query SpecterOrdersSync {
    orders(first: 50, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        legacyResourceId
        name
        displayFinancialStatus
        displayFulfillmentStatus
        email
        phone
        customer {
          id
          firstName
          lastName
          displayName
          email
          phone
        }
        subtotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalDiscountsSet {
          shopMoney {
            amount
          }
        }
        totalTaxSet {
          shopMoney {
            amount
          }
        }
        totalPriceSet {
          shopMoney {
            amount
          }
        }
        lineItems(first: 50) {
          nodes {
            title
            quantity
            sku
            variant {
              id
              sku
            }
            discountedTotalSet {
              shopMoney {
                amount
              }
            }
            originalUnitPriceSet {
              shopMoney {
                amount
              }
            }
          }
        }
      }
    }
  }
`;

function clientIp(request: NextRequest) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  );
}

function configValue(config: unknown, key: string) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return "";
  }

  const value = (config as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDomain(value: string) {
  return value
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();
}

function decimal(value?: string | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function customerName(order: ShopifyOrderNode) {
  const customer = order.customer;
  const name = customer?.displayName || [customer?.firstName, customer?.lastName].filter(Boolean).join(" ");
  return name || order.email || order.phone || "Cliente Shopify";
}

function customerCode(order: ShopifyOrderNode) {
  const id = order.customer?.id.split("/").pop() ?? order.email ?? order.phone ?? order.name;
  return `SHOPIFY-${id}`.slice(0, 60);
}

function orderCode(order: ShopifyOrderNode) {
  return `SHOPIFY-${(order.legacyResourceId ?? order.name).replace(/^#/, "")}`.slice(0, 80);
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.redirect(publicUrl(request, "/login"), 303);
  }

  if (session.role === MembershipRole.VIEWER) {
    return NextResponse.redirect(redirectBackUrl(request, "/command/orders", { order: "forbidden" }), 303);
  }

  const setting = await prisma.integrationSetting.findUnique({
    where: {
      companyId_provider: {
        companyId: session.company.id,
        provider: "shopify"
      }
    }
  });

  const shopDomain = normalizeDomain(configValue(setting?.publicConfig, "shopDomain"));
  const apiVersion = configValue(setting?.publicConfig, "apiVersion") || "2026-01";
  const secrets = decryptSecrets({
    secretCiphertext: setting?.secretCiphertext,
    secretIv: setting?.secretIv,
    secretTag: setting?.secretTag
  });
  const accessToken = secrets.accessToken?.trim();

  if (!shopDomain || !accessToken) {
    return NextResponse.redirect(redirectBackUrl(request, "/command/orders", { order: "shopify_missing" }), 303);
  }

  const response = await fetch(`https://${shopDomain}/admin/api/${apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken
    },
    body: JSON.stringify({ query: ordersQuery })
  });

  if (!response.ok) {
    return NextResponse.redirect(redirectBackUrl(request, "/command/orders", { order: "shopify_failed" }), 303);
  }

  const payload = (await response.json()) as ShopifyOrdersResponse;
  if (payload.errors?.length || !payload.data?.orders?.nodes) {
    return NextResponse.redirect(redirectBackUrl(request, "/command/orders", { order: "shopify_failed" }), 303);
  }

  let imported = 0;
  for (const shopifyOrder of payload.data.orders.nodes) {
    const code = orderCode(shopifyOrder);
    const existing = await prisma.order.findUnique({
      where: {
        companyId_code: {
          companyId: session.company.id,
          code
        }
      },
      select: { id: true }
    });

    if (existing) {
      continue;
    }

    const customerEmail = shopifyOrder.customer?.email ?? shopifyOrder.email ?? null;
    const customerPhone = shopifyOrder.customer?.phone ?? shopifyOrder.phone ?? null;
    const customer = await prisma.customer.upsert({
      where: {
        companyId_code: {
          companyId: session.company.id,
          code: customerCode(shopifyOrder)
        }
      },
      create: {
        companyId: session.company.id,
        code: customerCode(shopifyOrder),
        name: customerName(shopifyOrder),
        email: customerEmail,
        phone: customerPhone,
        tags: ["shopify"],
        attributes: {
          source: "shopify",
          shopDomain,
          shopifyCustomerId: shopifyOrder.customer?.id ?? null
        },
        createdById: session.user.id,
        updatedById: session.user.id
      },
      update: {
        name: customerName(shopifyOrder),
        email: customerEmail,
        phone: customerPhone,
        active: true,
        deletedAt: null,
        updatedById: session.user.id
      }
    });

    const items = await Promise.all(
      shopifyOrder.lineItems.nodes.map(async (item) => {
        const sku = item.sku?.trim() || item.variant?.sku?.trim() || null;
        const product = sku
          ? await prisma.product.findUnique({
              where: {
                companyId_sku: {
                  companyId: session.company.id,
                  sku
                }
              },
              select: { id: true }
            })
          : null;
        const lineTotal = decimal(item.discountedTotalSet?.shopMoney?.amount);
        const unitPrice = decimal(item.originalUnitPriceSet?.shopMoney?.amount);

        return {
          companyId: session.company.id,
          productId: product?.id ?? null,
          description: item.title,
          quantity: item.quantity,
          unitPrice,
          total: lineTotal,
          metadata: {
            source: "shopify",
            sku,
            shopifyVariantId: item.variant?.id ?? null
          } satisfies Prisma.InputJsonObject
        };
      })
    );

    await prisma.order.create({
      data: {
        companyId: session.company.id,
        customerId: customer.id,
        code,
        status: OrderStatus.OPEN,
        subtotal: decimal(shopifyOrder.subtotalPriceSet?.shopMoney?.amount),
        discount: decimal(shopifyOrder.totalDiscountsSet?.shopMoney?.amount),
        tax: decimal(shopifyOrder.totalTaxSet?.shopMoney?.amount),
        total: decimal(shopifyOrder.totalPriceSet?.shopMoney?.amount),
        metadata: {
          source: "shopify",
          shopDomain,
          shopifyOrderId: shopifyOrder.id,
          shopifyOrderName: shopifyOrder.name,
          financialStatus: shopifyOrder.displayFinancialStatus ?? null,
          fulfillmentStatus: shopifyOrder.displayFulfillmentStatus ?? null,
          currencyCode: shopifyOrder.subtotalPriceSet?.shopMoney?.currencyCode ?? null,
          stockDeducted: false
        },
        createdById: session.user.id,
        updatedById: session.user.id,
        items: {
          create: items
        }
      }
    });
    imported += 1;
  }

  await writeAuditLog({
    companyId: session.company.id,
    actorId: session.user.id,
    action: AuditAction.CREATE,
    entityType: "ShopifyOrderSync",
    entityId: shopDomain,
    after: {
      imported,
      apiVersion
    },
    ipAddress: clientIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined
  });

  return NextResponse.redirect(
    redirectBackUrl(request, "/command/orders", { order: "shopify_synced", count: String(imported) }),
    303
  );
}
