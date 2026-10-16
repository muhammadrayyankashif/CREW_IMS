import { getServerSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { getItems } from "@/actions/item-actions";
import { getMyBorrowRecords } from "@/actions/log-actions";
import { MemberDashboardClient } from "@/components/MemberDashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
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

  const [items, records] = await Promise.all([
    getItems(),
    getMyBorrowRecords(),
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-black text-zinc-100">
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <MemberDashboardClient
          user={{
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
          }}
          initialItems={items}
          initialRecords={records}
        />
      </main>
    </div>
  );
}
