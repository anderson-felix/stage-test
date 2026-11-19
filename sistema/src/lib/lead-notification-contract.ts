export type LeadNotificationOutcome = "accepted" | "already_sent" | "queued" | "processing" |
  "retry_scheduled" | "config_pending" | "failed_final" | "ambiguous";

export type LeadNotificationRecoveryResponse = {
  ok: boolean; // Confirmed provider acceptance only, never merely HTTP 2xx.
  providerAccepted: boolean;
  outcome: LeadNotificationOutcome;
  message: string;
  deliveryResult: { status: string; detail?: string };
};

export function describeLeadNotificationResult(status: string): {
  httpStatus: number; outcome: LeadNotificationOutcome; providerAccepted: boolean; message: string;
} {
  switch (status) {
    case "sent_custom": case "sent_fallback":
      return { httpStatus: 200, outcome: "accepted", providerAccepted: true, message: "Notificação aceita pelo provedor. A entrega na caixa de entrada ainda depende do provedor." };
    case "already_sent":
      return { httpStatus: 200, outcome: "already_sent", providerAccepted: true, message: "Esta notificação já havia sido aceita pelo provedor; nenhum novo envio foi realizado." };
    case "queued":
      return { httpStatus: 202, outcome: "queued", providerAccepted: false, message: "Notificação na fila; ainda não houve confirmação de envio." };
    case "sending": case "processing":
      return { httpStatus: 202, outcome: "processing", providerAccepted: false, message: "Notificação em processamento. Aguarde a conclusão." };
    case "retry_scheduled":
      return { httpStatus: 202, outcome: "retry_scheduled", providerAccepted: false, message: "Nova tentativa agendada. O prazo e o limite de tentativas foram preservados." };
    case "config_pending": case "skipped_no_recipients":
      return { httpStatus: 422, outcome: "config_pending", providerAccepted: false, message: "Envio pendente de configuração. Corrija remetente, destinatários ou credencial e tente recuperar novamente." };
    case "ambiguous":
      return { httpStatus: 409, outcome: "ambiguous", providerAccepted: false, message: "Resultado de envio incerto. É necessária reconciliação com o provedor; nenhum reenvio automático foi liberado." };
    default:
      return { httpStatus: 409, outcome: "failed_final", providerAccepted: false, message: "Falha final ou registro legado. É necessária revisão operacional antes de liberar outro envio." };
  }
}

export function getLeadNotificationPresentation(status: string): {
  label: string; cls: string; canRecover: boolean; action: string; explanation: string;
} {
  const blocked = { canRecover: false, action: "Revisão necessária", cls: "bg-danger/15 text-danger" };
  switch (status) {
    case "sent_custom": case "sent_fallback":
      return { canRecover: false, action: "Já aceito", label: "Aceito pelo provedor", cls: "bg-ok/15 text-ok", explanation: "Aceite registrado; não confirma entrega na caixa de entrada." };
    case "queued":
      return { canRecover: true, action: "Processar notificação", label: "Na fila", cls: "bg-warn/15 text-warn", explanation: "Aguardando processamento; nenhum envio confirmado." };
    case "sending": case "processing":
      return { canRecover: false, action: "Aguarde", label: "Em processamento", cls: "bg-warn/15 text-warn", explanation: "Outra execução pode estar enviando esta notificação." };
    case "retry_scheduled":
      return { canRecover: false, action: "Aguardar tentativa", label: "Nova tentativa agendada", cls: "bg-warn/15 text-warn", explanation: "O worker respeita o prazo e o limite de tentativas." };
    case "config_pending": case "skipped_no_recipients":
      return { canRecover: true, action: "Recuperar após configurar", label: "Configuração pendente", cls: "bg-warn/15 text-warn", explanation: "Corrija as configurações de e-mail antes de recuperar." };
    case "ambiguous":
      return { ...blocked, label: "Resultado incerto", explanation: "Reconciliar no provedor antes de decidir sobre outro envio." };
    default:
      return { ...blocked, label: "Falha final / revisar", explanation: "Revisão operacional necessária; envio automático bloqueado." };
  }
}

export function getLeadRecoveryFeedback(result: Partial<LeadNotificationRecoveryResponse>): string {
  if ((result.outcome === "accepted" || result.outcome === "already_sent") && result.providerAccepted !== true) {
    return "O envio ainda não foi confirmado pelo provedor. Atualize o estado da notificação.";
  }
  const statusForOutcome: Record<LeadNotificationOutcome, string> = {
    accepted: "sent_custom", already_sent: "already_sent", queued: "queued", processing: "sending",
    retry_scheduled: "retry_scheduled", config_pending: "config_pending", failed_final: "failed_final", ambiguous: "ambiguous",
  };
  if (!result.outcome || !Object.hasOwn(statusForOutcome, result.outcome)) return "Estado da notificação não reconhecido. Atualize a lista antes de continuar.";
  return describeLeadNotificationResult(statusForOutcome[result.outcome]).message;
}
