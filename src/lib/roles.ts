import type { MembershipRole } from "@prisma/client";

export const roleLabels: Record<MembershipRole, string> = {
  OWNER: "Dueño",
  ADMIN: "Administrador",
  OPERATOR: "Operador",
  VIEWER: "Visualizador"
};

export function roleLabel(role: MembershipRole) {
  return roleLabels[role] ?? role;
}
