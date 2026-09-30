import "server-only";
import bcrypt from "bcryptjs";

export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

let dummy: string | null = null;
/** Burns the same time as a real check so unknown accounts can't be detected by timing. */
export async function verifyDummy(plain: string) {
  dummy ??= await bcrypt.hash("rosier-timing-equaliser", 12);
  await bcrypt.compare(plain, dummy);
  return false;
}

export function passwordProblems(p: string): string | null {
  if (p.length < 10) return "Use at least 10 characters.";
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return "Mix letters and numbers.";
  return null;
}
