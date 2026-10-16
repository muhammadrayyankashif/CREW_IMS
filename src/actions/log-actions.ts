"use server";

import { db } from "@/db";
import { items, borrowRecords, user } from "@/db/schema";
import { requireAuth, requireAdmin } from "@/lib/session";
import { eq, desc } from "drizzle-orm";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export async function getAllBorrowLogs() {
  await requireAdmin();

  const logs = await db
    .select({
      id: borrowRecords.id,
      quantity: borrowRecords.quantity,
      status: borrowRecords.status,
      borrowedAt: borrowRecords.borrowedAt,
      returnedAt: borrowRecords.returnedAt,
      notes: borrowRecords.notes,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      item: {
        id: items.id,
        name: items.name,
        isTool: items.isTool,
      },
    })
    .from(borrowRecords)
    .innerJoin(user, eq(borrowRecords.userId, user.id))
    .innerJoin(items, eq(borrowRecords.itemId, items.id))
    .orderBy(desc(borrowRecords.borrowedAt));

  const now = Date.now();
  return logs.map((l) => ({
    ...l,
    isOverdue:
      Boolean(l.item.isTool) &&
      l.status === "BORROWED" &&
      now - new Date(l.borrowedAt).getTime() > SIX_HOURS_MS,
  }));
}

export async function getMyBorrowRecords() {
  const session = await requireAuth();
  const userId = session.user.id;

  const records = await db
    .select({
      id: borrowRecords.id,
      quantity: borrowRecords.quantity,
      status: borrowRecords.status,
      borrowedAt: borrowRecords.borrowedAt,
      returnedAt: borrowRecords.returnedAt,
      notes: borrowRecords.notes,
      item: {
        id: items.id,
        name: items.name,
        description: items.description,
        isTool: items.isTool,
      },
    })
    .from(borrowRecords)
    .innerJoin(items, eq(borrowRecords.itemId, items.id))
    .where(eq(borrowRecords.userId, userId))
    .orderBy(desc(borrowRecords.borrowedAt));

  const now = Date.now();
  return records.map((r) => ({
    ...r,
    isOverdue:
      Boolean(r.item.isTool) &&
      r.status === "BORROWED" &&
      now - new Date(r.borrowedAt).getTime() > SIX_HOURS_MS,
  }));
}

export async function getDashboardStats() {
  await requireAdmin();

  const allItems = await db.select().from(items);
  const allUsers = await db.select().from(user);
  const activeBorrows = await db
    .select()
    .from(borrowRecords)
    .where(eq(borrowRecords.status, "BORROWED"));

  const totalItemsCount = allItems.reduce((acc, curr) => acc + curr.totalQuantity, 0);
  const borrowedItemsCount = activeBorrows.reduce((acc, curr) => acc + curr.quantity, 0);
  const availableItemsCount = Math.max(0, totalItemsCount - borrowedItemsCount);
  const distinctBorrowersCount = new Set(activeBorrows.map((b) => b.userId)).size;

  return {
    totalProductTypes: allItems.length,
    totalItemsCount,
    availableItemsCount,
    borrowedItemsCount,
    activeBorrowersCount: distinctBorrowersCount,
    totalUsersCount: allUsers.length,
  };
}
