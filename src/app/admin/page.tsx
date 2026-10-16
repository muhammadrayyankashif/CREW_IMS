import { getServerSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { getItems } from "@/actions/item-actions";
import { getUsers } from "@/actions/user-actions";
import { getAllBorrowLogs, getDashboardStats } from "@/actions/log-actions";
import { AdminPanelClient } from "@/components/AdminPanelClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
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

  if (user.role !== "admin") {
    redirect("/dashboard");
  }

  const [items, users, logs, stats] = await Promise.all([
    getItems(),
    getUsers(),
    getAllBorrowLogs(),
    getDashboardStats(),
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-black text-zinc-100">
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AdminPanelClient
          currentUser={{
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
          }}
          initialItems={items}
          initialUsers={users}
          initialLogs={logs}
          initialStats={stats}
        />
      </main>
    </div>
  );
}
