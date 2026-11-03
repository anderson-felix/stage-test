"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Coins,
  Plus,
  UserCheck,
  Users,
  Loader2,
  RefreshCw,
  Globe,
  ShieldCheck,
  X,
} from "lucide-react";

type TenantMemberSummary = {
  userId: string;
  role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
  email: string;
  fullName: string;
  isSuperAdmin: boolean;
};

type TenantItem = {
  id: string;
  name: string;
  slug: string;
  planTier: string;
  tokenCreditBalance: number;
  defaultLocale: string;
  isActive: boolean;
  createdAt: string;
  onboardingCompleted: boolean;
  websiteUrl: string | null;
  customDomains: { domain: string; dnsStatus: string; sslStatus: string }[];
  members: TenantMemberSummary[];
  counts: {
    landingPages: number;
    leads: number;
    adCampaigns: number;
    socialPautas: number;
    socialPosts: number;
    mediaAssets: number;
  };
  aiUsage: {
    callsCount: number;
    inputTokens: number;
    outputTokens: number;
    creditsDeducted: number;
  };
};

export default function SuperAdminTenantsPage() {
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  // Create tenant form
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newPlan, setNewPlan] = useState("pro");
  const [newCredits, setNewCredits] = useState("100000");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Manage seat modal
  const [seatTenant, setSeatTenant] = useState<TenantItem | null>(null);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberPassword, setMemberPassword] = useState("");
  const [memberRole, setMemberRole] = useState<"OWNER" | "ADMIN" | "EDITOR" | "VIEWER">("EDITOR");

  const loadTenants = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/tenants");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Acesso negado");
      setTenants(json.tenants ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  async function handleCreateTenant() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          slug: newSlug || undefined,
          planTier: newPlan,
          tokenCreditBalance: Number(newCredits) || 100000,
          ownerEmail: ownerEmail || undefined,
          ownerName: ownerName || undefined,
          ownerPassword: ownerPassword || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao criar tenant");
      setCreateOpen(false);
      setNewName("");
      setNewSlug("");
      setOwnerEmail("");
      setOwnerName("");
      setOwnerPassword("");
      await loadTenants();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddCredits(tenantId: string, amount: number) {
    const res = await fetch("/api/admin/tenants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, addCredits: amount }),
    });
    if (res.ok) await loadTenants();
  }

  async function handleSaveSeat() {
    if (!seatTenant || !memberEmail.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: seatTenant.id,
          memberEmail,
          memberName,
          memberPassword,
          memberRole,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar membro");
      setSeatTenant(null);
      setMemberEmail("");
      setMemberName("");
      setMemberPassword("");
      await loadTenants();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleImpersonate(tenantId: string) {
    const res = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    if (res.ok) {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    } else {
      const json = await res.json();
      setError(json.error ?? "Falha ao acessar como cliente");
    }
  }

  const input = "mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-soft">
            <ShieldCheck size={14} /> Administração Global da Plataforma Stage
          </div>
          <h1 className="mt-1 text-2xl font-semibold">Gestão de Tenants, Assentos e Créditos IA</h1>
          <p className="text-sm text-muted">
            Monitore o consumo de tokens, recarregue saldos, gerencie membros e acesse o painel de qualquer cliente com auditoria.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadTenants}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted hover:text-text"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Atualizar
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-xs font-medium text-white hover:bg-brand-hover"
          >
            <Plus size={14} /> Novo Cliente (Tenant)
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-xs text-danger">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted">
          <Loader2 size={18} className="mr-2 animate-spin" /> Carregando clientes da plataforma…
        </div>
      ) : (
        <div className="grid gap-4">
          {tenants.map((t) => (
            <div
              key={t.id}
              className="rounded-2xl border border-border bg-surface p-5 shadow-sm transition hover:border-brand/40"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <Building2 size={18} className="text-brand-soft" />
                    <h2 className="text-lg font-semibold">{t.name}</h2>
                    <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs text-muted">/{t.slug}</span>
                    <span className="rounded-md bg-brand/15 px-2 py-0.5 text-[11px] font-semibold uppercase text-brand-soft">
                      {t.planTier}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                        t.onboardingCompleted ? "bg-ok/15 text-ok" : "bg-warn/15 text-warn"
                      }`}
                    >
                      {t.onboardingCompleted ? "Onboarding OK" : "Onboarding Pendente"}
                    </span>
                  </div>

                  {t.customDomains.length > 0 && (
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-muted">
                      <Globe size={13} />
                      {t.customDomains.map((d) => (
                        <span key={d.domain} className="font-mono">
                          {d.domain} ({d.dnsStatus})
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setSeatTenant(t)}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-text hover:border-brand/50"
                  >
                    <Users size={13} /> Gerenciar Assentos ({t.members.length})
                  </button>
                  <button
                    onClick={() => handleImpersonate(t.id)}
                    className="flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-xs font-medium text-white hover:bg-brand-hover"
                  >
                    <UserCheck size={13} /> Acessar como cliente
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4 lg:grid-cols-6">
                <div className="rounded-xl bg-bg p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted">Saldo de Créditos</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold text-brand-soft">
                    {t.tokenCreditBalance.toLocaleString("pt-BR")}
                  </div>
                  <div className="mt-2 flex gap-1">
                    <button
                      onClick={() => handleAddCredits(t.id, 50000)}
                      className="rounded bg-surface-2 px-2 py-0.5 text-[10px] font-medium hover:bg-brand hover:text-white"
                    >
                      +50k
                    </button>
                    <button
                      onClick={() => handleAddCredits(t.id, 200000)}
                      className="rounded bg-surface-2 px-2 py-0.5 text-[10px] font-medium hover:bg-brand hover:text-white"
                    >
                      +200k
                    </button>
                  </div>
                </div>

                <div className="rounded-xl bg-bg p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted">Consumo IA</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold">
                    {t.aiUsage.creditsDeducted.toLocaleString("pt-BR")} créd.
                  </div>
                  <div className="mt-1 text-[11px] text-muted">{t.aiUsage.callsCount} chamadas</div>
                </div>

                <div className="rounded-xl bg-bg p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted">Landing Pages</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold">{t.counts.landingPages}</div>
                  <div className="mt-1 text-[11px] text-muted">{t.counts.leads} leads capturados</div>
                </div>

                <div className="rounded-xl bg-bg p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted">Google Ads</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold">{t.counts.adCampaigns}</div>
                  <div className="mt-1 text-[11px] text-muted">campanhas</div>
                </div>

                <div className="rounded-xl bg-bg p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted">Social & Conteúdo</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold">{t.counts.socialPautas} pautas</div>
                  <div className="mt-1 text-[11px] text-muted">{t.counts.socialPosts} posts</div>
                </div>

                <div className="rounded-xl bg-bg p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted">Biblioteca</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold">{t.counts.mediaAssets}</div>
                  <div className="mt-1 text-[11px] text-muted">ativos de mídia</div>
                </div>
              </div>

              {t.members.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="font-medium">Membros:</span>
                  {t.members.map((m) => (
                    <span key={m.userId} className="rounded-md border border-border bg-bg px-2 py-0.5">
                      {m.fullName} ({m.email}) · <strong className="text-brand-soft">{m.role}</strong>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Novo Tenant */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !submitting && setCreateOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="font-semibold">Criar Novo Cliente (Tenant)</h2>
              <button onClick={() => setCreateOpen(false)} className="text-muted hover:text-text">
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-muted">Nome da Empresa / Marca *</span>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex.: Acme Consultoria"
                  className={input}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-medium text-muted">Slug (opcional)</span>
                  <input
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value)}
                    placeholder="acme-consultoria"
                    className={input}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted">Plano</span>
                  <select value={newPlan} onChange={(e) => setNewPlan(e.target.value)} className={input}>
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted">Créditos IA Iniciais</span>
                  <input
                    type="number"
                    value={newCredits}
                    onChange={(e) => setNewCredits(e.target.value)}
                    className={input}
                  />
                </label>
              </div>

              <div className="border-t border-border pt-3">
                <div className="text-xs font-semibold text-brand-soft">Proprietário (OWNER) Inicial (opcional)</div>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-medium text-muted">Nome</span>
                    <input
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      placeholder="Nome do cliente"
                      className={input}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-muted">E-mail</span>
                    <input
                      type="email"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      placeholder="cliente@empresa.com.br"
                      className={input}
                    />
                  </label>
                </div>
                <label className="mt-2 block">
                  <span className="text-xs font-medium text-muted">Senha inicial</span>
                  <input
                    type="password"
                    value={ownerPassword}
                    onChange={(e) => setOwnerPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres (padrão: Mudar@123)"
                    className={input}
                  />
                </label>
              </div>

              <div className="mt-4 flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setCreateOpen(false)}
                  className="rounded-lg px-3 py-2 text-xs text-muted hover:text-text"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateTenant}
                  disabled={!newName.trim() || submitting}
                  className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                >
                  {submitting && <Loader2 size={14} className="animate-spin" />} Criar Tenant
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Gerenciar Assentos */}
      {seatTenant && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !submitting && setSeatTenant(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="font-semibold">Assentos & Membros · {seatTenant.name}</h2>
              <button onClick={() => setSeatTenant(null)} className="text-muted hover:text-text">
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="text-xs font-medium text-muted">Adicionar ou Atualizar Membro</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-muted">E-mail *</span>
                  <input
                    type="email"
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                    placeholder="usuario@empresa.com"
                    className={input}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted">Papel (RBAC) *</span>
                  <select
                    value={memberRole}
                    onChange={(e) => setMemberRole(e.target.value as "OWNER" | "ADMIN" | "EDITOR" | "VIEWER")}
                    className={input}
                  >
                    <option value="OWNER">OWNER (Proprietário)</option>
                    <option value="ADMIN">ADMIN (Administrador)</option>
                    <option value="EDITOR">EDITOR (Criador/Editor)</option>
                    <option value="VIEWER">VIEWER (Leitor)</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-muted">Nome (se novo usuário)</span>
                  <input
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    placeholder="Nome completo"
                    className={input}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted">Senha inicial (se novo)</span>
                  <input
                    type="password"
                    value={memberPassword}
                    onChange={(e) => setMemberPassword(e.target.value)}
                    placeholder="Padrão: Mudar@123"
                    className={input}
                  />
                </label>
              </div>

              <div className="mt-4 flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setSeatTenant(null)}
                  className="rounded-lg px-3 py-2 text-xs text-muted hover:text-text"
                >
                  Fechar
                </button>
                <button
                  onClick={handleSaveSeat}
                  disabled={!memberEmail.trim() || submitting}
                  className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                >
                  {submitting && <Loader2 size={14} className="animate-spin" />} Salvar Assento
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

