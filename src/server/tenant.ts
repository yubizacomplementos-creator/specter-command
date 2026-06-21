import type { MembershipRole } from "@prisma/client";
import { prisma } from "./db";

export type TenantContext = {
  companyId: string;
  userId: string;
  role: MembershipRole;
};

export async function assertTenantMembership(context: TenantContext) {
  const membership = await prisma.membership.findFirst({
    where: {
      companyId: context.companyId,
      userId: context.userId,
      role: context.role,
      active: true,
      deletedAt: null
    }
  });

  if (!membership) {
    throw new Error("El usuario no tiene acceso activo a esta empresa.");
  }

  return membership;
}

export function tenantWhere(companyId: string) {
  return {
    companyId,
    active: true,
    deletedAt: null
  };
}
