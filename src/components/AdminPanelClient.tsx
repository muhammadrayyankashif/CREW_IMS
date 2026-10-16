"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createItem, updateItem, deleteItem, returnItem } from "@/actions/item-actions";
import { createUser, deleteUser } from "@/actions/user-actions";
import { signOut } from "@/lib/auth-client";
import {
  Plus,
  Search,
  Check,
  Copy,
  X,
  Loader2,
  LogOut,
  Pencil,
  Trash2,
  Wrench,
} from "lucide-react";

interface Item {
  id: string;
  name: string;
  description: string | null;
  totalQuantity: number;
  availableQuantity: number;
  isTool?: boolean;
  createdAt: Date;
}

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
  tempPin: string | null;
  createdAt: Date;
}

interface BorrowLog {
  id: string;
  quantity: number;
  status: string;
  borrowedAt: Date;
  returnedAt: Date | null;
  notes: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  item: {
    id: string;
    name: string;
    isTool?: boolean;
  };
  isOverdue?: boolean;
}

interface Stats {
  totalProductTypes: number;
  totalItemsCount: number;
  availableItemsCount: number;
  borrowedItemsCount: number;
  activeBorrowersCount: number;
  totalUsersCount: number;
}

interface AdminPanelClientProps {
  currentUser: {
    id: string;
    name: string;
    email: string;
    role?: string;
  };
  initialItems: Item[];
  initialUsers: UserRecord[];
  initialLogs: BorrowLog[];
  initialStats: Stats;
}

export function AdminPanelClient({
  currentUser,
  initialItems,
  initialUsers,
  initialLogs,
  initialStats,
}: AdminPanelClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"inventory" | "logs" | "users">("inventory");

  // Real-time mutable states
  const [items, setItems] = useState<Item[]>(initialItems);
  const [users, setUsers] = useState<UserRecord[]>(initialUsers);
  const [logs, setLogs] = useState<BorrowLog[]>(initialLogs);
  const [stats, setStats] = useState<Stats>(initialStats);

  // Sync state when props update
  const [prevItems, setPrevItems] = useState(initialItems);
  if (prevItems !== initialItems) {
    setPrevItems(initialItems);
    setItems(initialItems);
  }

  const [prevUsers, setPrevUsers] = useState(initialUsers);
  if (prevUsers !== initialUsers) {
    setPrevUsers(initialUsers);
    setUsers(initialUsers);
  }

  const [prevLogs, setPrevLogs] = useState(initialLogs);
  if (prevLogs !== initialLogs) {
    setPrevLogs(initialLogs);
    setLogs(initialLogs);
  }

  const [prevStats, setPrevStats] = useState(initialStats);
  if (prevStats !== initialStats) {
    setPrevStats(initialStats);
    setStats(initialStats);
  }

  // Filters & Search
  const [itemSearch, setItemSearch] = useState("");
  const [logSearch, setLogSearch] = useState("");
  const [logFilter, setLogFilter] = useState<"ALL" | "BORROWED" | "RETURNED">("ALL");
  const [userSearch, setUserSearch] = useState("");

  // Modals
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [createdUserModalData, setCreatedUserModalData] = useState<{
    name: string;
    email: string;
    tempPin: string;
  } | null>(null);

  // Notifications
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Forms
  const [itemForm, setItemForm] = useState({
    name: "",
    description: "",
    totalQuantity: 1,
    availableQuantity: 1,
    isTool: false,
  });

  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
  });

  const notify = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 3000);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
    router.refresh();
  };

  // --- ITEM HANDLERS ---
  const handleOpenAddModal = () => {
    setItemForm({
      name: "",
      description: "",
      totalQuantity: 1,
      availableQuantity: 1,
      isTool: false,
    });
    setActionError(null);
    setIsAddItemOpen(true);
  };

  const handleOpenEditModal = (item: Item) => {
    setEditingItem(item);
    setItemForm({
      name: item.name,
      description: item.description || "",
      totalQuantity: item.totalQuantity,
      availableQuantity: item.availableQuantity,
      isTool: Boolean(item.isTool),
    });
    setActionError(null);
  };

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);

    startTransition(async () => {
      if (editingItem) {
        const res = await updateItem(editingItem.id, itemForm);
        if (!res.success) {
          setActionError(res.error || "Failed to update item.");
        } else {
          setItems((prev) =>
            prev.map((i) =>
              i.id === editingItem.id
                ? {
                    ...i,
                    name: itemForm.name,
                    description: itemForm.description,
                    totalQuantity: itemForm.totalQuantity,
                    availableQuantity: itemForm.availableQuantity,
                    isTool: itemForm.isTool,
                  }
                : i
            )
          );
          notify(`Updated "${itemForm.name}"`);
          setEditingItem(null);
          router.refresh();
        }
      } else {
        const res = await createItem(itemForm);
        if (!res.success) {
          setActionError(res.error || "Failed to create item.");
        } else {
          if (res.item) {
            setItems((prev) => [res.item, ...prev]);
            setStats((prev) => ({
              ...prev,
              totalItemsCount: prev.totalItemsCount + res.item.totalQuantity,
              availableItemsCount: prev.availableItemsCount + res.item.availableQuantity,
              totalProductTypes: prev.totalProductTypes + 1,
            }));
          }
          notify(`Created "${itemForm.name}"`);
          setIsAddItemOpen(false);
          router.refresh();
        }
      }
    });
  };

  const handleDeleteItem = (item: Item) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    setActionError(null);

    startTransition(async () => {
      const res = await deleteItem(item.id);
      if (!res.success) {
        setActionError(res.error || "Failed to delete item.");
      } else {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        setStats((prev) => ({
          ...prev,
          totalItemsCount: prev.totalItemsCount - item.totalQuantity,
          availableItemsCount: prev.availableItemsCount - item.availableQuantity,
          totalProductTypes: Math.max(0, prev.totalProductTypes - 1),
        }));
        notify(`Deleted "${item.name}"`);
        router.refresh();
      }
    });
  };

  // --- RETURN HANDLER (INSTANT) ---
  const handleAdminReturn = async (log: BorrowLog) => {
    setActionError(null);

    // Instant optimistic update
    const returnTimestamp = new Date();
    setLogs((prev) =>
      prev.map((l) =>
        l.id === log.id ? { ...l, status: "RETURNED", returnedAt: returnTimestamp } : l
      )
    );
    setItems((prev) =>
      prev.map((i) =>
        i.id === log.item.id ? { ...i, availableQuantity: i.availableQuantity + log.quantity } : i
      )
    );
    setStats((prev) => ({
      ...prev,
      availableItemsCount: prev.availableItemsCount + log.quantity,
      borrowedItemsCount: Math.max(0, prev.borrowedItemsCount - log.quantity),
    }));
    notify(`Marked "${log.item.name}" as returned`);

    try {
      const res = await returnItem(log.id);
      if (!res.success) {
        setActionError(res.error || "Failed to process return.");
        setLogs((prev) =>
          prev.map((l) =>
            l.id === log.id ? { ...l, status: "BORROWED", returnedAt: null } : l
          )
        );
        setItems((prev) =>
          prev.map((i) =>
            i.id === log.item.id
              ? { ...i, availableQuantity: Math.max(0, i.availableQuantity - log.quantity) }
              : i
          )
        );
      } else {
        router.refresh();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      setActionError(msg);
    }
  };

  // --- USER HANDLERS ---
  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);

    startTransition(async () => {
      const res = await createUser({ name: userForm.name, email: userForm.email });
      if (!res.success || !res.tempPin) {
        setActionError(res.error || "Failed to create member.");
      } else {
        setIsAddUserOpen(false);
        const newUser: UserRecord = {
          id: res.user.id,
          name: res.user.name,
          email: res.user.email,
          role: "member",
          mustChangePassword: true,
          tempPin: res.tempPin,
          createdAt: new Date(),
        };
        setUsers((prev) => [newUser, ...prev]);
        setStats((prev) => ({ ...prev, totalUsersCount: prev.totalUsersCount + 1 }));
        setCreatedUserModalData({
          name: userForm.name,
          email: userForm.email,
          tempPin: res.tempPin,
        });
        setUserForm({ name: "", email: "" });
        router.refresh();
      }
    });
  };

  const handleDeleteUser = (user: UserRecord) => {
    if (!confirm(`Delete user "${user.name}"?`)) return;
    setActionError(null);

    startTransition(async () => {
      const res = await deleteUser(user.id);
      if (!res.success) {
        setActionError(res.error || "Failed to delete user.");
      } else {
        setUsers((prev) => prev.filter((u) => u.id !== user.id));
        setStats((prev) => ({ ...prev, totalUsersCount: Math.max(0, prev.totalUsersCount - 1) }));
        notify(`Deleted user "${user.name}"`);
        router.refresh();
      }
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  // Queries
  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
    (item.description && item.description.toLowerCase().includes(itemSearch.toLowerCase()))
  );

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.item.name.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.user.name.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.user.email.toLowerCase().includes(logSearch.toLowerCase());
    const matchesFilter = logFilter === "ALL" || log.status === logFilter;
    return matchesSearch && matchesFilter;
  });

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Linear Style Header Bar */}
      <div className="flex items-center justify-between border-b border-zinc-900 pb-4 pt-2">
        <div className="flex items-center space-x-2 text-xs">
          <span className="font-semibold text-white tracking-tight">CREW</span>
          <span className="text-zinc-600">/</span>
          <span className="text-zinc-400">Inventory</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-zinc-800 text-zinc-400 ml-1.5">
            Admin
          </span>
        </div>

        <div className="flex items-center space-x-3">
          <span className="text-xs font-mono text-zinc-500 hidden sm:inline">
            {currentUser.email}
          </span>
          <button
            onClick={handleSignOut}
            className="text-xs text-zinc-400 hover:text-white px-2.5 py-1 rounded border border-zinc-900 hover:border-zinc-800 transition-colors flex items-center space-x-1.5 cursor-pointer"
          >
            <LogOut className="w-3 h-3" />
            <span>Sign out</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="py-2 px-3 rounded-md bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-zinc-500 hover:text-white cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {actionError && (
        <div className="py-2 px-3 rounded-md bg-zinc-950 border border-rose-900/60 text-xs text-rose-400 flex items-center justify-between font-mono">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-zinc-500 hover:text-white cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Linear Strip Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 border border-zinc-900 rounded-lg bg-zinc-950/40 divide-y sm:divide-y-0 sm:divide-x divide-zinc-900">
        <div className="p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Total Items</div>
          <div className="text-xl font-medium tracking-tight text-white mt-1">{stats.totalItemsCount}</div>
          <div className="text-[10px] text-zinc-600 font-mono mt-0.5">{stats.totalProductTypes} types</div>
        </div>
        <div className="p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Available</div>
          <div className="text-xl font-medium tracking-tight text-white mt-1">{stats.availableItemsCount}</div>
          <div className="text-[10px] text-zinc-600 font-mono mt-0.5">Ready for use</div>
        </div>
        <div className="p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Checked Out</div>
          <div className="text-xl font-medium tracking-tight text-zinc-200 mt-1">{stats.borrowedItemsCount}</div>
          <div className="text-[10px] text-zinc-600 font-mono mt-0.5">{stats.activeBorrowersCount} active holders</div>
        </div>
        <div className="p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Total Members</div>
          <div className="text-xl font-medium tracking-tight text-white mt-1">{stats.totalUsersCount}</div>
          <div className="text-[10px] text-zinc-600 font-mono mt-0.5">Accounts</div>
        </div>
      </div>

      {/* Minimal Tabs Navigation */}
      <div className="flex items-center space-x-1 border-b border-zinc-900 pb-px text-xs">
        <button
          onClick={() => setActiveTab("inventory")}
          className={`px-3 py-1.5 font-medium transition-colors cursor-pointer border-b -mb-px ${
            activeTab === "inventory"
              ? "border-white text-white"
              : "border-transparent text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Inventory ({items.length})
        </button>
        <button
          onClick={() => setActiveTab("logs")}
          className={`px-3 py-1.5 font-medium transition-colors cursor-pointer border-b -mb-px ${
            activeTab === "logs"
              ? "border-white text-white"
              : "border-transparent text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Checkouts & Logs ({logs.length})
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`px-3 py-1.5 font-medium transition-colors cursor-pointer border-b -mb-px ${
            activeTab === "users"
              ? "border-white text-white"
              : "border-transparent text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Members ({users.length})
        </button>
      </div>

      {/* --- TAB 1: INVENTORY --- */}
      {activeTab === "inventory" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="relative w-full max-w-xs">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Search items..."
                className="w-full bg-zinc-950 border border-zinc-900 rounded-md pl-8 pr-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
              />
            </div>

            <button
              onClick={handleOpenAddModal}
              className="bg-white hover:bg-zinc-200 text-black font-medium text-xs px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Item</span>
            </button>
          </div>

          <div className="border border-zinc-900 rounded-lg overflow-hidden bg-zinc-950/20">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-900 text-zinc-500 text-[11px] font-mono uppercase tracking-wider bg-zinc-950/60">
                <tr>
                  <th className="py-2.5 px-3 font-medium">Item</th>
                  <th className="py-2.5 px-3 font-medium text-center">Total</th>
                  <th className="py-2.5 px-3 font-medium text-center">Available</th>
                  <th className="py-2.5 px-3 font-medium text-center">In Use</th>
                  <th className="py-2.5 px-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900 text-zinc-300">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-zinc-600 font-mono text-xs">
                      No items found.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const inUse = item.totalQuantity - item.availableQuantity;
                    return (
                      <tr key={item.id} className="hover:bg-zinc-900/30 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center space-x-2">
                            <span className="font-medium text-white">{item.name}</span>
                            {item.isTool && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/50">
                                <Wrench className="w-2.5 h-2.5" />
                                Tool
                              </span>
                            )}
                          </div>
                          {item.description && (
                            <div className="text-[11px] text-zinc-500 truncate max-w-md mt-0.5">
                              {item.description}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-zinc-400">
                          {item.totalQuantity}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono">
                          <span className="inline-flex items-center space-x-1.5">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                item.availableQuantity > 0 ? "bg-emerald-500" : "bg-rose-500"
                              }`}
                            ></span>
                            <span className={item.availableQuantity > 0 ? "text-zinc-200" : "text-rose-400"}>
                              {item.availableQuantity}
                            </span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-zinc-400">
                          {inUse}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="inline-flex items-center space-x-1">
                            <button
                              onClick={() => handleOpenEditModal(item)}
                              className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
                              title="Edit item"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item)}
                              className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-900 transition-colors cursor-pointer"
                              title="Delete item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- TAB 2: CHECKOUTS & LOGS --- */}
      {activeTab === "logs" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="relative w-full max-w-xs">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Search checkouts..."
                className="w-full bg-zinc-950 border border-zinc-900 rounded-md pl-8 pr-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
              />
            </div>

            <div className="flex items-center space-x-1 text-xs">
              <button
                onClick={() => setLogFilter("ALL")}
                className={`px-2.5 py-1 rounded transition-colors cursor-pointer font-mono text-[11px] ${
                  logFilter === "ALL" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setLogFilter("BORROWED")}
                className={`px-2.5 py-1 rounded transition-colors cursor-pointer font-mono text-[11px] ${
                  logFilter === "BORROWED" ? "bg-zinc-900 text-amber-400" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                In-Use
              </button>
              <button
                onClick={() => setLogFilter("RETURNED")}
                className={`px-2.5 py-1 rounded transition-colors cursor-pointer font-mono text-[11px] ${
                  logFilter === "RETURNED" ? "bg-zinc-900 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Returned
              </button>
            </div>
          </div>

          <div className="border border-zinc-900 rounded-lg overflow-hidden bg-zinc-950/20">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-900 text-zinc-500 text-[11px] font-mono uppercase tracking-wider bg-zinc-950/60">
                <tr>
                  <th className="py-2.5 px-3 font-medium">Member</th>
                  <th className="py-2.5 px-3 font-medium">Item</th>
                  <th className="py-2.5 px-3 text-center font-medium">Qty</th>
                  <th className="py-2.5 px-3 font-medium">Borrowed</th>
                  <th className="py-2.5 px-3 font-medium">Status</th>
                  <th className="py-2.5 px-3 font-medium">Returned</th>
                  <th className="py-2.5 px-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900 text-zinc-300">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-zinc-600 font-mono text-xs">
                      No records found.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => {
                    const isActive = log.status === "BORROWED";
                    const isTool = Boolean(log.item.isTool);
                    const isOverdue = Boolean(log.isOverdue);

                    return (
                      <tr
                        key={log.id}
                        className={`transition-colors ${
                          isOverdue
                            ? "bg-red-950/35 hover:bg-red-950/50"
                            : "hover:bg-zinc-900/30"
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-white">{log.user.name}</div>
                          <div className="text-[11px] font-mono text-zinc-500">{log.user.email}</div>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-zinc-200">
                          <div className="flex items-center space-x-1.5">
                            <span>{log.item.name}</span>
                            {isTool && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/50">
                                <Wrench className="w-2.5 h-2.5" />
                                Tool
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-zinc-300">
                          {log.quantity}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-500" suppressHydrationWarning>
                          <div className="text-zinc-300">{new Date(log.borrowedAt).toLocaleDateString()}</div>
                          <div className="text-[10px] text-zinc-500">
                            {new Date(log.borrowedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="inline-flex items-center space-x-1.5 text-[11px] font-mono">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isActive
                                  ? isOverdue
                                    ? "bg-rose-500 animate-pulse"
                                    : "bg-amber-400"
                                  : "bg-zinc-600"
                              }`}
                            ></span>
                            <span
                              className={
                                isActive
                                  ? isOverdue
                                    ? "text-rose-400 font-semibold"
                                    : "text-amber-400"
                                  : "text-zinc-500"
                              }
                            >
                              {isActive ? "Active" : "Returned"}
                            </span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-500" suppressHydrationWarning>
                          {log.returnedAt ? (
                            <>
                              <div className="text-zinc-300">{new Date(log.returnedAt).toLocaleDateString()}</div>
                              <div className="text-[10px] text-zinc-500">
                                {new Date(log.returnedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })}
                              </div>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {isActive ? (
                            <button
                              onClick={() => handleAdminReturn(log)}
                              className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-800 text-[11px] font-mono transition-colors cursor-pointer"
                            >
                              Return
                            </button>
                          ) : (
                            <span className="text-zinc-600 text-xs font-mono">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- TAB 3: MEMBERS --- */}
      {activeTab === "users" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="relative w-full max-w-xs">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search members..."
                className="w-full bg-zinc-950 border border-zinc-900 rounded-md pl-8 pr-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
              />
            </div>

            <button
              onClick={() => {
                setActionError(null);
                setIsAddUserOpen(true);
              }}
              className="bg-white hover:bg-zinc-200 text-black font-medium text-xs px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Member</span>
            </button>
          </div>

          <div className="border border-zinc-900 rounded-lg overflow-hidden bg-zinc-950/20">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-900 text-zinc-500 text-[11px] font-mono uppercase tracking-wider bg-zinc-950/60">
                <tr>
                  <th className="py-2.5 px-3 font-medium">Name</th>
                  <th className="py-2.5 px-3 font-medium">Email</th>
                  <th className="py-2.5 px-3 text-center font-medium">Role</th>
                  <th className="py-2.5 px-3 font-medium">Status / PIN</th>
                  <th className="py-2.5 px-3 font-medium">Created</th>
                  <th className="py-2.5 px-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900 text-zinc-300">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-zinc-600 font-mono text-xs">
                      No members found.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelf = u.id === currentUser.id;
                    return (
                      <tr key={u.id} className="hover:bg-zinc-900/30 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-white">
                          <span className="inline-flex items-center space-x-1.5">
                            <span>{u.name}</span>
                            {isSelf && (
                              <span className="text-[10px] font-mono text-zinc-500">(you)</span>
                            )}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-zinc-400">{u.email}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="text-[11px] font-mono uppercase text-zinc-500">
                            {u.role}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          {u.mustChangePassword ? (
                            <span className="font-mono text-[11px] text-amber-400">
                              PIN: {u.tempPin || "Pending"}
                            </span>
                          ) : (
                            <span className="font-mono text-[11px] text-zinc-500">Active</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-500">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {!isSelf && (
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-900 transition-colors cursor-pointer"
                              title="Delete user"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- ADD / EDIT ITEM MODAL (MINIMAL) --- */}
      {(isAddItemOpen || editingItem) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 max-w-sm w-full shadow-2xl relative">
            <button
              onClick={() => {
                setIsAddItemOpen(false);
                setEditingItem(null);
              }}
              className="absolute right-4 top-4 text-zinc-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-sm font-semibold text-white mb-4">
              {editingItem ? "Edit Item" : "New Item"}
            </h3>

            <form onSubmit={handleSaveItem} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  required
                  value={itemForm.name}
                  onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                  placeholder="e.g. Sony Alpha A7 IV"
                  className="w-full bg-zinc-900/60 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={itemForm.description}
                  onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                  placeholder="Notes or details..."
                  className="w-full bg-zinc-900/60 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Total Qty
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={itemForm.totalQuantity}
                    onChange={(e) => {
                      const total = Math.max(1, parseInt(e.target.value) || 1);
                      setItemForm({
                        ...itemForm,
                        totalQuantity: total,
                        availableQuantity: editingItem
                          ? Math.min(itemForm.availableQuantity, total)
                          : total,
                      });
                    }}
                    className="w-full bg-zinc-900/60 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600 font-mono transition-colors"
                  />
                </div>

                {editingItem && (
                  <div>
                    <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                      Available
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={itemForm.totalQuantity}
                      required
                      value={itemForm.availableQuantity}
                      onChange={(e) =>
                        setItemForm({
                          ...itemForm,
                          availableQuantity: Math.min(
                            itemForm.totalQuantity,
                            Math.max(0, parseInt(e.target.value) || 0)
                          ),
                        })
                      }
                      className="w-full bg-zinc-900/60 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600 font-mono transition-colors"
                    />
                  </div>
                )}
              </div>

              <label className="flex items-center space-x-2.5 p-2.5 rounded-md bg-zinc-900/40 border border-zinc-800/80 cursor-pointer hover:bg-zinc-900/70 transition-colors">
                <input
                  type="checkbox"
                  checked={itemForm.isTool}
                  onChange={(e) => setItemForm({ ...itemForm, isTool: e.target.checked })}
                  className="rounded border-zinc-700 bg-zinc-950 text-white focus:ring-0 focus:ring-offset-0 cursor-pointer h-4 w-4"
                />
                <div className="flex-1">
                  <div className="text-[12px] font-medium text-zinc-200 flex items-center space-x-1.5">
                    <Wrench className="w-3.5 h-3.5 text-amber-400" />
                    <span>Tool item</span>
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    Flag active checkout if not returned within 6 hours
                  </div>
                </div>
              </label>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddItemOpen(false);
                    setEditingItem(null);
                  }}
                  className="flex-1 py-1.5 px-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-medium text-xs rounded-md transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 py-1.5 px-3 bg-white hover:bg-zinc-200 text-black font-medium text-xs rounded-md transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center space-x-1"
                >
                  {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <span>Save</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- ADD MEMBER MODAL --- */}
      {isAddUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 max-w-sm w-full shadow-2xl relative">
            <button
              onClick={() => setIsAddUserOpen(false)}
              className="absolute right-4 top-4 text-zinc-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-sm font-semibold text-white mb-4">
              Add Member
            </h3>

            <form onSubmit={handleCreateUser} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={userForm.name}
                  onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                  placeholder="e.g. Sarah Jenkins"
                  className="w-full bg-zinc-900/60 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  placeholder="sjenkins@crew.com"
                  className="w-full bg-zinc-900/60 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                />
              </div>

              <p className="text-[11px] text-zinc-500">
                A 6-digit PIN will be generated. The member will set their personal password upon first sign-in.
              </p>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddUserOpen(false)}
                  className="flex-1 py-1.5 px-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-medium text-xs rounded-md transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 py-1.5 px-3 bg-white hover:bg-zinc-200 text-black font-medium text-xs rounded-md transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center space-x-1"
                >
                  {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <span>Create Member</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- CREATED USER CREDENTIALS MODAL --- */}
      {createdUserModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 max-w-sm w-full shadow-2xl relative">
            <button
              onClick={() => setCreatedUserModalData(null)}
              className="absolute right-4 top-4 text-zinc-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-sm font-semibold text-white mb-2">
              Member Provisioned
            </h3>
            <p className="text-xs text-zinc-400 mb-4">
              Credentials for <span className="text-white">{createdUserModalData.name}</span>:
            </p>

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 space-y-1.5 text-xs font-mono mb-4">
              <div className="flex justify-between">
                <span className="text-zinc-500">Email:</span>
                <span className="text-zinc-200">{createdUserModalData.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Temp PIN:</span>
                <span className="text-white font-bold tracking-wider">{createdUserModalData.tempPin}</span>
              </div>
            </div>

            <button
              onClick={() => {
                const message = `Hello ${createdUserModalData.name},\n\nYour CREW Inventory Management System account has been created!\n\nEmail: ${createdUserModalData.email}\nTemporary PIN: ${createdUserModalData.tempPin}\n\nPlease sign in with your email and PIN, and you will be prompted to set your personal password.`;
                copyToClipboard(message);
              }}
              className="w-full py-1.5 px-3 rounded-md bg-white hover:bg-zinc-200 text-black font-medium text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer mb-2"
            >
              {copiedText ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Invitation Message</span>
                </>
              )}
            </button>

            <button
              onClick={() => setCreatedUserModalData(null)}
              className="w-full py-1.5 px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
