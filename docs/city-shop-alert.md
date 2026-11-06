# City shop alert — spec

Planned feature for **Autumn's UI Enhancer**. Not started. Written up so it
can be picked up on another machine.

Torn lets you buy 100 items a day from the city's NPC shops. This tells you,
from any page, when you have not used them all up.

## What it does

**1. The City tab in the side navigation goes blue.**
Exactly as Crimes and Community Events do when they want attention. Use
whatever class Torn puts on those rather than inventing a colour.

**2. An icon appears in the row of status icons.**
Bits 'n' Bobs' own shop icon, the one the City page uses for that store.
Position: immediately **after** the faction icon (grey fist) and **before**
the Bank Investment icon (white building, green plus).

Note the icon strip is a horizontal bar on mobile and a column down the left
on desktop. The icon goes in the same place in both — it is the same list.

**3. Hovering it shows `X/100 items bought today`.**

**4. Clicking goes to https://www.torn.com/city.php.**
On mobile the first tap shows the same panel that hovering shows on desktop,
and a second tap follows the link.

All of it only shows while fewer than 100 have been bought.

## The open question: where the number comes from

Torn has no "bought today" counter in its API as far as we know. The plan is
the cumulative items-bought personal stat, minus its value at the last
midnight TCT.

**To settle before building**, with a public key:

```js
(async()=>{var k='PASTE_KEY_HERE';var mid=Math.floor(new Date().setUTCHours(0,0,0,0)/1000);var a=await(await fetch('https://api.torn.com/v2/user/personalstats?cat=items&key='+k)).json();console.log('items stats now:',a);var b=await(await fetch('https://api.torn.com/v2/user/personalstats?stat=itemsbought&timestamp='+mid+'&key='+k)).json();console.log('at midnight TCT:',b)})()
```

Two things to learn from it:

- Which field counts **city shop** purchases. `itemsbought` is the likely one;
  `itemsboughtabroad` is travel shopping and must not be counted.
- Whether asking for an earlier `timestamp` works. If it does, today's figure
  is exact. If it does not, record the count at the first page load after
  midnight and count up from there — which misses anything bought before the
  day's first page load.

## Implementation notes

**The key.** First feature in this script to need one. Follow
`faction-elimination-team-checker`: `GM_getValue`/`GM_setValue` for the key, a
plain `fetch` with `credentials: "omit"` against `api.torn.com` — no
`GM_xmlhttpRequest` and no `@connect` needed. The UI enhancer's `meta.json`
currently has `"grant": "none"` and will need the two GM grants. Per
`CLAUDE.md` the key never touches a file in this repo.

A field for it goes in the preferences panel beside the existing recipient
box (`panel.ts`).

**Rate limits.** Torn allows 100 calls a minute per key. One call per page
load is plenty; cache the figure and re-read it at most every few minutes.

**Selectors.** Three are needed, and all three want checking against the live
page rather than guessing: the side navigation's City link, the class Torn
puts on an attention-seeking nav item, and the status icon list. Expect
hashed class names and match on structure or stable prefixes, as `CLAUDE.md`
says.

**Versioning.** A new switch in `settings.ts` makes this a minor bump — the
first since 0.18.x.
