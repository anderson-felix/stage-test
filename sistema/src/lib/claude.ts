import Anthropic from "@anthropic-ai/sdk";
import prisma from "./prisma";
import {
  InsufficientCreditsError,
  reconcileCreditsAndLogUsage,
  releaseReservedCredits,
  reserveCredits,
} from "./credits";
import { buildModoHubSystemPrompt, loadTenantPromptContext } from "./prompts";
import { downloadTenantAssetBuffer } from "./storage";
import { resolverTenantId } from "./tenant-context";

/** Eventos normalizados que o front-end recebe (um JSON por linha). */
export type ChatEvent =
  | { type: "session"; id: string }
  | { type: "text_start" }
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; detail: string }
  | {
      type: "done";
      error?: string;
      costUsd?: number;
      creditsDeducted?: number;
      remainingBalance?: number;
    };

export type ClaudeExecutionOptions = {
  tenantId?: string;
  userId?: string | null;
  featureModule?: string;
  systemPrompt?: string;
  language?: string;
  toneStyle?: string;
  referenceAssetId?: string | null;
  model?: string;
  maxTokens?: number;
  onCompletedText?: (
    fullText: string,
    emitTool: (name: string, detail: string) => void
  ) => Promise<void>;
};

export const DEFAULT_CLAUDE_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY não configurada no servidor. Configure a chave da API da Anthropic no arquivo .env."
    );
  }
  return new Anthropic({ apiKey });
}

export function extractCodeBlock(text: string, langHint?: string): string | null {
  if (langHint) {
    const regex = new RegExp(`\`\`\`${langHint}\\s*\\r?\\n([\\s\\S]*?)\`\`\``, "i");
    const m = regex.exec(text);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  const htmlMatch = /<!DOCTYPE\s+html[\s\S]*?<\/html>/i.exec(text);
  if (htmlMatch) return htmlMatch[0].trim();

  const generic = /```(?:[a-z0-9_-]*)\r?\n([\s\S]*?)```/i.exec(text);
  return generic?.[1]?.trim() ?? null;
}

async function loadMultimodalImageBlock(
  tenantId: string,
  referenceAssetId?: string | null
): Promise<Anthropic.ImageBlockParam | null> {
  if (!referenceAssetId) return null;
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: referenceAssetId, tenantId },
  });
  if (!asset) return null;

  const allowedMediaTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ] as const;
  type AllowedMediaType = (typeof allowedMediaTypes)[number];

  const mediaType: AllowedMediaType = allowedMediaTypes.includes(
    asset.mimeType as AllowedMediaType
  )
    ? (asset.mimeType as AllowedMediaType)
    : "image/png";

  try {
    const downloaded = await downloadTenantAssetBuffer(asset.blobUrl);
    if (!downloaded) return null;
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType,
        data: downloaded.buffer.toString("base64"),
      },
    };
  } catch {
    return null;
  }
}

/** Roda um turno inteiro e devolve só o texto final, para rotas que precisam de JSON e não de stream. */
export async function collectClaude(
  message: string,
  signal: AbortSignal,
  options?: ClaudeExecutionOptions
): Promise<{ text: string; error?: string; status?: number }> {
  const reader = runClaude(message, undefined, signal, options).getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let error: string | undefined;
  let status: number | undefined;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const ev = JSON.parse(line) as ChatEvent;
      if (ev.type === "text_start") text = "";
      else if (ev.type === "text") text += ev.delta;
      else if (ev.type === "done" && ev.error) {
        error = ev.error;
        if (ev.error.includes("Saldo de créditos de IA insuficiente")) {
          status = 402;
        }
      }
    }
  }
  return { text, error, status };
}

/**
 * Executa uma geração de IA via @anthropic-ai/sdk com streaming NDJSON de ChatEvent,
 * injeção do contexto do Tenant (BrandProfile), suporte multimodal e governança transacional de créditos.
 */
export function runClaude(
  message: string,
  sessionId: string | undefined,
  signal?: AbortSignal,
  options?: ClaudeExecutionOptions
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (ev: ChatEvent) => {
        if (!closed) {
          controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
        }
      };
      const finish = (ev: Extract<ChatEvent, { type: "done" }>) => {
        if (closed) return;
        send(ev);
        closed = true;
        controller.close();
      };

      const tid = await resolverTenantId(options?.tenantId);
      const featureModule = options?.featureModule || "hub_assistant";
      const modelName = options?.model || DEFAULT_CLAUDE_MODEL;

      let reservation = null;
      try {
        reservation = await reserveCredits({
          tenantId: tid,
          userId: options?.userId ?? null,
          featureModule,
        });
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          finish({ type: "done", error: err.message });
          return;
        }
        finish({ type: "done", error: (err as Error).message });
        return;
      }

      try {
        const anthropic = getAnthropicClient();
        send({ type: "session", id: sessionId || crypto.randomUUID() });

        let systemPrompt = options?.systemPrompt;
        if (!systemPrompt) {
          const ctx = await loadTenantPromptContext(tid, {
            language: options?.language,
            toneStyle: options?.toneStyle,
          });
          systemPrompt = buildModoHubSystemPrompt(ctx);
        }

        const userContent: Anthropic.ContentBlockParam[] = [];
        const imageBlock = await loadMultimodalImageBlock(tid, options?.referenceAssetId);
        if (imageBlock) {
          userContent.push(imageBlock);
          send({
            type: "tool",
            name: "Read",
            detail: "Imagem de referência carregada para visão multimodal",
          });
        }
        userContent.push({ type: "text", text: message });

        send({ type: "text_start" });

        const stream = anthropic.messages.stream(
          {
            model: modelName,
            max_tokens: options?.maxTokens ?? 8192,
            system: systemPrompt,
            messages: [{ role: "user", content: userContent }],
          },
          { signal }
        );

        let fullText = "";
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            fullText += event.delta.text;
            send({ type: "text", delta: event.delta.text });
          }
        }

        const finalMsg = await stream.finalMessage();
        const inputTokens = finalMsg.usage?.input_tokens ?? 0;
        const outputTokens = finalMsg.usage?.output_tokens ?? 0;

        if (options?.onCompletedText) {
          await options.onCompletedText(fullText, (name, detail) => {
            send({ type: "tool", name, detail });
          });
        }

        const reconciled = await reconcileCreditsAndLogUsage(reservation, {
          modelName,
          inputTokens,
          outputTokens,
        });

        finish({
          type: "done",
          creditsDeducted: reconciled.creditsDeducted,
          remainingBalance: reconciled.remainingBalance,
        });
      } catch (err) {
        await releaseReservedCredits(reservation);
        const msg = signal?.aborted
          ? "Geração interrompida pelo usuário"
          : (err as Error).message || "Erro na chamada à API da Anthropic";
        finish({ type: "done", error: msg });
      }
    },
  });
}

// ---------- Filas / Jobs Assíncronos de IA ----------

export type AiJobState = {
  id: string;
  tenantId: string;
  featureModule: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progressDetail?: string;
  resultText?: string;
  error?: string;
  creditsDeducted?: number;
  createdAt: string;
  updatedAt: string;
};

const globalJobs = globalThis as unknown as {
  aiJobsMap?: Map<string, { state: AiJobState; abortController: AbortController }>;
};

const jobsMap = globalJobs.aiJobsMap ?? (globalJobs.aiJobsMap = new Map());

export function createBackgroundAiJob(
  params: {
    tenantId: string;
    userId?: string | null;
    featureModule: string;
    prompt: string;
    options?: ClaudeExecutionOptions;
  }
): AiJobState {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const state: AiJobState = {
    id,
    tenantId: params.tenantId,
    featureModule: params.featureModule,
    status: "queued",
    progressDetail: "Na fila de processamento…",
    createdAt: now,
    updatedAt: now,
  };
  const abortController = new AbortController();
  jobsMap.set(id, { state, abortController });

  void (async () => {
    state.status = "running";
    state.progressDetail = "Gerando com Claude…";
    state.updatedAt = new Date().toISOString();

    const { text, error } = await collectClaude(
      params.prompt,
      abortController.signal,
      {
        ...params.options,
        tenantId: params.tenantId,
        userId: params.userId,
        featureModule: params.featureModule,
      }
    );

    state.updatedAt = new Date().toISOString();
    if (abortController.signal.aborted) {
      state.status = "cancelled";
      state.error = "Job cancelado";
    } else if (error) {
      state.status = "failed";
      state.error = error;
    } else {
      state.status = "completed";
      state.resultText = text;
      state.progressDetail = "Concluído";
    }
  })();

  return state;
}

export function getAiJobStatus(jobId: string, tenantId: string): AiJobState | null {
  const entry = jobsMap.get(jobId);
  if (!entry || entry.state.tenantId !== tenantId) return null;
  return entry.state;
}

export function cancelAiJob(jobId: string, tenantId: string): AiJobState | null {
  const entry = jobsMap.get(jobId);
  if (!entry || entry.state.tenantId !== tenantId) return null;
  entry.abortController.abort();
  entry.state.status = "cancelled";
  entry.state.updatedAt = new Date().toISOString();
  return entry.state;
}
