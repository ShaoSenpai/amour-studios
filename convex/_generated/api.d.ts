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
import type * as claimTokens from "../claimTokens.js";
import type * as comments from "../comments.js";
import type * as emails from "../emails.js";
import type * as exerciseResponses from "../exerciseResponses.js";
import type * as exercises from "../exercises.js";
import type * as http from "../http.js";
import type * as lessons from "../lessons.js";
import type * as lib_auth from "../lib/auth.js";
import type * as modules from "../modules.js";
import type * as notes from "../notes.js";
import type * as notifications from "../notifications.js";
import type * as onboarding from "../onboarding.js";
import type * as progress from "../progress.js";
import type * as purchases from "../purchases.js";
import type * as rateLimit from "../rateLimit.js";
import type * as reconcileCourse from "../reconcileCourse.js";
import type * as seedExerciseUrls from "../seedExerciseUrls.js";
import type * as streaks from "../streaks.js";
import type * as stripe from "../stripe.js";
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
  claimTokens: typeof claimTokens;
  comments: typeof comments;
  emails: typeof emails;
  exerciseResponses: typeof exerciseResponses;
  exercises: typeof exercises;
  http: typeof http;
  lessons: typeof lessons;
  "lib/auth": typeof lib_auth;
  modules: typeof modules;
  notes: typeof notes;
  notifications: typeof notifications;
  onboarding: typeof onboarding;
  progress: typeof progress;
  purchases: typeof purchases;
  rateLimit: typeof rateLimit;
  reconcileCourse: typeof reconcileCourse;
  seedExerciseUrls: typeof seedExerciseUrls;
  streaks: typeof streaks;
  stripe: typeof stripe;
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
