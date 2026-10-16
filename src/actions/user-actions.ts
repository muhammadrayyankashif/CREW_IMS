"use server";

import { db } from "@/db";
import { user, account, borrowRecords } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { hashPassword } from "better-auth/crypto";
import { eq, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import crypto from "crypto";

export async function getUsers() {
  await requireAdmin();
  return await db.select().from(user).orderBy(desc(user.createdAt));
}

function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function createUser(data: {
  name: string;
  email: string;
}) {
  await requireAdmin();

  const emailClean = data.email.trim().toLowerCase();
  const nameClean = data.name.trim();

  if (!emailClean || !nameClean) {
    return { success: false, error: "Name and email are required." };
  }

  // Check if user already exists
  const [existing] = await db.select().from(user).where(eq(user.email, emailClean));
  if (existing) {
    return { success: false, error: "A user with this email already exists." };
  }

  const userId = crypto.randomUUID();
  const tempPin = generatePin();
  const pinHash = await hashPassword(tempPin);

  await db.insert(user).values({
    id: userId,
    name: nameClean,
    email: emailClean,
    role: "member", // Admins can only create members
    mustChangePassword: true,
    tempPin: tempPin,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await db.insert(account).values({
    id: crypto.randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId: userId,
    password: pinHash,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  revalidatePath("/admin");
  return {
    success: true,
    tempPin,
    user: { id: userId, name: nameClean, email: emailClean, role: "member" },
  };
}

export async function resetUserPin(userId: string) {
  await requireAdmin();

  const [targetUser] = await db.select().from(user).where(eq(user.id, userId));
  if (!targetUser) {
    return { success: false, error: "User not found." };
  }

  const newPin = generatePin();
  const pinHash = await hashPassword(newPin);

  // Update password in account
  await db
    .update(account)
    .set({
      password: pinHash,
      updatedAt: new Date(),
    })
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")));

  // Update tempPin on user record
  await db
    .update(user)
    .set({
      mustChangePassword: true,
      tempPin: newPin,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId));

  revalidatePath("/admin");
  return { success: true, tempPin: newPin };
}

export async function deleteUser(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAdmin();

    if (session.user.id === userId) {
      return { success: false, error: "You cannot delete your own admin account." };
    }

    // Check if member holds active items
    const activeLoans = await db
      .select()
      .from(borrowRecords)
      .where(and(eq(borrowRecords.userId, userId), eq(borrowRecords.status, "BORROWED")));

    if (activeLoans.length > 0) {
      return {
        success: false,
        error: `Cannot delete user: They currently hold ${activeLoans.length} borrowed item(s). Please have them returned first.`,
      };
    }

    await db.delete(user).where(eq(user.id, userId));
    revalidatePath("/admin");
    return { success: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to delete user.";
    return { success: false, error: msg };
  }
}
