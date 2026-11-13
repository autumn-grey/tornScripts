// Uploads a drawing to Pasteboard from inside Torn PDA, for a short link to paste into chat.
//
// PDA's web view will not put a picture on the clipboard, and copying a
// picture there copies its address, which for a drawing is the drawing
// itself as text. A link to a hosted copy is short, and Chat Enhanced shows
// Pasteboard links as pictures. Done the way Chat Enhanced - PDA does it:
// through PDA's own PDA_httpPost bridge, which takes only text, so the PNG's
// bytes go in a string one byte to a character.

const PASTEBOARD_URL = "https://www.pasteboard.co/api/upload";
/** Where an uploaded picture can be seen, by the file name Pasteboard gives it. */
const PASTEBOARD_PAGE = "https://pasteboard.co/";
const TIMEOUT_MS = 20_000;

/** What PDA's bridge hands back; the names have differed, so both are read. */
interface BridgeReply {
  status?: number;
  statusCode?: number;
  responseText?: string;
  body?: string;
}

type Post = (url: string, headers: Record<string, string>, body: string) => Promise<BridgeReply> | BridgeReply;

/** Returns PDA's POST bridge, or null outside PDA. */
function pdaPost(): Post | null {
  const page = window as unknown as {
    PDA_httpPost?: Post;
    flutter_inappwebview?: { callHandler?: (name: string, ...args: unknown[]) => Promise<BridgeReply> };
  };
  if (typeof page.PDA_httpPost === "function") return (url, headers, body) => page.PDA_httpPost!(url, headers, body);
  const bridge = page.flutter_inappwebview;
  if (typeof bridge?.callHandler === "function") {
    return (url, headers, body) => bridge.callHandler!("PDA_httpPost", url, headers, body);
  }
  return null;
}

/** Whether uploading is possible here. */
export function canUpload(): boolean {
  return pdaPost() !== null;
}

/** Returns bytes as a string of one character each. */
function byteString(bytes: Uint8Array): string {
  let out = "";
  // In slices: one call with every byte as an argument overflows the stack.
  for (let at = 0; at < bytes.length; at += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return out;
}

/** Uploads a PNG to Pasteboard and returns its link, or throws saying why not. */
export async function uploadPicture(png: Blob): Promise<string> {
  const post = pdaPost();
  if (!post) throw new Error("not in Torn PDA");

  const boundary = `----DoodleBoundary${Math.random().toString(36).slice(2)}`;
  const bytes = new Uint8Array(await png.arrayBuffer());
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="doodle.png"\r\n` +
    `Content-Type: image/png\r\n\r\n` +
    byteString(bytes) +
    `\r\n--${boundary}--\r\n`;
  // The charset tells the bridge to send the string's characters as single
  // bytes, which is what keeps the picture whole.
  const headers = { "Content-Type": `multipart/form-data; boundary=${boundary}; charset=ISO-8859-1` };

  let timer = 0;
  const late = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error("timed out")), TIMEOUT_MS);
  });
  let reply: BridgeReply;
  try {
    reply = (await Promise.race([Promise.resolve(post(PASTEBOARD_URL, headers, body)), late])) ?? {};
  } finally {
    clearTimeout(timer);
  }

  const status = Number(reply.status ?? reply.statusCode ?? 0);
  const text = String(reply.responseText ?? reply.body ?? "");
  let name: unknown = null;
  try {
    name = (JSON.parse(text) as { fileName?: unknown }).fileName;
  } catch {}
  // Pasteboard answers {"fileName": "AbC123.png"}; anything else is a failure.
  if (status === 200 && typeof name === "string" && /^[\w-]+\.\w+$/.test(name)) return PASTEBOARD_PAGE + name;
  throw new Error(status ? `Pasteboard answered ${status}` : "no answer from Pasteboard");
}
