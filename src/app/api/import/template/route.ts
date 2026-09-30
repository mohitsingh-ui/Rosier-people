import { apiViewer, json, tableFile } from "@/lib/api";
import { can } from "@/lib/auth/viewer";
import { companySettings } from "@/server/queries";

export async function GET(req: Request) {
  const v = await apiViewer();
  if (v instanceof Response) return v;
  if (!can(v, "people.import")) return json({ error: "Not allowed" }, 403);
  const format = new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "xlsx";
  return tableFile(format, "Rosier employee import template",
    ["Employee ID", "First Name", "Last Name", "Email", "Phone", "Department", "Designation", "Manager", "Location", "Joining Date", "Employment Type", "Status"],
    [["", "Kavya", "Sharma", "kavya.sharma@rosierfoods.com", "+91 90000 00000", "Marketing", "Content Strategist", "ROS-003", "Noida Studio", "2026-11-02", "FULL_TIME", "PREBOARDING"]],
    await companySettings());
}
