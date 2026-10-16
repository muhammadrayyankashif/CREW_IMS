import { getServerSession } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getServerSession();

  if (!session || !session.user) {
    redirect("/login");
  }

  const user = session.user as typeof session.user & {
    role?: string;
    mustChangePassword?: boolean;
  };

  if (user.mustChangePassword) {
    redirect("/setup-password");
  }

  if (user.role === "admin") {
    redirect("/admin");
  }

  redirect("/dashboard");
}
