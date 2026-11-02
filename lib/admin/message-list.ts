import { esc } from "./ui";

/**
 * Copy-ready messages as a list, one row per message, like Quotation
 * Notifications: click a row to open it, then Copy Message. Uses <details>,
 * so it needs no inline script (the copy button uses /admin-copy.js).
 */
export function messageList(options: {
  groupId: string;
  messages: Array<[string, string, string]>;
  /** The row that opens first and gets the marker, such as the current status. */
  openKey?: string;
  /** Marker shown on that row; empty string hides it. */
  openLabel?: string;
  ariaLabelSuffix?: string;
}): string {
  const { messages, openLabel = "current", ariaLabelSuffix = "message" } = options;
  const group = options.groupId.replace(/[^A-Za-z0-9_-]/g, "-");
  return messages
    .map(([key, title, body]) => {
      const id = `${group}-${key.replace(/[^A-Za-z0-9_-]/g, "-")}`;
      const isOpen = Boolean(options.openKey) && key === options.openKey;
      const marker = isOpen && openLabel ? ` <span class="k-pill" data-k="green">${esc(openLabel)}</span>` : "";
      return `<details class="customer-notification"${isOpen ? " open" : ""}>
        <summary>${esc(title)}${marker}</summary>
        <textarea id="${esc(id)}" aria-label="${esc(title)} ${esc(ariaLabelSuffix)}" style="min-height:260px;white-space:pre-wrap">${esc(body)}</textarea>
        <div class="actions"><button type="button" class="copy-shipment-message" data-copy-source="${esc(id)}">Copy Message</button></div>
      </details>`;
    })
    .join("");
}
