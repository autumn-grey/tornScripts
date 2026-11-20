// Chat Enhanced - Summary ENHANCED
//
// Adds a Σ button to each Torn chat box header. One click reads back the last
// 300 messages of that chat and draws their words as a word cloud in the
// shape of ASK / DIVA, shown as a PNG with a button to copy the image.

import { lookForChats, MAX_MESSAGES, readBack } from "./chat";
import { countWords, drawCloud } from "./cloud";
import { addStyles, POPUP_ID } from "./styles";

let popup: HTMLElement | null = null;
let running = false;
let imageUrl = "";

/** Removes the popup and frees its image. */
function closePopup(): void {
  popup?.remove();
  popup = null;
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = "";
}

/** Opens an empty popup and returns its body and footer. */
function openPopup(title: string): { body: HTMLElement; foot: HTMLElement } {
  closePopup();
  popup = document.createElement("div");
  popup.id = POPUP_ID;
  popup.innerHTML = `
    <div class="adc-win">
      <div class="adc-title"><span></span><button type="button" class="adc-x">×</button></div>
      <div class="adc-body"></div>
      <div class="adc-foot"></div>
    </div>`;
  popup.querySelector(".adc-title span")!.textContent = `Ask Diva - ${title}`;
  popup.querySelector<HTMLElement>(".adc-x")!.onclick = closePopup;
  popup.addEventListener("click", (e) => {
    if (e.target === popup) closePopup();
  });
  document.body.appendChild(popup);
  return {
    body: popup.querySelector<HTMLElement>(".adc-body")!,
    foot: popup.querySelector<HTMLElement>(".adc-foot")!,
  };
}

/** Puts a PNG on the clipboard. */
async function copyImage(png: Blob): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

/** Reads a chat back and shows its word cloud. */
async function run(_box: HTMLElement, scroller: HTMLElement, title: string): Promise<void> {
  if (running) return;
  running = true;
  const { body, foot } = openPopup(title);
  const status = document.createElement("div");
  status.textContent = "Reading chat...";
  body.appendChild(status);
  const mine = popup;

  try {
    if (!scroller.isConnected) {
      status.textContent = "Lost the chat window, close and reopen it.";
      return;
    }
    const messages = await readBack(
      scroller,
      (n) => (status.textContent = `Reading back... ${Math.min(n, MAX_MESSAGES)} / ${MAX_MESSAGES}`),
      () => popup !== mine,
    );
    if (popup !== mine) return;

    const words = countWords(messages.map((m) => m.text));
    if (!words.length) {
      status.textContent = "Could not read any messages.";
      return;
    }

    status.textContent = "Drawing...";
    const png = await drawCloud(words, (n) => (status.textContent = `Drawing... ${n} words`));
    if (popup !== mine) return;

    imageUrl = URL.createObjectURL(png);
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = "Ask Diva word cloud";
    body.replaceChildren(img);

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "torn-btn adc-btn";
    copy.textContent = "Copy";
    copy.onclick = async () => {
      try {
        await copyImage(png);
        copy.textContent = "Copied";
      } catch (err) {
        console.error("[Chat Enhanced - Summary ENHANCED]", err);
        copy.textContent = "Copy failed";
      }
      setTimeout(() => (copy.textContent = "Copy"), 1500);
    };
    foot.appendChild(copy);
  } catch (err) {
    console.error("[Chat Enhanced - Summary ENHANCED]", err);
    status.textContent = `Something broke: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    running = false;
  }
}

/** Sets up the stylesheet and keeps the button in every chat box. */
function start(): void {
  addStyles();
  const onOpen = (box: HTMLElement, sc: HTMLElement, title: string) => void run(box, sc, title);

  // Chat re-renders constantly, so rescans are batched rather than run per mutation.
  let pending: number | null = null;
  new MutationObserver(() => {
    if (pending !== null) return;
    pending = window.setTimeout(() => {
      pending = null;
      lookForChats(onOpen);
    }, 800);
  }).observe(document.body, { childList: true, subtree: true });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePopup();
  });
  lookForChats(onOpen);
}

start();
