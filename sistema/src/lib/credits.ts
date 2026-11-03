import prisma from "./prisma";

/**
 * Regra explícita de conversão de tokens da Anthropic em créditos de plataforma Stage:
 * - 1 input_token  = 1 crédito
 * - 1 output_token = 3 créditos (refletindo o custo 3x a 5x maior de tokens de saída nos modelos Claude)
 * - Reserva mínima preventiva por geração: 1.500 créditos (evita concorrência sem saldo).
 */
export const INPUT_TOKEN_CREDIT_COST = 1;
export const OUTPUT_TOKEN_CREDIT_COST = 3;
export const MIN_GENERATION_CREDITS = 1500;

export class InsufficientCreditsError extends Error {
  public readonly status = 402;
  public readonly currentBalance: number;
  public readonly requiredCredits: number;
  public readonly ctaUrl = "/conta";

  constructor(currentBalance: number, requiredCredits = MIN_GENERATION_CREDITS) {
    super(
      `Saldo de créditos de IA insuficiente (${currentBalance.toLocaleString("pt-BR")} disponíveis; mínimo de ${requiredCredits.toLocaleString("pt-BR")} necessários para iniciar a geração). Solicite recarga ou faça upgrade do seu plano.`
    );
    this.name = "InsufficientCreditsError";
    this.currentBalance = currentBalance;
    this.requiredCredits = requiredCredits;
  }
}

export function calculateCreditsFromTokens(inputTokens: number, outputTokens: number): number {
  const safeIn = Math.max(0, Math.round(inputTokens));
  const safeOut = Math.max(0, Math.round(outputTokens));
  return Math.max(1, safeIn * INPUT_TOKEN_CREDIT_COST + safeOut * OUTPUT_TOKEN_CREDIT_COST);
}

export type CreditReservation = {
  tenantId: string;
  userId?: string | null;
  featureModule: string;
  reservedCredits: number;
  startedAt: number;
  reconciled: boolean;
};

/**
 * Verifica saldo e reserva atomicamente `reservationAmount` créditos no banco antes de chamar a Anthropic.
 * Impede condição de corrida entre requisições simultâneas do mesmo tenant.
 */
export async function reserveCredits(params: {
  tenantId: string;
  userId?: string | null;
  featureModule: string;
  reservationAmount?: number;
}): Promise<CreditReservation> {
  const amount = Math.max(1, params.reservationAmount ?? MIN_GENERATION_CREDITS);

  const updated = await prisma.tenant.updateMany({
    where: {
      id: params.tenantId,
      isActive: true,
      tokenCreditBalance: {
        gte: amount,
      },
    },
    data: {
      tokenCreditBalance: {
        decrement: amount,
      },
    },
  });

  if (updated.count === 0) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: params.tenantId },
      select: { tokenCreditBalance: true },
    });
    throw new InsufficientCreditsError(tenant?.tokenCreditBalance ?? 0, amount);
  }

  return {
    tenantId: params.tenantId,
    userId: params.userId ?? null,
    featureModule: params.featureModule,
    reservedCredits: amount,
    startedAt: Date.now(),
    reconciled: false,
  };
}

/**
 * Estorna os créditos reservados caso a chamada à API falhe antes de produzir saída válida,
 * evitando débito indevido em retentativas.
 */
export async function releaseReservedCredits(reservation: CreditReservation): Promise<void> {
  if (reservation.reconciled || reservation.reservedCredits <= 0) return;
  reservation.reconciled = true;

  await prisma.tenant
    .update({
      where: { id: reservation.tenantId },
      data: {
        tokenCreditBalance: {
          increment: reservation.reservedCredits,
        },
      },
    })
    .catch(() => undefined);
}

/**
 * Ao final da geração, executa transação Prisma que:
 * 1. Calcula `creditsDeducted` reais a partir de `input_tokens` e `output_tokens`.
 * 2. Ajusta `Tenant.tokenCreditBalance` pela diferença entre a reserva preventiva e o consumo real.
 * 3. Registra `AiUsageLog` auditável para o tenant e o usuário.
 */
export async function reconcileCreditsAndLogUsage(
  reservation: CreditReservation,
  usage: {
    modelName: string;
    inputTokens: number;
    outputTokens: number;
    durationMs?: number;
  }
): Promise<{
  creditsDeducted: number;
  remainingBalance: number;
  logId: string;
}> {
  if (reservation.reconciled) {
    const t = await prisma.tenant.findUnique({
      where: { id: reservation.tenantId },
      select: { tokenCreditBalance: true },
    });
    return {
      creditsDeducted: 0,
      remainingBalance: t?.tokenCreditBalance ?? 0,
      logId: "",
    };
  }
  reservation.reconciled = true;

  const creditsDeducted = calculateCreditsFromTokens(usage.inputTokens, usage.outputTokens);
  const delta = creditsDeducted - reservation.reservedCredits;
  const durationMs = usage.durationMs ?? Math.max(1, Date.now() - reservation.startedAt);

  return prisma.$transaction(async (tx) => {
    const currentTenant = await tx.tenant.findUniqueOrThrow({
      where: { id: reservation.tenantId },
      select: { tokenCreditBalance: true },
    });

    const newBalance = Math.max(0, currentTenant.tokenCreditBalance - delta);

    const updatedTenant = await tx.tenant.update({
      where: { id: reservation.tenantId },
      data: {
        tokenCreditBalance: newBalance,
      },
      select: { tokenCreditBalance: true },
    });

    const log = await tx.aiUsageLog.create({
      data: {
        tenantId: reservation.tenantId,
        userId: reservation.userId ?? null,
        featureModule: reservation.featureModule,
        modelName: usage.modelName,
        inputTokens: Math.max(0, Math.round(usage.inputTokens)),
        outputTokens: Math.max(0, Math.round(usage.outputTokens)),
        creditsDeducted,
        durationMs,
      },
    });

    return {
      creditsDeducted,
      remainingBalance: updatedTenant.tokenCreditBalance,
      logId: log.id,
    };
  });
}

export function formatInsufficientCreditsResponse(err: InsufficientCreditsError): Response {
  return Response.json(
    {
      error: err.message,
      code: "INSUFFICIENT_AI_CREDITS",
      currentBalance: err.currentBalance,
      requiredCredits: err.requiredCredits,
      ctaLabel: "Recarregar Créditos / Upgrade de Plano",
      ctaUrl: err.ctaUrl,
    },
    { status: 402 }
  );
}

