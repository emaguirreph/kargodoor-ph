(() => {
  const makeCopyableMessagesEditable = () => {
    document.querySelectorAll("[data-copy-source]").forEach((button) => {
      const source = document.getElementById(button.dataset.copySource);
      if (source instanceof HTMLTextAreaElement) source.removeAttribute("readonly");
    });
  };

  const copySource = async (button) => {
    const source = document.getElementById(button.dataset.copySource);
    if (!source) return;

    const value = "value" in source ? source.value : source.textContent || "";
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(value);
    } catch {
      if (source instanceof HTMLTextAreaElement || source instanceof HTMLInputElement) {
        source.focus();
        source.select();
        source.setSelectionRange(0, value.length);
      }
      if (!document.execCommand("copy")) return;
    }

    const originalLabel = button.dataset.copyLabel || button.textContent || "Copy";
    button.dataset.copyLabel = originalLabel;
    button.textContent = "Copied!";
    window.setTimeout(() => { button.textContent = originalLabel; }, 1600);
  };

  document.addEventListener("DOMContentLoaded", makeCopyableMessagesEditable);
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("[data-copy-source]");
    if (button instanceof HTMLButtonElement) void copySource(button);
  });
})();
