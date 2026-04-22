import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(1).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().optional(),
  role: z.enum(["member", "org_admin"]).optional(),
});

export const adminUpdateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  role: z.enum(["member", "org_admin"]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export const platformCreateCompanySchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(6),
  seatLimit: z.number().int().min(1).max(100000).optional().default(50),
});

export const platformPatchCompanySchema = z.object({
  seatLimit: z.number().int().min(1).max(100000),
  competitionLimit: z.number().int().min(1).max(10000).nullable().optional(),
});

export const createCompetitionSchema = z.object({
  name: z.string().min(2).max(120),
  maxMembers: z.number().int().min(2).max(500),
  description: z.string().max(500).optional().nullable(),
  emoji: z.string().max(16).optional().nullable(),
  coverImageUrl: z.string().max(2000).optional().nullable(),
  discipline: z.enum(["football", "f1"]).optional().default("football"),
});

export const patchCompetitionSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  emoji: z.string().max(16).nullable().optional(),
  coverImageUrl: z.string().max(2000).nullable().optional(),
  maxMembers: z.number().int().min(2).max(500).optional(),
});

export const joinCompetitionCodeSchema = z.object({
  code: z.string().min(4).max(80),
});

export const inviteCompetitionMemberSchema = z.object({
  email: z.string().email(),
});

export const platformResetOrgAdminPasswordSchema = z.object({
  newPassword: z.string().min(6),
});

export const orgInviteSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(100),
});

export const inviteAcceptSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(6),
  fullName: z.string().min(1).max(200).optional(),
});

export const updateMeSchema = z.object({
  fullName: z.string().min(1).optional(),
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
  model: z.string().optional(),
  baseUrl: z.union([z.string(), z.null()]).optional(),
  apiKey: z.string().optional(),
});

