/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as announcements from "../announcements.js";
import type * as auth from "../auth.js";
import type * as badges from "../badges.js";
import type * as campaigns from "../campaigns.js";
import type * as claimTokens from "../claimTokens.js";
import type * as coaching from "../coaching.js";
import type * as comments from "../comments.js";
import type * as crons from "../crons.js";
import type * as curriculum from "../curriculum.js";
import type * as discord from "../discord.js";
import type * as emails from "../emails.js";
import type * as events from "../events.js";
import type * as exerciseResponses from "../exerciseResponses.js";
import type * as exercises from "../exercises.js";
import type * as fireflies from "../fireflies.js";
import type * as google from "../google.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as lessons from "../lessons.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_events from "../lib/events.js";
import type * as lib_linking from "../lib/linking.js";
import type * as lib_supportFaq from "../lib/supportFaq.js";
import type * as lib_supportState from "../lib/supportState.js";
import type * as lib_supportTools from "../lib/supportTools.js";
import type * as lifecycle from "../lifecycle.js";
import type * as migrations from "../migrations.js";
import type * as modules from "../modules.js";
import type * as notes from "../notes.js";
import type * as notifications from "../notifications.js";
import type * as onboarding from "../onboarding.js";
import type * as onboardings from "../onboardings.js";
import type * as progress from "../progress.js";
import type * as purchases from "../purchases.js";
import type * as rateLimit from "../rateLimit.js";
import type * as reconcileCourse from "../reconcileCourse.js";
import type * as seedExerciseUrls from "../seedExerciseUrls.js";
import type * as segments from "../segments.js";
import type * as streaks from "../streaks.js";
import type * as stripe from "../stripe.js";
import type * as subscriptions from "../subscriptions.js";
import type * as support from "../support.js";
import type * as tickets from "../tickets.js";
import type * as tools from "../tools.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  announcements: typeof announcements;
  auth: typeof auth;
  badges: typeof badges;
  campaigns: typeof campaigns;
  claimTokens: typeof claimTokens;
  coaching: typeof coaching;
  comments: typeof comments;
  crons: typeof crons;
  curriculum: typeof curriculum;
  discord: typeof discord;
  emails: typeof emails;
  events: typeof events;
  exerciseResponses: typeof exerciseResponses;
  exercises: typeof exercises;
  fireflies: typeof fireflies;
  google: typeof google;
  health: typeof health;
  http: typeof http;
  lessons: typeof lessons;
  "lib/access": typeof lib_access;
  "lib/auth": typeof lib_auth;
  "lib/events": typeof lib_events;
  "lib/linking": typeof lib_linking;
  "lib/supportFaq": typeof lib_supportFaq;
  "lib/supportState": typeof lib_supportState;
  "lib/supportTools": typeof lib_supportTools;
  lifecycle: typeof lifecycle;
  migrations: typeof migrations;
  modules: typeof modules;
  notes: typeof notes;
  notifications: typeof notifications;
  onboarding: typeof onboarding;
  onboardings: typeof onboardings;
  progress: typeof progress;
  purchases: typeof purchases;
  rateLimit: typeof rateLimit;
  reconcileCourse: typeof reconcileCourse;
  seedExerciseUrls: typeof seedExerciseUrls;
  segments: typeof segments;
  streaks: typeof streaks;
  stripe: typeof stripe;
  subscriptions: typeof subscriptions;
  support: typeof support;
  tickets: typeof tickets;
  tools: typeof tools;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
