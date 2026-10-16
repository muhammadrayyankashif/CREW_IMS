"use server";

import { db } from "@/db";
import { user, account } from "@/db/schema";
import { requireAuth } from "@/lib/session";
import { hashPassword } from "better-auth/crypto";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

export async function setupInitialPassword(newPassword: string) {
  const session = await requireAuth();
  const userId = session.user.id;

  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: "Password must be at least 6 characters long." };
  }

  const hashedPassword = await hashPassword(newPassword);

  // Update password in the credential account row
  await db
    .update(account)
    .set({
      password: hashedPassword,
      updatedAt: new Date(),
    })
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")));

  // Update user flags
  await db
    .update(user)
    .set({
      mustChangePassword: false,
      tempPin: null,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId));

  return { success: true };
}

export async function syncAdminAccount() {
  const newEmail = "admin@crew.com";
  const legacyEmails = ["admin@cedarcrew.com", "admin@cedarscrew.org"];

  try {
    // 1. If admin with new email already exists, all good
    const [existingNew] = await db.select().from(user).where(eq(user.email, newEmail));
    if (existingNew) {
      return { success: true, updated: false };
    }

    // 2. Check if any legacy admin exists, migrate email to newEmail
    for (const legacyEmail of legacyEmails) {
      const [legacy] = await db.select().from(user).where(eq(user.email, legacyEmail));
      if (legacy) {
        await db
          .update(user)
          .set({
            email: newEmail,
            updatedAt: new Date(),
          })
          .where(eq(user.id, legacy.id));
        return { success: true, updated: true };
      }
    }

    // 3. If neither exists, create default admin account
    const adminId = crypto.randomUUID();
    const adminPasswordHash = await hashPassword("admin123456");

    await db.insert(user).values({
      id: adminId,
      name: "CREW Admin",
      email: newEmail,
      emailVerified: true,
      role: "admin",
      mustChangePassword: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: adminId,
      providerId: "credential",
      userId: adminId,
      password: adminPasswordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { success: true, created: true };
  } catch (err) {
    console.error("Failed to sync admin account:", err);
    return { success: false, error: err instanceof Error ? err.message : "Error" };
  }
}

