import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { LeadNotificationCells } from "../src/components/ads/LeadNotificationCells";
import { getLeadRecoveryFeedback } from "../src/lib/lead-notification-contract";

test("células reais mostram mensagem e ação coerentes por estado", () => {
  for (const [status, label, enabled] of [
    ["queued", "Na fila", true], ["config_pending", "Configuração pendente", true],
    ["sending", "Em processamento", false], ["retry_scheduled", "Nova tentativa agendada", false],
    ["failed_final", "Falha final / revisar", false], ["ambiguous", "Resultado incerto", false],
    ["sent_custom", "Aceito pelo provedor", false], ["sent_fallback", "Aceito pelo provedor", false],
  ] as const) {
    const cells = renderToStaticMarkup(createElement(LeadNotificationCells, { status, busy: false, processing: false, onRecover: () => {} }));
    const $ = load(`<table><tbody><tr>${cells}</tr></tbody></table>`);
    assert.equal($("span").first().text(), label);
    assert.equal($("button").attr("disabled") === undefined, enabled);
    assert.ok($("p").text());
  }
});
test("loading bloqueia outra ação; HTTP 2xx sem aceite não vira mensagem de envio", () => {
  const result = renderToStaticMarkup(createElement(LeadNotificationCells, { status: "config_pending", busy: true, processing: true, onRecover: () => {} }));
  assert.match(result, /disabled/); assert.match(result, /Processando/);
  for (const outcome of ["queued", "processing", "retry_scheduled", "config_pending", "failed_final", "ambiguous"] as const) {
    assert.doesNotMatch(getLeadRecoveryFeedback({ outcome, providerAccepted: false }), /reenviada.*sucesso|aceita pelo provedor/i);
  }
  assert.match(getLeadRecoveryFeedback({ outcome: "accepted", providerAccepted: true }), /aceita pelo provedor/);
  assert.match(getLeadRecoveryFeedback({ outcome: "accepted", providerAccepted: false }), /não foi confirmado/);
});
