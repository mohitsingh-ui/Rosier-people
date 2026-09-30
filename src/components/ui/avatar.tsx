import { cn, initials } from "@/lib/utils";

const PALETTE = ["#784900", "#A56312", "#8A5A2B", "#6B4F3A", "#946B2D", "#7C5C45", "#5E4B3C", "#9C6B3F"];

export function EmployeeAvatar({ employee, size = 36, className }: { employee: { firstName: string; lastName: string; photoUrl?: string | null; id?: string }; size?: number; className?: string }) {
  const seed = (employee.id ?? employee.firstName).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const style = { width: size, height: size, fontSize: Math.max(10, size * 0.36) };
  if (employee.photoUrl)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={employee.photoUrl} alt="" style={style} className={cn("rounded-full object-cover ring-2 ring-white shrink-0", className)} />;
  return (
    <span aria-hidden style={{ ...style, background: `${PALETTE[seed % PALETTE.length]}1A`, color: PALETTE[seed % PALETTE.length] }} className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-white", className)}>
      {initials(employee)}
    </span>
  );
}
