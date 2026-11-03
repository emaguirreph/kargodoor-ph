// Admin "← Back" button.
// Lives in its own file because the admin CSP (script-src 'self') blocks inline
// scripts, and the admin sends Referrer-Policy: no-referrer, so document.referrer
// is always empty. Instead we keep a small per-tab trail of admin pages in
// sessionStorage and send the button to the previous real page.
(function () {
  const KEY = "kd-admin-trail";
  const MAX = 30;
  const ROOTS = new Set(["/admin", "/admin/dashboard", "/admin/customers", "/admin/shipments", "/admin/quotations", "/admin/invoices", "/admin/leads", "/admin/insights", "/admin/finance", "/admin/finance/expenses", "/admin/finance/cash", "/admin/finance/accounts", "/admin/finance/reports", "/admin/activity", "/admin/import-export", "/admin/rates-guide", "/admin/nihao-rates"]);
  // One-time notices added after a save; they do not make it a different page.
  const FLASH = ["saved", "deleted", "archived", "updated", "portal_saved", "nihao_paid", "nihao_file", "customer_paid"];
  const FORM = ["edit", "new", "archive", "delete"];

  const normalize = (href) => {
    const url = new URL(href, location.origin);
    FLASH.forEach((key) => url.searchParams.delete(key));
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const query = url.searchParams.toString();
    return path + (query ? "?" + query : "");
  };
  const isForm = (entry) => {
    const params = new URL(entry, location.origin).searchParams;
    return FORM.some((key) => params.has(key));
  };
  const read = () => {
    try {
      const list = JSON.parse(sessionStorage.getItem(KEY) || "[]");
      return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  };
  const write = (list) => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
    } catch {
      /* storage unavailable: the fallback parent link still works */
    }
  };

  const here = normalize(location.href);
  let trail = read();
  const last = trail[trail.length - 1];
  const before = trail[trail.length - 2];
  if (here === last) {
    // reload or a save that came back to the same page
  } else if (here === before) {
    trail.pop(); // browser back
  } else {
    trail.push(here);
  }
  write(trail);

  // Where to go when the trail has nothing useful (new tab, bookmark).
  const parent = () => {
    const url = new URL(here, location.origin);
    const id = url.searchParams.get("id");
    if (id && FORM.some((key) => url.searchParams.has(key))) return url.pathname + "?id=" + encodeURIComponent(id);
    if (url.search) return url.pathname;
    return "/admin/dashboard";
  };
  const target = () => {
    const leavingForm = isForm(here);
    for (let i = trail.length - 2; i >= 0; i--) {
      const entry = trail[i];
      if (entry === here) continue;
      // After saving a form, skip back over the form itself.
      if (!leavingForm && isForm(entry)) continue;
      return { entry, index: i };
    }
    return null;
  };

  const run = () => {
    const button = document.querySelector("[data-admin-page-back]");
    if (!button) return;
    const url = new URL(location.href);
    const path = url.pathname.replace(/\/+$/, "") || "/admin";
    const detail = ["id", ...FORM].some((key) => url.searchParams.has(key));
    if (ROOTS.has(path) && !detail) {
      button.closest(".admin-page-back")?.remove();
      return;
    }
    button.addEventListener("click", () => {
      const found = target();
      if (found) {
        write(trail.slice(0, found.index + 1));
        location.assign(found.entry);
        return;
      }
      const fallback = parent();
      write(trail.slice(0, -1).concat(normalize(fallback)));
      location.assign(fallback);
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
