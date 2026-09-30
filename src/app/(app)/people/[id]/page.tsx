import { requireViewer } from "@/lib/auth/viewer";
import { EmployeeProfile } from "@/components/people/profile";
import { db } from "@/lib/db";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = await db.employee.findUnique({ where: { id }, select: { firstName: true, lastName: true } });
  return { title: e ? `${e.firstName} ${e.lastName}` : "Profile" };
}

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; month?: string }> }) {
  const v = await requireViewer();
  const { id } = await params;
  const sp = await searchParams;
  return <EmployeeProfile v={v} id={id} tab={sp.tab} month={sp.month} base={`/people/${id}`} />;
}
