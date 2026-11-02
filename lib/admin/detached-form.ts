/**
 * A web form cannot sit inside another form. To show a small form (such as
 * Record payment) inside the Edit shipment form, its fields stay where they
 * are and point at a separate, empty <form> placed after the main one through
 * the HTML `form` attribute. The hidden fields (csrf, action, id) move into
 * that separate form. No script needed, so it works under the admin CSP.
 */
export function detachForm(html: string, formId: string): { inline: string; form: string } {
  const match = /<form\s([^>]*)>([\s\S]*?)<\/form>/.exec(html);
  if (!match) return { inline: html, form: "" };
  const [whole, attrs, inner] = match;
  const hiddenFields = inner!.match(/<input type="hidden"[^>]*>/g) ?? [];
  const fields = inner!
    .replace(/<input type="hidden"[^>]*>/g, "")
    .replace(/<(input|select|textarea|button)(?=[\s>])/g, `<$1 form="${formId}"`);
  return {
    inline: html.replace(whole!, () => `<div class="detached-form">${fields}</div>`),
    form: `<form id="${formId}" ${attrs}>${hiddenFields.join("")}</form>`,
  };
}
