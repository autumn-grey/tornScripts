// Styles for the Σ button and the word cloud popup.

/** Id of the popup overlay. */
export const POPUP_ID = "adc-popup";

/** Adds the script's stylesheet to the page. */
export function addStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
/* Sits on top of the header so it stays in front of any other script's icon there. */
.adc-open {
  position: absolute;
  top: 50%;
  left: 0;
  z-index: 50;
  width: 30px;
  height: 30px;
  margin: -15px 0 0;
  padding: 0;
  background: none;
  border: 0;
  cursor: pointer;
}
.adc-open svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  fill: #ffd21f;
  stroke: #8a6a00;
  stroke-width: .8;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, .6));
}
.adc-open span {
  position: relative;
  display: block;
  color: #222 !important;
  font: bold 14px/30px Arial, sans-serif;
  text-align: center;
  /* The star's body sits below the middle of its box, so the Σ drops to match. */
  padding-top: 2px;
}
.adc-open:hover svg { fill: #ffe25c; }

#${POPUP_ID} {
  position: fixed; inset: 0; z-index: 999999;
  display: flex; align-items: center; justify-content: center;
  padding: 8px; background: rgba(0, 0, 0, .6);
  color: #ddd !important;
}
#${POPUP_ID} * { color: inherit !important; }
#${POPUP_ID} .adc-win {
  display: flex; flex-direction: column;
  width: 100%; max-width: 760px; max-height: 92vh;
  background: #333; border-radius: 5px; box-shadow: 0 0 12px #000;
  font: 13px/17px Arial, Helvetica, sans-serif;
}
#${POPUP_ID} .adc-title {
  display: flex; justify-content: space-between; align-items: center;
  height: 34px; padding: 0 4px 0 10px;
  background: linear-gradient(to bottom, #555 0, #333 100%);
  border-radius: 5px 5px 0 0;
  color: #fff !important; font-weight: bold; text-shadow: 0 0 2px #000;
}
#${POPUP_ID} .adc-title span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
#${POPUP_ID} .adc-x {
  width: 30px; background: none; border: 0;
  color: #ccc !important; font-size: 22px; line-height: 30px; cursor: pointer;
}
#${POPUP_ID} .adc-body { padding: 10px; overflow: auto; text-align: center; }
#${POPUP_ID} .adc-body img { display: block; max-width: 100%; max-height: 74vh; margin: 0 auto; border-radius: 3px; }
#${POPUP_ID} .adc-foot {
  display: flex; justify-content: flex-end; gap: 6px; padding: 8px;
  background: #2b2b2b; border-top: 1px solid #111; border-radius: 0 0 5px 5px;
}
#${POPUP_ID} .adc-btn { min-width: 90px; }
#${POPUP_ID} .adc-btn:not(.torn-btn) {
  padding: 4px 12px; background: linear-gradient(to bottom, #646464 0, #3a3a3a 100%);
  border: 1px solid #111; border-radius: 5px; color: #eee !important; cursor: pointer;
}
#${POPUP_ID} .adc-btn[disabled] { opacity: .5; cursor: default; }
`;
  document.head.appendChild(style);
}
