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

## Where the number comes from

The count is today's **Item shop buy** log entries (log type 4200, in the
Shops category 86), summed by quantity:

```
GET /v2/user/log?log=4200&from=<midnight TCT>&limit=100&key=<key>
```

100 entries is enough: each purchase is at least one item, so 100 entries
already reach the limit. Abroad purchases are a different type (4201) and are
not counted. The key is a custom key with only `user` -> `log`, limited to the
Shops category; the Generate key link in the panel fills that in:
`preferences.php#tab=api?step=addNewKey&title=AutumnsUIEv1&user=log&logIds=86&logtypes=4200`.

Log type ids come from `/v2/torn/logtypes` (any public key).

**What did not work** (6 Nov 2026): the `cityitemsbought` personal stat. With
or without a `timestamp` it returns a daily snapshot (it still answered with
5 Nov's on 6 Nov), and `cat=trading` showed one purchase once, then fell back
and stayed there through two more. `/torn/cityshops` is shop stock, the same
for every player.

## Implementation notes

**The key.** First feature in this script to need one. It is kept in
`localStorage` (as FF Scouter V2 does), not `GM_setValue`: the script stays on
`"grant": "none"`, because any grant sandboxes it and would cut List Display's
request capture and Page Jump Block off from Torn's own code. Calls are a plain
`fetch` with `credentials: "omit"` against `api.torn.com`, so no
`GM_xmlhttpRequest` and no `@connect`.

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

## City Shop Stock Check

A second switch beside City Shop Purchase Check. The panel's "City Shop Items
to check" list (collapsible) offers every city shop item, grouped by shop;
the bag's popup then lists the stock of the ticked ones under each shop's
name, which links to that shop.

Stock comes from `GET /v2/torn/cityshops`, so the key also needs
`torn` -> `cityshops`; the Generate key link adds `&torn=cityshops`. It is
fetched with the count (every two minutes, and again after a purchase) and
only while the switch is on and at least one item is ticked. The reply is `{ cityshops: [{ id, name, items: [{ id, name, price, stock: { current, default } }] }] }`;
the shop page links in `cityStock.ts` are unconfirmed apart from Bits 'n' Bobs.
