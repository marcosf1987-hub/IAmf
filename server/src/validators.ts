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
  role: z.enum(["employee", "admin"]).optional(),
});

export const adminUpdateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  role: z.enum(["employee", "admin"]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export const updateMeSchema = z.object({
  fullName: z.string().min(1).optional(),
  password: z.string().min(6).optional(),
});

export const prodeGuidelinesSchema = z.object({
  text: z.string().max(2000).optional(),
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

