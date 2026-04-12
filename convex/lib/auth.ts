import { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { DataModel } from "../_generated/dataModel";

export async function requireAdmin(ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Non authentifié");
  const user = await ctx.db.get(userId);
  if (!user || user.role !== "admin") throw new Error("Admin uniquement");
  return { userId, user };
}
