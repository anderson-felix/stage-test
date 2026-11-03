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

/** Carrega o contexto do Tenant e BrandProfile direto do PostgreSQL para injetar nos Prompt Builders. */
export async function loadTenantPromptContext(
  tenantId: string,
  overrides?: {
    language?: string;
    toneStyle?: string;
    briefing?: string;
    extraContext?: string;
  }
): Promise<PromptContextInput> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { brandProfile: true },
  });

  return {
    tenantName: tenant?.name || "Stage Consulting",
    brandProfile: tenant?.brandProfile ?? null,
    language: overrides?.language || tenant?.defaultLocale || "pt-BR",
    toneStyle: overrides?.toneStyle || "Consultivo",
    briefing: overrides?.briefing,
    extraContext: overrides?.extraContext,
  };
}

