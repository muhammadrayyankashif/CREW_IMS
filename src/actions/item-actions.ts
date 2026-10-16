"use server";

import { db } from "@/db";
import { items, borrowRecords } from "@/db/schema";
import { requireAuth, requireAdmin } from "@/lib/session";
import { eq, and, sql, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import crypto from "crypto";

async function ensureIsToolColumn() {
  try {
    await db.execute(sql`ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "is_tool" boolean NOT NULL DEFAULT false;`);
  } catch {
    // Ignore if already exists or db offline
  }
}



export async function reconcileItemStock() {
  try {
    const allItems = await db.select().from(items);
    const activeBorrows = await db
      .select()
      .from(borrowRecords)
      .where(eq(borrowRecords.status, "BORROWED"));

    const itemBorrowedMap = new Map<string, number>();
    for (const b of activeBorrows) {
      itemBorrowedMap.set(b.itemId, (itemBorrowedMap.get(b.itemId) || 0) + b.quantity);
    }

    for (const item of allItems) {
      const borrowed = itemBorrowedMap.get(item.id) || 0;
      const expectedAvailable = Math.max(0, item.totalQuantity - borrowed);
      if (item.availableQuantity !== expectedAvailable) {
        await db
          .update(items)
          .set({ availableQuantity: expectedAvailable, updatedAt: new Date() })
          .where(eq(items.id, item.id));
      }
    }
  } catch (err) {
    console.error("Failed to reconcile item stock:", err);
  }
}

export async function getItems() {
  await ensureIsToolColumn();
  await reconcileItemStock();
  return await db.select().from(items).orderBy(desc(items.createdAt));
}

export async function createItem(formData: {
  name: string;
  description?: string;
  totalQuantity: number;
  isTool?: boolean;
}) {
  try {
    await requireAdmin();
    await ensureIsToolColumn();

    if (!formData.name.trim()) {
      return { success: false, error: "Item name is required." };
    }

    const quantity = Math.max(1, Number(formData.totalQuantity) || 1);

    const newItem = {
      id: crypto.randomUUID(),
      name: formData.name.trim(),
      description: formData.description?.trim() || "",
      totalQuantity: quantity,
      availableQuantity: quantity,
      isTool: Boolean(formData.isTool),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(items).values(newItem);
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    return { success: true, item: newItem };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to create item.";
    return { success: false, error: msg };
  }
}

export async function updateItem(
  id: string,
  formData: {
    name: string;
    description?: string;
    totalQuantity: number;
    availableQuantity: number;
    isTool?: boolean;
  }
): Promise<{ success: boolean; item?: typeof items.$inferSelect; error?: string }> {
  try {
    await requireAdmin();
    await ensureIsToolColumn();

    if (!formData.name.trim()) {
      return { success: false, error: "Item name cannot be empty." };
    }

    const total = Math.max(0, Number(formData.totalQuantity) || 0);
    const available = Math.max(0, Math.min(total, Number(formData.availableQuantity) || 0));

    const updated = {
      name: formData.name.trim(),
      description: formData.description?.trim() || "",
      totalQuantity: total,
      availableQuantity: available,
      isTool: Boolean(formData.isTool),
      updatedAt: new Date(),
    };

    const [result] = await db
      .update(items)
      .set(updated)
      .where(eq(items.id, id))
      .returning();

    revalidatePath("/admin");
    revalidatePath("/dashboard");
    return { success: true, item: result };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to update item.";
    return { success: false, error: msg };
  }
}

export async function deleteItem(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();

    // Check if active borrows exist for this item
    const activeBorrows = await db
      .select()
      .from(borrowRecords)
      .where(and(eq(borrowRecords.itemId, id), eq(borrowRecords.status, "BORROWED")));

    if (activeBorrows.length > 0) {
      return {
        success: false,
        error: `Cannot delete: ${activeBorrows.length} loan(s) currently active for this item. Mark them as returned first.`,
      };
    }

    await db.delete(items).where(eq(items.id, id));
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to delete item.";
    return { success: false, error: msg };
  }
}

export async function borrowItem(itemId: string, quantityToBorrow: number) {
  try {
    const session = await requireAuth();
    const userId = session.user.id;
    const qty = Math.max(1, Number(quantityToBorrow) || 1);

    // Fetch current item
    const [item] = await db.select().from(items).where(eq(items.id, itemId));
    if (!item) {
      return { success: false, error: "Item not found." };
    }

    if (item.availableQuantity < qty) {
      return {
        success: false,
        error: `Not enough stock available. Only ${item.availableQuantity} left.`,
      };
    }

    const newAvailable = item.availableQuantity - qty;

    // Deduct available quantity
    await db
      .update(items)
      .set({
        availableQuantity: newAvailable,
        updatedAt: new Date(),
      })
      .where(eq(items.id, itemId));

    // Insert borrow log
    const newRecordId = crypto.randomUUID();
    const newRecord = {
      id: newRecordId,
      userId: userId,
      itemId: itemId,
      quantity: qty,
      status: "BORROWED",
      borrowedAt: new Date(),
      returnedAt: null,
      notes: null,
    };

    await db.insert(borrowRecords).values(newRecord);

    revalidatePath("/admin");
    revalidatePath("/dashboard");
    return {
      success: true,
      record: {
        ...newRecord,
        item: {
          id: item.id,
          name: item.name,
          description: item.description,
          isTool: item.isTool,
        },
      },
      remainingStock: newAvailable,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to borrow item.";
    return { success: false, error: msg };
  }
}

export async function returnItem(recordId: string) {
  try {
    const session = await requireAuth();
    const currentUser = session.user as typeof session.user & { role?: string };

    // Fetch record
    const [record] = await db
      .select()
      .from(borrowRecords)
      .where(eq(borrowRecords.id, recordId));

    if (!record) {
      return { success: false, error: "Borrow record not found." };
    }

    if (record.status === "RETURNED") {
      return { success: false, error: "This item has already been marked as returned." };
    }

    // Authorization: user must own the record OR be an admin
    if (record.userId !== currentUser.id && currentUser.role !== "admin") {
      return { success: false, error: "Unauthorized: You can only return items you borrowed." };
    }

    const returnDate = new Date();

    // Update record status
    await db
      .update(borrowRecords)
      .set({
        status: "RETURNED",
        returnedAt: returnDate,
      })
      .where(eq(borrowRecords.id, recordId));

    // Restore item quantity
    await db
      .update(items)
      .set({
        availableQuantity: sql`${items.availableQuantity} + ${record.quantity}`,
        updatedAt: new Date(),
      })
      .where(eq(items.id, record.itemId));

    revalidatePath("/admin");
    revalidatePath("/dashboard");
    return {
      success: true,
      recordId,
      itemId: record.itemId,
      quantity: record.quantity,
      returnedAt: returnDate,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to return item.";
    return { success: false, error: msg };
  }
}
