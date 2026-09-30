import { z } from "zod";
import { apiViewer, json } from "@/lib/api";
import { assist } from "@/server/assist";

export async function POST(req: Request) {
  const v = await apiViewer(30);
  if (v instanceof Response) return v;
  const body = z.object({ message: z.string().min(1).max(400) }).safeParse(await req.json().catch(() => ({})));
  if (!body.success) return json({ error: "Ask a question (up to 400 characters)." }, 400);
  try {
    return json(await assist(v, body.data.message));
  } catch (e) {
    console.error("[assist]", e);
    return json({ answer: "Something went wrong looking that up. Try again in a moment." });
  }
}
