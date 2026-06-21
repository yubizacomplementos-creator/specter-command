import Link from "next/link";
import type { MembershipRole } from "@prisma/client";
import type { ReactNode } from "react";

type CommandShellProps = {
  children: ReactNode;
  companyName: string;
  userEmail: string;
  role: MembershipRole;
};

const navItems = [
  ["Resumen", "/command"],
  ["Clientes", "/command/customers"],
  ["Productos", "/command/products"],
  ["Pedidos", "/command#pedidos"],
  ["Inventario", "/command#inventario"],
  ["Reportes", "/command#reportes"],
  ["Integraciones", "/command#integraciones"]
] as const;

export function CommandShell({ children, companyName, userEmail, role }: CommandShellProps) {
  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        <aside className="border-r border-slate-200 bg-white px-5 py-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">Specter</p>
            <h1 className="mt-2 text-xl font-semibold">{companyName}</h1>
            <p className="mt-1 text-sm text-slate-500">{role}</p>
          </div>

          <nav className="mt-8 grid gap-1">
            {navItems.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              >
                {label}
              </Link>
            ))}
          </nav>

          <form action="/api/auth/logout" method="post" className="mt-8">
            <button className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:border-cyan-600 hover:text-cyan-700">
              Salir
            </button>
          </form>
        </aside>

        <section>
          <header className="border-b border-slate-200 bg-white px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">Centro operativo</p>
                <h2 className="text-2xl font-semibold text-slate-950">Panel de control</h2>
              </div>
              <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">{userEmail}</p>
            </div>
          </header>
          <div className="px-6 py-6">{children}</div>
        </section>
      </div>
    </main>
  );
}
