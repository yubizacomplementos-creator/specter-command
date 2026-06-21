import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionCookieName, verifySession } from "./auth";
import { prisma } from "./db";

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (!token) {
    return null;
  }

  try {
    const claims = await verifySession(token);
    const membership = await prisma.membership.findFirst({
      where: {
        userId: claims.sub,
        companyId: claims.companyId,
        active: true,
        deletedAt: null
      },
      include: {
        user: true,
        company: true
      }
    });

    if (!membership || !membership.user.active || membership.user.deletedAt || !membership.company.active || membership.company.deletedAt) {
      return null;
    }

    return {
      claims,
      user: membership.user,
      company: membership.company,
      role: membership.role
    };
  } catch {
    return null;
  }
}

export async function requireSession() {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}
