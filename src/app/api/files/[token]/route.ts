import { NextResponse } from "next/server";
import { storage, verifyFileToken } from "@/lib/storage";

// Serves private files for the local storage driver. The token is an HMAC-signed,
// 5-minute grant issued only after a server-side permission check.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const f = verifyFileToken(token);
  if (!f) return NextResponse.json({ error: "This link has expired." }, { status: 403 });
  try {
    const body = await (await storage()).get(f.k);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": f.t, "Content-Disposition": `${f.d}; filename="${encodeURIComponent(f.n)}"`, "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
