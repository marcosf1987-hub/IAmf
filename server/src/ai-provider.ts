/**
 * Capa "marca blanca" para IA: config desde Admin o env vars.
 * Soporta OpenAI, Gemini, Grok y APIs compatibles.
 */
import path from "path";
import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), ".env"), override: true });
import OpenAI from "openai";

export type ChatResult = {
  text: string;
  model: string;
  tokensIn?: number;
  tokensOut?: number;
};

export type ChatConfig = {
  provider?: string;
  apiKey: string;
  model: string;
  baseUrl?: string | null;
};

export async function chat(prompt: string, override?: ChatConfig | null): Promise<ChatResult> {
  let apiKey: string;
  let baseURL: string | undefined;
  let model: string;
  let provider: string;

  if (override?.apiKey) {
    apiKey = override.apiKey;
    model = override.model || "gpt-4o-mini";
    baseURL = override.baseUrl?.trim() || undefined;
    provider = override.provider || "openai";
  } else {
    apiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
    baseURL = process.env.AI_BASE_URL;
    model = process.env.AI_MODEL ?? "gpt-4o-mini";
    provider = "openai";
  }

  switch (provider) {
    case "ollama":
      return chatOllama(prompt, model, baseURL);
    case "gemini":
      if (!apiKey) throw new Error("API key requerida para Gemini. Configura en Admin > Configuración IA.");
      return chatGemini(prompt, apiKey, model);
    case "grok":
      if (!apiKey) throw new Error("API key requerida para Grok. Configura en Admin > Configuración IA.");
      return chatGrok(prompt, apiKey, model);
    case "groq":
      if (!apiKey) throw new Error("API key requerida para Groq. Obtenela gratis en console.groq.com");
      return chatGroq(prompt, apiKey, model);
    case "openai":
    case "custom":
    default:
      if (!apiKey) {
        throw new Error(
          "API key no configurada. Configura la IA en Admin > Configuración IA o agrega OPENAI_API_KEY en server/.env"
        );
      }
      return chatOpenAI(prompt, apiKey, model, baseURL);
  }
}

async function chatOpenAI(
  prompt: string,
  apiKey: string,
  model: string,
  baseURL?: string
): Promise<ChatResult> {
  const client = new OpenAI({
    apiKey,
    ...(baseURL && { baseURL }),
  });

  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 1024,
  });

  const choice = completion.choices[0];
  const text = choice?.message?.content ?? "";
  const usage = completion.usage;

  return {
    text,
    model: completion.model ?? model,
    tokensIn: usage?.prompt_tokens,
    tokensOut: usage?.completion_tokens,
  };
}

async function chatGroq(prompt: string, apiKey: string, model: string): Promise<ChatResult> {
  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });

  const completion = await client.chat.completions.create({
    model: model || "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 1024,
  });

  const choice = completion.choices[0];
  const text = choice?.message?.content ?? "";
  const usage = completion.usage;

  return {
    text,
    model: completion.model ?? model,
    tokensIn: usage?.prompt_tokens,
    tokensOut: usage?.completion_tokens,
  };
}

async function chatGrok(prompt: string, apiKey: string, model: string): Promise<ChatResult> {
  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.x.ai/v1",
  });

  const completion = await client.chat.completions.create({
    model: model || "grok-2-1212",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 1024,
  });

  const choice = completion.choices[0];
  const text = choice?.message?.content ?? "";
  const usage = completion.usage;

  return {
    text,
    model: completion.model ?? model,
    tokensIn: usage?.prompt_tokens,
    tokensOut: usage?.completion_tokens,
  };
}

async function chatOllama(
  prompt: string,
  model: string,
  baseURL?: string | null
): Promise<ChatResult> {
  const url = (baseURL?.trim() || "http://localhost:11434/v1").replace(/\/$/, "") + "/chat/completions";
  const m = model || "llama2";

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: m,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
      stream: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(
      err ||
        `Ollama error: ${res.status}. ¿Está corriendo? Ejecuta "ollama run llama2" en otra terminal.`
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const text = data.choices?.[0]?.message?.content ?? "";

  return {
    text,
    model: data.model ?? m,
    tokensIn: data.usage?.prompt_tokens,
    tokensOut: data.usage?.completion_tokens,
  };
}

async function chatGemini(prompt: string, apiKey: string, model: string): Promise<ChatResult> {
  const m = model || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1024 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Gemini API error: ${res.status}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text =
    data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  return {
    text,
    model: m,
  };
}
