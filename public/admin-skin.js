// Admin v5 skin: marks the current nav link and colors status pills by their state.
(function () {
  const run = () => {
    const path = location.pathname.replace(/\/$/, "") || "/admin";
    let best = null;
    let bestLength = 0;
    document.querySelectorAll(".admin-sidebar a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (href.includes("?")) return;
      if ((path === href || path.startsWith(href + "/")) && href.length > bestLength) {
        best = a;
        bestLength = href.length;
      }
    });
    if (best) best.classList.add("is-current");

    const tone = (text) => {
      const t = text.trim().toLowerCase();
      if (/^(paid|delivered|converted|approved|published|yes|active|malabon warehouse)$/.test(t)) return "green";
      if (/^(unpaid|partial|follow-up needed|quotation sent|sent|draft|awaiting supplier dispatch|pending warehouse receipt)$/.test(t)) return "amber";
      if (/^(cancelled|void|closed|inactive|no)$/.test(t)) return "red";
      if (/^new$/.test(t) || /(transit|port|gatepass|china warehouse|contacted)/.test(t)) return "blue";
      return "";
    };
    document.querySelectorAll(".status-pill").forEach((pill) => {
      const k = tone(pill.textContent || "");
      if (k) pill.dataset.k = k;
    });
    document.querySelectorAll("table").forEach((table) => {
      const heads = [...table.querySelectorAll("thead th, tr:first-child th")].map((th) => (th.textContent || "").trim().toLowerCase());
      heads.forEach((head, i) => {
        if (!/status|payment|contacted/.test(head)) return;
        table.querySelectorAll("tbody tr").forEach((tr) => {
          const td = tr.children[i];
          if (!td || td.querySelector(".status-pill,select,input,form,a,button")) return;
          const k = tone(td.textContent || "");
          if (!k) return;
          const pill = document.createElement("span");
          pill.className = "k-pill";
          pill.dataset.k = k;
          while (td.firstChild) pill.appendChild(td.firstChild);
          td.appendChild(pill);
        });
      });
    });
  };
  // Red number next to Leads in the menu, like unread messages on a phone: leads not contacted yet.
  const leadsCount = () => {
    const badge = document.querySelector("[data-leads-count]");
    if (!badge || !window.fetch) return;
    fetch("/admin/leads?count=1", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const n = Number(data && data.toContact);
        if (!n) return;
        badge.textContent = n > 99 ? "99+" : String(n);
        badge.setAttribute("aria-label", n + " lead" + (n === 1 ? "" : "s") + " to contact");
        badge.hidden = false;
        // On a phone the menu starts closed, so show the same number on the Menu button.
        const toggle = document.querySelector(".mobile-nav-toggle");
        if (toggle && !toggle.querySelector(".nav-count")) {
          const copy = badge.cloneNode(true);
          copy.removeAttribute("data-leads-count");
          copy.style.marginLeft = "8px";
          toggle.appendChild(copy);
        }
      })
      .catch(() => {});
  };
  const start = () => { run(); leadsCount(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
