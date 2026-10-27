"use strict";

const PAGE_PARTS = [
  "header",
  "hero",
  "statistics",
  "ranking",
  "members",
  "live-routes",
  "completed-routes",
  "fleet",
  "application",
  "tiktok",
  "footer",
];

function loadScript(src, integrity) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    if (integrity) {
      script.integrity = integrity;
      script.crossOrigin = "anonymous";
    }
    script.onload = resolve;
    script.onerror = () => reject(new Error(`No se pudo cargar el script ${src}.`));
    document.body.append(script);
  });
}

async function loadPagePart(name) {
  const response = await fetch(`./frontend/partials/${name}.html?v=oropesa-social-2`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`No se pudo cargar ${name}.html (estado ${response.status}).`);
  }

  const slot = document.querySelector(`[data-page-part="${name}"]`);
  if (!slot) {
    throw new Error(`No se encontró el espacio para la sección ${name}.`);
  }

  // Live Server injects its reload script into every .html response. Since
  // these files are HTML fragments, the injection can land inside an SVG and
  // corrupt the fragment before it is inserted into the page.
  const markup = await response.text();
  const cleanMarkup = markup.replace(
    /<!-- Code injected by live-server -->[\s\S]*?<\/script>/gi,
    "",
  );
  const template = document.createElement("template");
  template.innerHTML = cleanMarkup;
  slot.replaceWith(template.content);
}

async function loadPage() {
  await Promise.all(PAGE_PARTS.map(loadPagePart));
  await loadScript(
    "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
    "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=",
  );
  await loadScript("./frontend/js/app.js?v=fleet-smooth-3");
}

loadPage().catch((error) => {
  console.error("No se pudo iniciar la página de Oropesa.", error);
  const errorMessage = document.getElementById("page-load-error");
  if (errorMessage) {
    errorMessage.hidden = false;
    errorMessage.textContent = `No se pudo cargar una parte de la página: ${error.message}`;
    errorMessage.style.cssText =
      "max-width: 80rem; margin: 2rem auto; padding: 1rem; border: 1px solid #ef4444; border-radius: 0.75rem; color: #b91c1c;";
  }
});
