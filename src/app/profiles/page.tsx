import { redirect } from "next/navigation";
import { roleLabel } from "@/lib/roles";
import { getCurrentSession } from "@/server/session";
import { prisma } from "@/server/db";

type ProfilesPageProps = {
  searchParams?: Promise<{
    profile?: string;
  }>;
};

const profileMessages = {
  limit: "Puedes tener hasta 3 negocios por usuario.",
  invalid: "No pudimos crear el negocio. Revisa el nombre.",
  forbidden: "No tienes acceso a ese negocio.",
  deleted: "Negocio eliminado correctamente.",
  delete_invalid: "No pudimos identificar el negocio a eliminar.",
  delete_forbidden: "Solo un administrador o dueño puede eliminar ese negocio.",
  delete_last: "No puedes eliminar tu último negocio activo.",
  delete_password: "La contraseña no coincide.",
  delete_confirm: "Debes escribir ELIMINAR para confirmar."
} as const;

export default async function ProfilesPage({ searchParams }: ProfilesPageProps) {
  const session = await getCurrentSession();
  const params = await searchParams;

  if (!session) {
    redirect("/login");
  }

  const memberships = await prisma.membership.findMany({
    where: {
      userId: session.user.id,
      active: true,
      deletedAt: null,
      company: {
        active: true,
        deletedAt: null
      }
    },
    include: { company: true },
    orderBy: { createdAt: "asc" }
  });
  const canCreate = memberships.length < 3;
  const message = params?.profile ? profileMessages[params.profile as keyof typeof profileMessages] : undefined;

  return (
    <main className="min-h-screen bg-[#080d17] px-6 py-10 text-white">
      <section className="mx-auto max-w-6xl">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-300">Specter Command</p>
          <h1 className="mt-4 text-4xl font-semibold">Elige tu negocio</h1>
          <p className="mt-3 text-sm text-slate-400">
            Cada usuario puede manejar hasta 3 negocios, como perfiles independientes.
          </p>
        </div>

        {message ? (
          <p className="mx-auto mt-6 max-w-xl rounded-md border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {message}
          </p>
        ) : null}

        <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {memberships.map((membership) => {
            const canDelete = (membership.role === "OWNER" || membership.role === "ADMIN") && memberships.length > 1;
            return (
              <div key={membership.id} className="grid gap-2">
                <form action="/api/profiles/select" method="post">
                  <input type="hidden" name="companyId" value={membership.companyId} />
                  <button className="group grid aspect-square w-full place-items-center rounded-lg border border-white/10 bg-white/[0.04] p-5 text-center transition hover:border-cyan-300 hover:bg-cyan-300/10">
                    <span className="grid h-20 w-20 place-items-center rounded-lg bg-cyan-300 text-3xl font-semibold text-slate-950">
                      {membership.company.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span>
                      <strong className="mt-4 block text-lg">{membership.company.name}</strong>
                      <span className="mt-1 block text-sm text-slate-400">{roleLabel(membership.role)}</span>
                    </span>
                  </button>
                </form>
                {canDelete ? (
                  <form action="/api/profiles/delete" method="post" className="rounded-lg border border-red-400/20 bg-red-400/5 p-3">
                    <input type="hidden" name="companyId" value={membership.companyId} />
                    <p className="text-xs leading-5 text-red-100">
                      Para eliminar escribe ELIMINAR y confirma con tu contraseña.
                    </p>
                    <input
                      name="confirmation"
                      placeholder="ELIMINAR"
                      className="mt-2 w-full rounded-md border border-red-400/20 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-red-300"
                    />
                    <input
                      name="password"
                      type="password"
                      placeholder="Contraseña"
                      className="mt-2 w-full rounded-md border border-red-400/20 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-red-300"
                    />
                    <button className="mt-2 w-full rounded-md border border-red-400/40 px-3 py-2 text-sm text-red-100 hover:border-red-300 hover:bg-red-400/10">
                      Eliminar negocio
                    </button>
                  </form>
                ) : null}
              </div>
            );
          })}

          {canCreate ? (
            <form action="/api/profiles/create" method="post" className="grid aspect-square rounded-lg border border-dashed border-white/20 bg-white/[0.03] p-5">
              <div className="grid place-items-center text-center">
                <span className="grid h-20 w-20 place-items-center rounded-lg border border-cyan-300/40 text-4xl text-cyan-300">+</span>
                <strong className="mt-4 block text-lg">Agregar negocio</strong>
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="Nombre del negocio"
                  className="mt-4 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-cyan-300"
                />
                <button className="mt-3 rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200">
                  Crear
                </button>
              </div>
            </form>
          ) : (
            <div className="grid aspect-square place-items-center rounded-lg border border-white/10 bg-white/[0.03] p-5 text-center text-sm text-slate-400">
              Límite de 3 negocios alcanzado.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
