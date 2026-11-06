import { LPStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getDomainMapping } from "@/lib/redis";
import { htmlAutocontido } from "@/lib/lp";
import { downloadTenantAssetBuffer } from "@/lib/storage";
import { resolveLpHtmlAssets } from "@/lib/brand-assets";

type Ctx = {
  params: Promise<{ host: string; slug: string }>;
};

function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildHeadInjection(
  html: string,
  lpTitle: string,
  seoMetadata: Record<string, unknown> | null,
  trackingConfig: Record<string, unknown> | null
): string {
  const parts: string[] = [];

  const seoTitle =
    (typeof seoMetadata?.title === "string" && seoMetadata.title.trim()) || lpTitle;
  const seoDesc =
    (typeof seoMetadata?.description === "string" && seoMetadata.description.trim()) || "";
  const ogImage =
    (typeof seoMetadata?.ogImage === "string" && seoMetadata.ogImage.trim()) || "";

  if (!/<title>/i.test(html) && seoTitle) {
    parts.push(`<title>${escapeHtmlAttr(seoTitle)}</title>`);
  }
  if (!/<meta\s+name=["']description["']/i.test(html) && seoDesc) {
    parts.push(`<meta name="description" content="${escapeHtmlAttr(seoDesc)}" />`);
  }
  if (!/<meta\s+property=["']og:title["']/i.test(html) && seoTitle) {
    parts.push(`<meta property="og:title" content="${escapeHtmlAttr(seoTitle)}" />`);
  }
  if (!/<meta\s+property=["']og:description["']/i.test(html) && seoDesc) {
    parts.push(`<meta property="og:description" content="${escapeHtmlAttr(seoDesc)}" />`);
  }
  if (!/<meta\s+property=["']og:image["']/i.test(html) && ogImage) {
    parts.push(`<meta property="og:image" content="${escapeHtmlAttr(ogImage)}" />`);
  }

  const gtmId =
    typeof trackingConfig?.gtmId === "string" && /^GTM-[A-Z0-9]+$/i.test(trackingConfig.gtmId.trim())
      ? trackingConfig.gtmId.trim()
      : null;

  if (gtmId && !html.includes(gtmId)) {
    parts.push(`<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');</script>
<!-- End Google Tag Manager -->`);
  }

  const hotjarId =
    typeof trackingConfig?.hotjarId === "string" && /^\d+$/.test(trackingConfig.hotjarId.trim())
      ? trackingConfig.hotjarId.trim()
      : null;

  if (hotjarId && !html.includes("static.hotjar.com")) {
    parts.push(`<!-- Hotjar Tracking Code -->
<script>
(function(h,o,t,j,a,r){
h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
h._hjSettings={hjid:${hotjarId},hjsv:6};
a=o.getElementsByTagName('head')[0];
r=o.createElement('script');r.async=1;
r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
a.appendChild(r);
})(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');
</script>`);
  }

  const metaPixelId =
    typeof trackingConfig?.metaPixelId === "string" &&
    /^\d+$/.test(trackingConfig.metaPixelId.trim())
      ? trackingConfig.metaPixelId.trim()
      : null;

  if (metaPixelId && !html.includes("connect.facebook.net")) {
    parts.push(`<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${metaPixelId}');
fbq('track', 'PageView');
</script>`);
  }

  return parts.join("\n");
}

export function buildLeadCaptureInterceptorScript(
  landingPageId: string,
  tenantId: string,
  lpSlug: string,
  host: string,
  whatsappUrl?: string | null
): string {
  const cfg = JSON.stringify({
    landingPageId,
    tenantId,
    lpSlug,
    host,
    whatsappUrl: whatsappUrl || "",
  });
  return `<!-- Stage SaaS Lead Interceptor -->
<script>
(function() {
  var CFG = ${cfg};
  function getUtms() {
    var params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get("utm_source") || "",
      utm_medium: params.get("utm_medium") || "",
      utm_campaign: params.get("utm_campaign") || "",
      utm_term: params.get("utm_term") || "",
      utm_content: params.get("utm_content") || "",
      referrer: document.referrer || "",
      page_url: window.location.href
    };
  }

  function injectHoneypot(form) {
    if (form.querySelector('input[name="_gotcha"]')) return;
    var hp = document.createElement("input");
    hp.type = "text";
    hp.name = "_gotcha";
    hp.tabIndex = -1;
    hp.autocomplete = "off";
    hp.setAttribute("aria-hidden", "true");
    hp.style.cssText = "position:absolute;left:-9999px;opacity:0;height:0;width:0;pointer-events:none;";
    form.appendChild(hp);
  }

  function showFormFeedback(form, message, isSuccess) {
    var existing = form.querySelector("[data-stage-feedback]");
    if (!existing) {
      existing = document.createElement("div");
      existing.setAttribute("data-stage-feedback", "1");
      form.appendChild(existing);
    }
    existing.style.cssText = isSuccess
      ? "margin-top:12px;padding:12px 16px;border-radius:8px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.4);color:#10b981;font-size:14px;font-weight:600;text-align:center;"
      : "margin-top:12px;padding:12px 16px;border-radius:8px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);color:#ef4444;font-size:14px;font-weight:600;text-align:center;";
    existing.textContent = message;
  }

  function attachForms() {
    var forms = document.querySelectorAll("form");
    forms.forEach(function(form) {
      if (form.dataset.stageBound === "1") return;
      form.dataset.stageBound = "1";
      injectHoneypot(form);

      form.addEventListener("submit", function(ev) {
        ev.preventDefault();
        ev.stopPropagation();

        var fd = new FormData(form);
        var payload = {};
        var customFields = {};
        var honeypotVal = "";

        fd.forEach(function(value, key) {
          if (key === "_gotcha" || key === "_stage_hp") {
            honeypotVal = String(value || "");
            return;
          }
          var valStr = typeof value === "string" ? value.trim() : String(value);
          payload[key] = valStr;
        });

        form.querySelectorAll("input, textarea, select").forEach(function(el) {
          if (el.name === "_gotcha" || el.name === "_stage_hp" || el.type === "submit" || el.type === "button") return;
          var k = el.name || el.id || el.getAttribute("placeholder") || el.type;
          if (k && !(k in payload) && el.value) {
            payload[k] = String(el.value).trim();
          }
        });

        var name = payload.name || payload.nome || payload["full-name"] || payload.fullName || "";
        var email = payload.email || payload["e-mail"] || payload.mail || "";
        var phone = payload.phone || payload.tel || payload.telefone || payload.whatsapp || payload.celular || "";

        for (var k in payload) {
          if (!["name","nome","email","phone","tel","telefone","whatsapp"].includes(k.toLowerCase())) {
            customFields[k] = payload[k];
          }
        }

        var utms = getUtms();
        var btn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
        var originalText = btn ? btn.innerHTML : "";
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = "Enviando...";
        }

        fetch("/api/public/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId: CFG.tenantId,
            landingPageId: CFG.landingPageId,
            name: name,
            email: email,
            phone: phone,
            customFields: customFields,
            utmSource: utms.utm_source,
            utmMedium: utms.utm_medium,
            utmCampaign: utms.utm_campaign,
            slug: CFG.lpSlug,
            host: CFG.host,
            _gotcha: honeypotVal,
            honeypot: honeypotVal,
            payload: payload,
            utmData: utms
          })
        })
        .then(function(res) { return res.json().then(function(data) { return { ok: res.ok, data: data }; }); })
        .then(function(result) {
          if (!result.ok) throw new Error((result.data && result.data.error) || "Erro ao enviar");
          window.dataLayer = window.dataLayer || [];
          window.dataLayer.push({ event: "generate_lead", landing_page_id: CFG.landingPageId, lp_slug: CFG.lpSlug });
          if (typeof window.fbq === "function") {
            try { window.fbq("track", "Lead"); } catch (e) {}
          }
          form.reset();
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = "Enviado com sucesso ✓";
          }
          showFormFeedback(form, "Recebemos seus dados com sucesso! Nossa equipe entrará em contato em breve.", true);

          if (CFG.whatsappUrl) {
            setTimeout(function() {
              window.location.href = CFG.whatsappUrl;
            }, 1200);
          }
        })
        .catch(function(err) {
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
          }
          showFormFeedback(form, err.message || "Não foi possível enviar seus dados. Tente novamente.", false);
        });
      }, true);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachForms);
  } else {
    attachForms();
  }
})();
</script>`;
}

function renderNotFoundHtml(host: string, slug: string): Response {
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Página não encontrada — 404</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #0a0a0a; color: #f5f5f0; display: flex; min-height: 100vh; align-items: center; justify-content: center; padding: 24px; }
    .card { max-width: 460px; border: 1px solid #262626; background: #141414; border-radius: 16px; padding: 32px; text-align: center; }
    .code { color: #c9a84c; font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 600; }
    h1 { margin: 12px 0 8px; font-size: 24px; }
    p { margin: 0; color: #a3a39e; font-size: 14px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="code">Erro 404</div>
    <h1>Landing Page não encontrada</h1>
    <p>A página solicitada (<strong>/${escapeHtmlAttr(slug === "__root__" ? "" : slug)}</strong> em <strong>${escapeHtmlAttr(host)}</strong>) não está publicada ou não existe.</p>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      Vary: "Host",
    },
  });
}

export async function GET(_request: Request, ctx: Ctx) {
  const { host: rawHost, slug: rawSlug } = await ctx.params;
  const host = decodeURIComponent(rawHost).trim().toLowerCase();
  const slug = decodeURIComponent(rawSlug).trim().toLowerCase();

  const mapping = await getDomainMapping(host);
  if (!mapping) {
    return renderNotFoundHtml(host, slug);
  }

  let lp =
    slug === "__root__"
      ? null
      : await prisma.landingPage.findFirst({
          where: {
            tenantId: mapping.tenantId,
            slug,
            status: LPStatus.PUBLISHED,
          },
        });

  if (!lp && (slug === "__root__" || slug === "index")) {
    if (mapping.customDomainId) {
      lp = await prisma.landingPage.findFirst({
        where: {
          tenantId: mapping.tenantId,
          customDomainId: mapping.customDomainId,
          status: LPStatus.PUBLISHED,
        },
        orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
      });
    }
    if (!lp) {
      lp = await prisma.landingPage.findFirst({
        where: {
          tenantId: mapping.tenantId,
          status: LPStatus.PUBLISHED,
        },
        orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
      });
    }
  }

  if (!lp) {
    return renderNotFoundHtml(host, slug);
  }

  let html = "";
  if (lp.publishedBlobUrl) {
    const blob = await downloadTenantAssetBuffer(lp.publishedBlobUrl);
    if (blob) {
      html = blob.buffer.toString("utf8");
    }
  }
  if (!html) {
    try {
      html = await htmlAutocontido(lp.slug, mapping.tenantId);
    } catch {
      if (!lp.draftHtml) {
        return renderNotFoundHtml(host, slug);
      }
      html = lp.draftHtml;
    }
  }

  const seoMetadata =
    lp.seoMetadata && typeof lp.seoMetadata === "object" && !Array.isArray(lp.seoMetadata)
      ? (lp.seoMetadata as Record<string, unknown>)
      : null;
  const trackingConfig =
    lp.trackingConfig && typeof lp.trackingConfig === "object" && !Array.isArray(lp.trackingConfig)
      ? (lp.trackingConfig as Record<string, unknown>)
      : null;

  const headInject = buildHeadInjection(html, lp.title, seoMetadata, trackingConfig);
  const bodyInject = buildLeadCaptureInterceptorScript(lp.id, mapping.tenantId, lp.slug, host);

  if (headInject) {
    if (/<\/head>/i.test(html)) {
      html = html.replace(/<\/head>/i, `${headInject}\n</head>`);
    } else {
      html = `${headInject}\n${html}`;
    }
  }

  if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `${bodyInject}\n</body>`);
  } else {
    html = `${html}\n${bodyInject}`;
  }

  // Resolve e substitui logos e ativos da marca pelo logoUrl do tenant
  html = await resolveLpHtmlAssets(html, lp.tenantId);

  // Incrementa viewsCount de forma assíncrona sem bloquear a resposta
  void prisma.landingPage
    .update({
      where: { id: lp.id },
      data: { viewsCount: { increment: 1 } },
    })
    .catch(() => undefined);

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "s-maxage=60, stale-while-revalidate=600",
      Vary: "Host",
    },
  });
}
