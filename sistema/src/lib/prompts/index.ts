import prisma from "../prisma";
import {
  buildModoHubSystemPrompt,
  formatBrandContextBlock,
  type OutputLanguage,
  type PromptContextInput,
  type ToneStyleOption,
} from "./modo-hub";
import { buildLandingPagePrompt } from "./landing-page";
import { buildAnuncioGooglePrompt } from "./anuncio-google";
import { buildCarrosselPrompt } from "./carrossel";
import { buildRoteiroPrompt } from "./roteiro";
import { buildSeoPrompt } from "./seo";
import { buildCopyVendasPrompt } from "./copy-vendas";
import { buildAnalisarDadosPrompt } from "./analisar-dados";

export {
  buildModoHubSystemPrompt,
  formatBrandContextBlock,
  buildLandingPagePrompt,
  buildAnuncioGooglePrompt,
  buildCarrosselPrompt,
  buildRoteiroPrompt,
  buildSeoPrompt,
  buildCopyVendasPrompt,
  buildAnalisarDadosPrompt,
  type OutputLanguage,
  type PromptContextInput,
  type ToneStyleOption,
};

/**
 * Carrega o contexto de marca do Tenant direto do PostgreSQL (Prisma),
 * incluindo o Tenant, BrandProfile e suas diretrizes visuais e estratégicas.
 */
export async function carregarContextoMarcaTenant(
  tenantId: string,
  overrides?: {
    language?: string;
    toneStyle?: string;
    briefing?: string;
    extraContext?: string;
  }
): Promise<PromptContextInput> {
  const brandProfile = await prisma.brandProfile.findUnique({
    where: { tenantId },
    include: { tenant: true },
  });

  const tenant =
    brandProfile?.tenant ??
    (await prisma.tenant.findUnique({
      where: { id: tenantId },
    }));

  return {
    tenantId,
    tenantName: tenant?.name || "Empresa Cliente",
    brandProfile: brandProfile ?? null,
    language: overrides?.language || tenant?.defaultLocale || "pt-BR",
    toneStyle: overrides?.toneStyle || "Consultivo",
    briefing: overrides?.briefing,
    extraContext: overrides?.extraContext,
  };
}

/** Alias para manter total compatibilidade com chamadas existentes */
export const loadTenantPromptContext = carregarContextoMarcaTenant;
