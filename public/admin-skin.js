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
  // Red numbers in the menu, like unread messages on a phone: leads not contacted
  // yet, new bookings to review, and customer proofs of payment to check.
  const showCount = (selector, n, label) => {
    const badge = document.querySelector(selector);
    if (!badge || !n) return 0;
    badge.textContent = n > 99 ? "99+" : String(n);
    badge.setAttribute("aria-label", label);
    badge.hidden = false;
    return n;
  };
  const getJson = (url) => fetch(url, { credentials: "same-origin", headers: { accept: "application/json" } })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const menuCounts = () => {
    if (!window.fetch || !document.querySelector("[data-leads-count]")) return;
    Promise.all([getJson("/admin/leads?count=1"), getJson("/admin/bookings?count=1")]).then(([leads, bookings]) => {
      const n = Number(leads && leads.toContact) || 0, b = Number(bookings && bookings.bookings) || 0, p = Number(bookings && bookings.proofs) || 0;
      const total = showCount("[data-leads-count]", n, n + " lead" + (n === 1 ? "" : "s") + " to contact")
        + showCount("[data-bookings-count]", b, b + " booking" + (b === 1 ? "" : "s") + " to review")
        + showCount("[data-proofs-count]", p, p + " proof" + (p === 1 ? "" : "s") + " of payment to check");
      // On a phone the menu starts closed, so show the total on the Menu button.
      const toggle = document.querySelector(".mobile-nav-toggle");
      if (total && toggle && !toggle.querySelector(".nav-count")) {
        const copy = document.createElement("span");
        copy.className = "nav-count";
        copy.textContent = total > 99 ? "99+" : String(total);
        copy.style.marginLeft = "8px";
        toggle.appendChild(copy);
      }
    });
  };
  const start = () => { run(); menuCounts(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
