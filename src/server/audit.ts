import type { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "./db";

type AuditInput = {
  companyId: string;
  actorId?: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  changes?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
};

export async function writeAuditLog(input: AuditInput) {
  return prisma.auditLog.create({
    data: {
      companyId: input.companyId,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before,
      after: input.after,
      changes: input.changes ?? {},
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    }
  });
}
