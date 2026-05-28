import { z } from "zod";

const httpUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((value) => /^https?:\/\//i.test(value), "must_be_http_or_https_url");

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(6),
  fullName: z.string().trim().min(1).max(200).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().trim().min(1).max(256),
});

export const predictionSchema = z.object({
  matchId: z.string().min(1),
  scoreA: z.number().int().min(0).max(20),
  scoreB: z.number().int().min(0).max(20),
});

export const chatSchema = z.object({
  prompt: z.string().min(1).max(4000),
});

export const adminCreateUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(6),
  fullName: z.string().trim().min(1).max(200).optional(),
  role: z.enum(["member", "org_admin"]).optional(),
});

export const adminUpdateUserSchema = z.object({
  fullName: z.string().trim().min(1).max(200).optional(),
  role: z.enum(["member", "org_admin"]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export const platformCreateCompanySchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  adminEmail: z.string().trim().toLowerCase().email().max(320),
  adminPassword: z.string().min(6),
  seatLimit: z.number().int().min(1).max(100000).optional().default(50),
});

export const companyCompetitionScopeSchema = z.enum(["football", "f1", "all"]);

export const platformPatchCompanySchema = z
  .object({
    seatLimit: z.number().int().min(1).max(100000).optional(),
    competitionLimit: z.number().int().min(1).max(10000).nullable().optional(),
    competitionScope: companyCompetitionScopeSchema.optional(),
  })
  .refine(
    (data) =>
      data.seatLimit !== undefined ||
      data.competitionLimit !== undefined ||
      data.competitionScope !== undefined,
    { message: "at_least_one_field" }
  );

export const platformSettingsSchema = z.object({
  defaultCompetitionScope: companyCompetitionScopeSchema,
});

export const adminCompanyConfigSchema = z.object({
  anonymizationEnabled: z.boolean().optional(),
  competitionScope: companyCompetitionScopeSchema.optional(),
});

export const createCompetitionSchema = z.object({
  name: z.string().trim().min(2).max(25),
  maxMembers: z.number().int().min(2).max(500),
  description: z.string().trim().max(90).optional().nullable(),
  discipline: z.enum(["football", "f1"]).optional().default("football"),
});

export const patchCompetitionSchema = z.object({
  name: z.string().trim().min(2).max(25).optional(),
  description: z.string().trim().max(90).nullable().optional(),
});

export const joinCompetitionCodeSchema = z.object({
  code: z.string().min(4).max(80),
});

export const inviteCompetitionMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
});

export const platformResetOrgAdminPasswordSchema = z.object({
  newPassword: z.string().min(6),
});

export const orgInviteSchema = z.object({
  emails: z.array(z.string().trim().toLowerCase().email().max(320)).min(1).max(100),
});

export const inviteAcceptSchema = z.object({
  token: z.string().trim().min(10).max(512),
  password: z.string().min(6),
  fullName: z.string().trim().min(1).max(200).optional(),
});

export const updateMeSchema = z.object({
  fullName: z.string().trim().min(1).max(200).optional(),
  password: z.string().min(6).optional(),
});

export const prodeGuidelinesSchema = z.object({
  groups: z.string().max(2000),
  roundOf32: z.string().max(2000),
  knockout: z.string().max(2000),
});

export const matchResultSchema = z.object({
  resultScoreA: z.number().int().min(0).max(20),
  resultScoreB: z.number().int().min(0).max(20),
});

export const adminAiConfigSchema = z.object({
  provider: z.enum(["openai", "custom", "gemini", "grok", "groq", "ollama"]).optional(),
  model: z.string().trim().min(1).max(200).optional(),
  baseUrl: z
    .union([httpUrlSchema, z.null()])
    .optional(),
  apiKey: z.string().trim().max(8000).optional(),
});

