"use node";

import Anthropic from "@anthropic-ai/sdk";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { buildSystemPrompt, type SupportMode } from "./lib/supportFaq";
import { TOOL_DEFS, ACTION_TOOL_NAMES } from "./lib/supportTools";

const MODEL = "claude-haiku-4-5";
// Nb max d'échanges membre↔IA avant escalade auto (garde-fou coût/qualité). 2 était
// trop bas (escalade quasi immédiate) ; 6 permet un vrai aller-retour avant la main humaine.
const MAX_TURNS = 6;

type Decision = {
  action: "reply" | "escalate" | "disabled";
  mode?: SupportMode;
  message?: string;
  reason?: string;
  confidence?: number;
  toolsUsed: string[];
  inputTokens: number;
  outputTokens: number;
};

export const handleSupportMessage = internalAction({
  args: {
    channelId: v.string(),
    discordId: v.string(),
    username: v.optional(v.string()),
    content: v.string(),
    source: v.union(v.literal("support_prefilter"), v.literal("ticket")),
    isAdmin: v.boolean(),
    memberEmail: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Decision> => {
    if (process.env.AI_SUPPORT_ENABLED !== "true") return emptyDecision("disabled");
    const mode = (process.env.AI_SUPPORT_MODE ?? "shadow") as SupportMode;

    const thread = await ctx.runMutation(internal.support.getOrCreateThread, {
      channelId: args.channelId,
      discordId: args.discordId,
      username: args.username,
      source: args.source,
    });
    if (!thread) return emptyDecision("disabled");

    if (args.isAdmin) {
      await ctx.runMutation(internal.support.applyEvent, {
        threadId: thread._id,
        event: "admin_message",
      });
      return emptyDecision("disabled");
    }
    // Réouverture : un fil marqué "résolu" qui reçoit un nouveau message membre
    // est réactivé (sinon il resterait muet). Reset du compteur de tours.
    if (thread.status === "resolved") {
      await ctx.runMutation(internal.support.reactivateThread, { threadId: thread._id });
      thread.status = "ai_active";
      thread.turnCount = 0;
    }
    if (thread.status !== "ai_active") return emptyDecision("disabled");

    const allowed = await ctx.runMutation(internal.support.checkMemberRateLimit, {
      discordId: args.discordId,
      maxPerMinute: 5,
    });
    if (!allowed) {
      await ctx.runMutation(internal.support.logSupportEvent, {
        type: "support.rate_limited",
        title: "Membre rate-limité (throttle, sans ticket)",
        discordId: args.discordId,
      });
      // Throttle DOUX : on ralentit sans créer de ticket (évite les tickets inutiles).
      return {
        action: "reply", mode, reason: "rate_limited",
        message: "Tu vas un peu vite 🙂 Laisse-moi une minute puis repose ta question — je suis là.",
        toolsUsed: [], inputTokens: 0, outputTokens: 0,
      };
    }

    await ctx.runMutation(internal.support.appendMessage, {
      threadId: thread._id, channelId: args.channelId, role: "user", content: args.content,
    });
    await ctx.runMutation(internal.support.applyEvent, {
      threadId: thread._id, event: "member_message", incrementTurn: true,
    });
    if (thread.turnCount + 1 > MAX_TURNS) {
      return {
        action: "escalate", mode, reason: "max_turns",
        message: "Je préfère te passer à l'équipe pour bien t'aider.",
        toolsUsed: [], inputTokens: 0, outputTokens: 0,
      };
    }

    const history = await ctx.runQuery(internal.support.recentMessages, {
      threadId: thread._id, limit: 12,
    });
    const messages: Anthropic.MessageParam[] = history
      .filter((m: any) => m.role !== "system")
      .map((m: any) => ({ role: m.role, content: m.content }));
    if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
      messages.push({ role: "user", content: args.content });
    }

    // --- Plafond quotidien de tokens (Task 5.1) ---
    const dailyCap = Number(process.env.AI_SUPPORT_DAILY_TOKEN_CAP ?? "0");
    if (dailyCap > 0) {
      const spent = await ctx.runQuery(internal.support.todayTokenSpend, {});
      if (spent >= dailyCap) {
        await ctx.runAction(internal.discord.postAlertToStaff, {
          content: `⚠️ Plafond de tokens IA support atteint (${spent}/${dailyCap}). L'IA escalade jusqu'à demain.`,
        }).catch(() => {});
        return {
          action: "escalate", mode, reason: "daily_cap",
          message: "Je passe le relais à l'équipe (limite quotidienne atteinte).",
          toolsUsed: [], inputTokens: 0, outputTokens: 0,
        };
      }
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const system = [
      { type: "text" as const, text: buildSystemPrompt({ mode }), cache_control: { type: "ephemeral" as const } },
    ];

    const toolsUsed: string[] = [];
    let inputTokens = 0;
    let outputTokens = 0;

    for (let iter = 0; iter < 6; iter++) {
      const resp = await client.messages.create({
        model: MODEL, max_tokens: 1024, system, tools: TOOL_DEFS as any, messages,
      });
      inputTokens += resp.usage.input_tokens + ((resp.usage as any).cache_read_input_tokens ?? 0);
      outputTokens += resp.usage.output_tokens;

      // Enregistre la dépense de tokens par itération (idempotent si erreur après).
      await ctx.runMutation(internal.support.addTokenSpend, {
        tokens: resp.usage.input_tokens + ((resp.usage as any).cache_read_input_tokens ?? 0) + resp.usage.output_tokens,
      });

      const toolUses = resp.content.filter((b: any) => b.type === "tool_use");

      const reply = toolUses.find((b: any) => b.name === "reply");
      if (reply) {
        const input = (reply as any).input ?? {};
        toolsUsed.push("reply");
        return {
          action: "reply", mode, message: String(input.message ?? ""),
          confidence: typeof input.confidence === "number" ? input.confidence : undefined,
          toolsUsed, inputTokens, outputTokens,
        };
      }
      const esc = toolUses.find((b: any) => b.name === "escalate");
      if (esc) {
        const input = (esc as any).input ?? {};
        toolsUsed.push("escalate");
        return {
          action: "escalate", mode, reason: String(input.reason ?? "unspecified"),
          message: input.memberMessage ? String(input.memberMessage) : "Je passe le relais à l'équipe, elle va te répondre ici.",
          toolsUsed, inputTokens, outputTokens,
        };
      }

      if (toolUses.length === 0) {
        return {
          action: "escalate", mode, reason: "no_tool_decision",
          message: "Je passe le relais à l'équipe pour être sûr de bien t'aider.",
          toolsUsed, inputTokens, outputTokens,
        };
      }

      messages.push({ role: "assistant", content: resp.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses as any[]) {
        if (!(ACTION_TOOL_NAMES as readonly string[]).includes(tu.name)) continue;
        toolsUsed.push(tu.name);
        const out = await ctx.runAction(internal.support.runSafeTool, {
          tool: tu.name, discordId: args.discordId, email: args.memberEmail,
        });
        results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
      }
      messages.push({ role: "user", content: results });
    }

    return {
      action: "escalate", mode, reason: "loop_exhausted",
      message: "Je passe le relais à l'équipe.",
      toolsUsed, inputTokens, outputTokens,
    };
  },
});

function emptyDecision(action: "disabled"): Decision {
  return { action, toolsUsed: [], inputTokens: 0, outputTokens: 0 };
}
