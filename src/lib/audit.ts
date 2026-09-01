import { prisma } from "./db";

export function logAction(args: {
  userId: string;
  action: string;
  entity?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.auditLog
    .create({
      data: {
        userId: args.userId,
        action: args.action,
        entity: args.entity,
        entityId: args.entityId,
        metadata: args.metadata as never,
      },
    })
    .catch(() => null);
}
