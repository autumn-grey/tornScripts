// Pieces shared by the panels that act through Torn's own requests: posting
// the way Torn's forms do, showing its replies, and the boxes and buttons.

/** Torn's request token, which its own requests carry as ?rfcv=. */
const RFCV_COOKIE = /(?:^|;\s*)rfc_v=([^;]+)/;

/** Posts to one of Torn's pages the way its own forms do, and returns the reply's text. */
export async function postTorn(url: string, fields: Record<string, string>): Promise<string> {
  const rfcv = RFCV_COOKIE.exec(document.cookie)?.[1] ?? "";
  const response = await fetch(`${url}?rfcv=${encodeURIComponent(rfcv)}`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: new URLSearchParams(fields).toString(),
  });
  if (!response.ok) throw new Error(`Torn answered ${response.status}`);
  return response.text();
}

/** Returns an amount with everything but digits taken out, and no more than the limit. */
export function cleanAmount(value: string, max: string): string {
  const digits = value.replace(/\D+/g, "");
  const limit = Number(max);
  if (digits === "" || !(limit > 0)) return digits;
  return String(Math.min(Number(digits), limit));
}

/**
 * Puts Torn's reply text in an element, keeping its bold and its links.
 *
 * Rebuilt node by node rather than set as HTML, so nothing else in the
 * reply can run or restyle the page.
 */
export function showReply(target: HTMLElement, html: string): void {
  const parsed = new DOMParser().parseFromString(html, "text/html").body;
  const copy = (from: Node, to: Node): void => {
    for (const node of from.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        to.appendChild(document.createTextNode(node.textContent ?? ""));
      } else if (node instanceof Element && node.tagName === "B") {
        const bold = document.createElement("b");
        copy(node, bold);
        to.appendChild(bold);
      } else if (node instanceof Element && node.tagName === "A") {
        const href = node.getAttribute("href") ?? "";
        const link = document.createElement("a");
        if (href.startsWith("/")) link.href = href;
        link.className = "aue-send-link";
        copy(node, link);
        to.appendChild(link);
      } else {
        copy(node, to);
      }
    }
  };
  target.replaceChildren();
  copy(parsed, target);
}

/** Returns a labelled text box for a panel's form. */
export function field(label: string, className: string, value: string): HTMLLabelElement {
  const wrap = document.createElement("label");
  wrap.className = `aue-send-field ${className}`;
  const caption = document.createElement("span");
  caption.textContent = label;
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  wrap.append(caption, input);
  return wrap;
}

/** Returns one of Torn's own buttons. */
export function tornButton(text: string, className: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `torn-btn ${className}`;
  button.textContent = text;
  return button;
}
