"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { borrowItem, returnItem } from "@/actions/item-actions";
import { signOut } from "@/lib/auth-client";
import {
  Search,
  X,
  Loader2,
  LogOut,
  ArrowRight,
  Wrench,
  AlertTriangle,
} from "lucide-react";

interface Item {
  id: string;
  name: string;
  description: string | null;
  totalQuantity: number;
  availableQuantity: number;
  isTool?: boolean;
}

interface BorrowRecord {
  id: string;
  quantity: number;
  status: string;
  borrowedAt: Date;
  returnedAt: Date | null;
  notes: string | null;
  isOverdue?: boolean;
  item: {
    id: string;
    name: string;
    description: string | null;
    isTool?: boolean;
  };
}

interface MemberDashboardClientProps {
  user: {
    id: string;
    name: string;
    email: string;
    role?: string;
  };
  initialItems: Item[];
  initialRecords: BorrowRecord[];
}

export function MemberDashboardClient({
  user,
  initialItems,
  initialRecords,
}: MemberDashboardClientProps) {
  const router = useRouter();

  const [items, setItems] = useState<Item[]>(initialItems);
  const [records, setRecords] = useState<BorrowRecord[]>(initialRecords);

  // Sync state when props update
  const [prevItems, setPrevItems] = useState(initialItems);
  if (prevItems !== initialItems) {
    setPrevItems(initialItems);
    setItems(initialItems);
  }

  const [prevRecords, setPrevRecords] = useState(initialRecords);
  if (prevRecords !== initialRecords) {
    setPrevRecords(initialRecords);
    setRecords(initialRecords);
  }

  const [search, setSearch] = useState("");

  // Modals
  const [borrowModalItem, setBorrowModalItem] = useState<Item | null>(null);
  const [borrowQty, setBorrowQty] = useState<number>(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeBorrows = records.filter((r) => r.status === "BORROWED");
  const pastBorrows = records.filter((r) => r.status === "RETURNED");

  const filteredItems = items.filter((item) => {
    const query = search.toLowerCase();
    return (
      item.name.toLowerCase().includes(query) ||
      (item.description && item.description.toLowerCase().includes(query))
    );
  });

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
    router.refresh();
  };

  const handleOpenBorrowModal = (item: Item) => {
    setActionError(null);
    setBorrowQty(1);
    setBorrowModalItem(item);
  };

  const handleConfirmBorrow = () => {
    if (!borrowModalItem) return;
    setActionError(null);

    const targetItem = borrowModalItem;
    const requestedQty = borrowQty;

    startTransition(async () => {
      const res = await borrowItem(targetItem.id, requestedQty);
      if (!res.success) {
        setActionError(res.error || "Failed to borrow item.");
      } else {
        setItems((prev) =>
          prev.map((i) =>
            i.id === targetItem.id
              ? { ...i, availableQuantity: Math.max(0, i.availableQuantity - requestedQty) }
              : i
          )
        );

        const newRecord: BorrowRecord = {
          id: res.record?.id || Math.random().toString(),
          quantity: requestedQty,
          status: "BORROWED",
          borrowedAt: new Date(),
          returnedAt: null,
          notes: null,
          item: {
            id: targetItem.id,
            name: targetItem.name,
            description: targetItem.description,
            isTool: targetItem.isTool,
          },
        };
        setRecords((prev) => [newRecord, ...prev]);

        setActionSuccess(`Checked out ${requestedQty}x ${targetItem.name}`);
        setBorrowModalItem(null);
        setTimeout(() => setActionSuccess(null), 3000);
        router.refresh();
      }
    });
  };

  const handleReturn = async (record: BorrowRecord) => {
    setActionError(null);

    // Instant optimistic update (0ms delay)
    const returnTimestamp = new Date();
    setRecords((prev) =>
      prev.map((r) =>
        r.id === record.id ? { ...r, status: "RETURNED", returnedAt: returnTimestamp } : r
      )
    );

    setItems((prev) =>
      prev.map((i) =>
        i.id === record.item.id
          ? { ...i, availableQuantity: i.availableQuantity + record.quantity }
          : i
      )
    );

    setActionSuccess(`Returned "${record.item.name}"`);
    setTimeout(() => setActionSuccess(null), 3000);

    try {
      const res = await returnItem(record.id);
      if (!res.success) {
        setActionError(res.error || "Failed to return item.");
        setRecords((prev) =>
          prev.map((r) =>
            r.id === record.id ? { ...r, status: "BORROWED", returnedAt: null } : r
          )
        );
        setItems((prev) =>
          prev.map((i) =>
            i.id === record.item.id
              ? { ...i, availableQuantity: Math.max(0, i.availableQuantity - record.quantity) }
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

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Linear Style Header Bar */}
      <div className="flex items-center justify-between border-b border-zinc-900 pb-4 pt-2">
        <div className="flex items-center space-x-2 text-xs">
          <span className="font-semibold text-white tracking-tight">CREW</span>
          <span className="text-zinc-600">/</span>
          <span className="text-zinc-400">Equipment</span>
        </div>

        <div className="flex items-center space-x-3">
          <span className="text-xs font-mono text-zinc-500 hidden sm:inline">
            {user.email}
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

      {/* Section 1: Active Loans */}
      {activeBorrows.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-white flex items-center space-x-2">
              <span>Active Checkouts</span>
              <span className="font-mono text-[11px] px-1.5 py-0.2 rounded border border-zinc-800 text-amber-400">
                {activeBorrows.length}
              </span>
            </div>
          </div>

          <div className="border border-zinc-900 rounded-lg overflow-hidden bg-zinc-950/20">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-900 text-zinc-500 text-[11px] font-mono uppercase tracking-wider bg-zinc-950/60">
                <tr>
                  <th className="py-2 px-3 font-medium">Item</th>
                  <th className="py-2 px-3 text-center font-medium">Qty</th>
                  <th className="py-2 px-3 font-medium">Borrowed At</th>
                  <th className="py-2 px-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900 text-zinc-300">
                {activeBorrows.map((record) => {
                  const isTool = Boolean(record.item.isTool);
                  const isOverdue = Boolean(record.isOverdue);

                  return (
                    <tr
                      key={record.id}
                      className={`transition-colors ${
                        isOverdue
                          ? "bg-red-950/35 hover:bg-red-950/50"
                          : "hover:bg-zinc-900/30"
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-white">{record.item.name}</span>
                          {isTool && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/50">
                              <Wrench className="w-2.5 h-2.5" />
                              Tool
                            </span>
                          )}
                        </div>
                        {record.item.description && (
                          <div className="text-[11px] text-zinc-500 truncate max-w-sm mt-0.5">
                            {record.item.description}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-zinc-200">
                        {record.quantity}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-500" suppressHydrationWarning>
                        <div className="text-zinc-300">{new Date(record.borrowedAt).toLocaleDateString()}</div>
                        <div className="text-[10px] text-zinc-500">
                          {new Date(record.borrowedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => handleReturn(record)}
                          className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-800 text-[11px] font-mono transition-colors cursor-pointer"
                        >
                          Return
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Section 2: Catalog */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-medium text-white">Equipment Catalog</div>

          <div className="relative w-full max-w-xs">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search gear..."
              className="w-full bg-zinc-950 border border-zinc-900 rounded-md pl-8 pr-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
            />
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="border border-zinc-900 rounded-lg p-8 text-center text-zinc-600 font-mono text-xs">
            No equipment found.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredItems.map((item) => {
              const isAvailable = item.availableQuantity > 0;
              return (
                <div
                  key={item.id}
                  className="p-4 rounded-lg border border-zinc-900 bg-zinc-950/40 hover:border-zinc-800 transition-colors flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div>
                        <div className="flex items-center space-x-1.5">
                          <h3 className="font-medium text-white text-sm">
                            {item.name}
                          </h3>
                          {item.isTool && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-mono px-1 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/50">
                              <Wrench className="w-2.5 h-2.5" />
                              Tool
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="inline-flex items-center space-x-1.5 text-[11px] font-mono shrink-0">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isAvailable ? "bg-emerald-500" : "bg-zinc-600"
                          }`}
                        ></span>
                        <span className={isAvailable ? "text-zinc-300" : "text-zinc-600"}>
                          {isAvailable ? `${item.availableQuantity} left` : "Out of stock"}
                        </span>
                      </span>
                    </div>

                    <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
                      {item.description || "No description."}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-zinc-900/80 flex items-center justify-between">
                    <span className="text-[11px] font-mono text-zinc-600">
                      Total: {item.totalQuantity}
                    </span>
                    <button
                      onClick={() => handleOpenBorrowModal(item)}
                      disabled={!isAvailable}
                      className="px-2.5 py-1 rounded bg-white hover:bg-zinc-200 text-black text-xs font-medium transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Take Item
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 3: History */}
      {pastBorrows.length > 0 && (
        <section className="space-y-3 pt-4 border-t border-zinc-900">
          <div className="text-xs font-medium text-zinc-400">Return History</div>

          <div className="border border-zinc-900 rounded-lg overflow-hidden bg-zinc-950/20">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-900 text-zinc-500 text-[11px] font-mono uppercase tracking-wider bg-zinc-950/60">
                <tr>
                  <th className="py-2 px-3 font-medium">Item</th>
                  <th className="py-2 px-3 text-center font-medium">Qty</th>
                  <th className="py-2 px-3 font-medium">Borrowed</th>
                  <th className="py-2 px-3 font-medium">Returned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900 text-zinc-400">
                {pastBorrows.map((record) => (
                  <tr key={record.id} className="hover:bg-zinc-900/30 transition-colors">
                    <td className="py-2 px-3 text-zinc-300">{record.item.name}</td>
                    <td className="py-2 px-3 text-center font-mono">{record.quantity}</td>
                    <td className="py-2 px-3 font-mono text-[11px] text-zinc-500" suppressHydrationWarning>
                      <div className="text-zinc-300">{new Date(record.borrowedAt).toLocaleDateString()}</div>
                      <div className="text-[10px] text-zinc-500">
                        {new Date(record.borrowedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })}
                      </div>
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px] text-zinc-500" suppressHydrationWarning>
                      {record.returnedAt ? (
                        <>
                          <div className="text-zinc-300">{new Date(record.returnedAt).toLocaleDateString()}</div>
                          <div className="text-[10px] text-zinc-500">
                            {new Date(record.returnedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Checkout Modal */}
      {borrowModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 max-w-sm w-full shadow-2xl relative">
            <button
              onClick={() => setBorrowModalItem(null)}
              className="absolute right-4 top-4 text-zinc-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-sm font-semibold text-white mb-1">
              Checkout Equipment
            </h3>
            <p className="text-xs text-zinc-400 mb-4">{borrowModalItem.name}</p>

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 text-xs mb-4 space-y-1">
              <div className="flex justify-between font-mono">
                <span className="text-zinc-500">Available:</span>
                <span className="text-zinc-200">{borrowModalItem.availableQuantity} units</span>
              </div>
              {borrowModalItem.isTool && (
                <div className="mt-2 pt-2 border-t border-zinc-800/80 flex items-start gap-1.5 text-amber-400 text-[11px]">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>This item is classified as a <strong>Tool</strong>. It must be returned within <strong>6 hours</strong> or it will be flagged as overdue.</span>
                </div>
              )}
            </div>

            <div className="mb-5">
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                Quantity
              </label>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setBorrowQty((q) => Math.max(1, q - 1))}
                  className="w-8 h-8 rounded border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-mono text-sm flex items-center justify-center cursor-pointer"
                >
                  -
                </button>
                <div className="flex-1 text-center font-mono text-sm font-semibold text-white bg-zinc-900/60 py-1.5 rounded border border-zinc-800">
                  {borrowQty}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setBorrowQty((q) => Math.min(borrowModalItem.availableQuantity, q + 1))
                  }
                  className="w-8 h-8 rounded border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-mono text-sm flex items-center justify-center cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => setBorrowModalItem(null)}
                className="flex-1 py-1.5 px-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-medium text-xs rounded-md transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBorrow}
                disabled={isPending}
                className="flex-1 py-1.5 px-3 bg-white hover:bg-zinc-200 text-black font-medium text-xs rounded-md transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center space-x-1"
              >
                {isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <>
                    <span>Confirm</span>
                    <ArrowRight className="w-3 h-3" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
