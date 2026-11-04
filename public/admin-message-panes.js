// Message lists like the FAQ page (Em, 2026-11-04): message names on the left,
// the chosen message in a big box on the right. On a phone the list stays as
// it was: tap a name and the message opens right under it.
(function () {
  const build = (items) => {
    const parent = items[0].parentNode;
    const wrap = document.createElement("div");
    wrap.className = "msg-panes";
    const nav = document.createElement("div");
    nav.className = "msg-nav";
    nav.setAttribute("role", "tablist");
    const pane = document.createElement("div");
    pane.className = "msg-pane";
    parent.insertBefore(wrap, items[0]);
    wrap.append(nav, pane);
    const start = Math.max(0, items.findIndex((d) => d.open));
    const buttons = items.map((details, index) => {
      const summary = details.querySelector("summary");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "msg-q";
      button.setAttribute("role", "tab");
      const n = document.createElement("span");
      n.className = "msg-n";
      n.textContent = String(index + 1).padStart(2, "0");
      const label = document.createElement("span");
      label.className = "msg-label";
      label.innerHTML = summary ? summary.innerHTML : "Message";
      const chev = document.createElement("span");
      chev.className = "msg-chev";
      chev.setAttribute("aria-hidden", "true");
      chev.textContent = "›";
      button.append(n, label, chev);
      nav.appendChild(button);
      pane.appendChild(details);
      button.addEventListener("click", () => select(index));
      return button;
    });
    const select = (index) => {
      items.forEach((details, i) => {
        const on = i === index;
        details.classList.toggle("is-active", on);
        buttons[i].setAttribute("aria-selected", on ? "true" : "false");
        if (on) details.open = true;
      });
    };
    select(start);
  };
  const run = () => {
    const seen = new Set();
    document.querySelectorAll("details.customer-notification").forEach((first) => {
      if (seen.has(first)) return;
      const group = [...first.parentNode.children].filter((el) => el.matches("details.customer-notification"));
      group.forEach((d) => seen.add(d));
      if (group.length >= 2) build(group);
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
