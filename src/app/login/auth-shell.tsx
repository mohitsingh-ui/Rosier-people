import { Logo } from "@/components/layout/logo";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="hidden lg:flex flex-col justify-between bg-brand text-canvas p-12 relative overflow-hidden">
        <div className="flex items-center gap-2.5">
          <span className="size-9 rounded-[11px] bg-canvas/10 grid place-items-center text-[17px] font-semibold">R</span>
          <span className="font-semibold tracking-tight">Rosier Foods</span>
        </div>
        <div className="relative z-10 max-w-md">
          <p className="accent text-[42px] leading-[1.15] text-cream">Rosier Parivaar</p>
          <p className="mt-4 text-[17px] text-canvas/85 leading-relaxed">Your leave, attendance, payslips and documents — all in one calm place. Check in, apply, download, done.</p>
          <p className="mt-8 text-[12.5px] uppercase tracking-[0.14em] text-cream/70">People. Culture. Growth.</p>
        </div>
        <svg className="absolute -right-24 -bottom-24 opacity-[0.09]" width="460" height="460" viewBox="0 0 200 200" aria-hidden>
          <circle cx="100" cy="100" r="96" fill="none" stroke="#F7F4ED" strokeWidth="1.2" />
          <circle cx="100" cy="100" r="70" fill="none" stroke="#F7F4ED" strokeWidth="1.2" />
          <circle cx="100" cy="100" r="44" fill="none" stroke="#F7F4ED" strokeWidth="1.2" />
          {Array.from({ length: 16 }).map((_, i) => <ellipse key={i} cx="100" cy="30" rx="8" ry="22" fill="none" stroke="#F7F4ED" strokeWidth="1.2" transform={`rotate(${i * 22.5} 100 100)`} />)}
        </svg>
        <p className="text-[12px] text-canvas/60 relative z-10">© {new Date().getFullYear()} Rosier Foods Private Limited</p>
      </aside>
      <section className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <div className="w-full max-w-sm mx-auto">
          <Logo className="mb-10 lg:hidden" />
          {children}
        </div>
      </section>
    </main>
  );
}
