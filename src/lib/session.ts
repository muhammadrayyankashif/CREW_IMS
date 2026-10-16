import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function getServerSession() {
  const reqHeaders = await headers();
  return auth.api.getSession({
    headers: reqHeaders,
  });
}

export async function requireAuth() {
  const session = await getServerSession();
  if (!session || !session.user) {
    throw new Error("Unauthorized: Please sign in");
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireAuth();
  // Check role from session.user
  const user = session.user as typeof session.user & { role?: string };
  if (user.role !== "admin") {
    throw new Error("Forbidden: Admin access required");
  }
  return session;
}
