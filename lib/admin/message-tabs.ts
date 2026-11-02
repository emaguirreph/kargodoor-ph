import { esc } from "./ui";
import { copyButton, copyScript } from "./shipping-instructions";

/**
 * Renders copy-ready messages as tabs, one tab per message. Pure CSS (radio
 * inputs + :checked), so it works under the admin's script-src 'self' CSP
 * without any inline script. Arrow keys move between tabs like any radio group.
 */
export function messageTabs(options: {
  groupId: string;
  messages: Array<[string, string, string]>;
  activeKey?: string;
  ariaLabelSuffix?: string;
}): string {
  const { messages, ariaLabelSuffix = "message" } = options;
  if (!messages.length) return "";
  const group = options.groupId.replace(/[^A-Za-z0-9_-]/g, "-");
  const activeKey = messages.some(([key]) => key === options.activeKey) ? options.activeKey : messages[0]![0];
  const safeKey = (key: string) => key.replace(/[^A-Za-z0-9_-]/g, "-");

  const rules = messages
    .map(([key]) => {
      const k = safeKey(key);
      return `#${group} .message-tab-input[data-tab="${k}"]:checked~.message-tab-panels [data-panel="${k}"]{display:block}`
        + `#${group} .message-tab-input[data-tab="${k}"]:checked~.message-tab-list [data-for="${k}"]{background:var(--k-blue,#0753ad);color:#fff;border-color:var(--k-blue,#0753ad)}`
        + `#${group} .message-tab-input[data-tab="${k}"]:focus-visible~.message-tab-list [data-for="${k}"]{outline:3px solid var(--k-green-2,#0099cf);outline-offset:2px}`;
    })
    .join("");

  const inputs = messages
    .map(([key]) => {
      const k = safeKey(key);
      return `<input type="radio" class="message-tab-input" name="${group}" id="${group}-${k}" data-tab="${k}"${key === activeKey ? " checked" : ""}>`;
    })
    .join("");

  const labels = messages
    .map(([key, title]) => {
      const k = safeKey(key);
      return `<label class="message-tab" for="${group}-${k}" data-for="${k}">${esc(title)}${key === options.activeKey ? ' <span class="message-tab-current">• current</span>' : ""}</label>`;
    })
    .join("");

  const panels = messages
    .map(([key, title, body]) => {
      const k = safeKey(key);
      const messageId = `${group}-${k}-text`;
      return `<div class="message-tab-panel" data-panel="${k}">
        <h3>${esc(title)}</h3>
        <textarea id="${esc(messageId)}" readonly aria-label="${esc(title)} ${esc(ariaLabelSuffix)}" style="min-height:320px;white-space:pre-wrap">${esc(body)}</textarea>
        <div class="actions">${copyButton(messageId, `Copy ${esc(title)}`)}</div>
      </div>`;
    })
    .join("");

  const style = `<style>`
    + `.message-tabs{margin-top:12px}`
    + `.message-tab-input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}`
    + `.message-tab-list{display:flex;flex-wrap:wrap;gap:8px;padding-bottom:14px;border-bottom:1px solid var(--k-line,#d5e4ed)}`
    + `.message-tab{box-sizing:border-box;display:inline-flex;align-items:center;gap:4px;margin:0;padding:8px 14px;min-height:40px;border:1.5px solid var(--k-line,#c6dce9);border-radius:999px;background:var(--k-surface-2,#eef3fb);color:var(--k-fg,#154876);font-size:.9rem;font-weight:700;cursor:pointer;transition:background .15s,color .15s}`
    + `.message-tab:hover{border-color:var(--k-blue-2,#0753ad)}`
    + `.message-tab-current{font-weight:600;font-size:.78rem;opacity:.85}`
    + `.message-tab-panel{display:none;padding-top:14px}`
    + `.message-tab-panel h3{margin:0 0 6px;font-size:1.05rem}`
    + `.message-tab-panel textarea{box-sizing:border-box;width:100%}`
    + `@media(max-width:520px){.message-tab{flex:1 1 calc(50% - 8px);flex-wrap:wrap;justify-content:center;text-align:center}}`
    + rules
    + `</style>`;

  return `${style}<div class="message-tabs" id="${group}">${inputs}<div class="message-tab-list" role="radiogroup" aria-label="Choose a ${esc(ariaLabelSuffix)}">${labels}</div><div class="message-tab-panels">${panels}</div></div>${copyScript()}`;
}
