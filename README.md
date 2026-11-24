# Boat passenger manifest and capacity check

A free, offline, single-page tool that builds the passenger manifest for one
voyage of a small Philippine passenger boat, checks the number of people aboard
against the vessel's authorised capacity, prints a manifest the operator can
hand over, and closes the voyage with an arrival record.

It is one HTML file, three small scripts and two stylesheets. No build step, no
dependencies, no accounts, no network access. Everything typed in stays in the
browser on the device it was typed on.

## What it does

- **A manifest per voyage.** Vessel and vessel number, operator, master and
  licence, departure point, departure date and time, destination, crew aboard,
  life vests aboard, and every passenger with the particulars you require of
  them. Passengers can be typed one at a time or pasted from a ticket list.
- **Capacity enforcement, as a refusal.** Passengers (after whatever child rule
  you have set) plus crew are compared with the authorised passenger capacity
  you entered. Over capacity, the manifest is **refused** and the tool names
  how many persons must come off. Printing stays locked until they do.
  The authorised capacity is a required field with no default: a guessed
  capacity is the mistake this tool exists to prevent.
- **Head count integrity.** The total written on the manifest must equal the
  names listed. A difference is an error that names both numbers, not a
  rounding. Leave the total blank and it is taken from the list.
- **Completeness.** Every passenger must carry the particulars you have marked
  required, and no row is ever accepted without a name. The refusal names the
  row and the field that is missing.
- **Duplicate detection.** The same name and age entered twice is refused, with
  the row numbers, because a double entry inflates the head count and hides
  somebody who is actually missing. The same name at a different age is a
  warning, not a refusal — families reuse names.
- **A printable manifest.** One sheet: the voyage, the full passenger table, the
  totals against capacity, the child rule in force, the master's certification
  and signature lines, and the arrival record. Print or save it as a PDF; the
  rest of the page does not print.
- **An arrival record that closes the voyage.** A voyage stays visibly **open**
  until the arrival time and the head count on arrival are entered and
  reconcile. An arrival before the departure is refused. A head count that does
  not match the number who departed is refused, and names how many persons are
  unaccounted for.
- **A voyage log** on the device, searchable by vessel, destination, date or
  passenger name, which shows at a glance how many voyages are still open.

## Who it is for

Island-hopping, ferry, motorbanca and dive-boat operators, and the boat crews
and dispatchers who write the manifest at the jump-off point, usually on a phone
and usually with no signal.

## The requirement this is built around

Passenger-manifest requirements in the Philippines are set by the **Philippine
Coast Guard** and the **Maritime Industry Authority (MARINA)**, and they differ
by vessel and by route.

Three things in this tool are sourced to a named document — **DOTC Department
Order No. 2000-25** (18 April 2000), *Guidelines for Checking Unauthorized
Persons on Board Domestic Vessels*, which applies to Philippine-registered
passenger vessels in the domestic trade:

| What | Where |
| --- | --- |
| Persons allowed aboard are "limited only to the authorized passenger carrying capacity of the vessel including the ship's crew" — so crew are counted against capacity | § III.A |
| The manifest indicates "the name, age and gender of passengers listed", and goes with the Master's Oath of Safe Departure to the nearest Coast Guard unit "at least one (1) hour before the scheduled departure" | § IV.B |
| Overcrowding beyond the authorised capacity is penalised, reckoned as excess passengers × 200% × the passage rate for the voyage | § VI.A.12 |

That order is from 2000. Confirm it has not been amended or superseded for your
vessel and route before relying on any of it.

**What we could not source, and therefore do not assert:** your vessel's
authorised passenger capacity (no default, no table — you type it in from your
own certificate); whether children or infants count differently toward capacity
and from what age (a rule you set, which starts at counting every person as
one); how many life vests of which sizes are required (we only ever check one
per person aboard, which is a floor, not the requirement); and the current
prescribed manifest form and the current MARINA issuance on submitting
manifests, neither of which is reproduced here.

Every figure the tool uses is declared once as a named constant in
`assets/manifest.js`, labelled either *sourced* with its document or
*indicative*, printed in the page's own "Assumptions & constants" panel, and
overridable by the operator.

## How to run it

Serve the folder over HTTP and open it. Any static server or free port will do:

```sh
python3 -m http.server 8137
```

Then open `http://localhost:8137/`. It also works from a file manager, and once
loaded it works with the network off — which is the point, since the dock rarely
has a signal.

## Tests

The rules live in `assets/manifest.js`, a pure module with no DOM, no storage,
no network and no clock: every function is a function of its arguments. The
table-driven suite runs either way:

```sh
node tests/manifest.test.js
```

or open `tests/index.html` in a browser. 488 assertions across 16 groups cover
capacity refusal and the number over, a capacity that is blank or zero, the
child rules at every boundary, head-count mismatches in both directions,
duplicate entries, missing particulars, life-vest shortfall, a return time
before departure, a voyage left open, a head count on arrival that does not
reconcile, ticket-list parsing, and the guarantee that no figure the page shows
can ever be `NaN` or `Infinity`.

## Honesty note

**This tool records and prints. It transmits nothing and files nothing.** It does
not submit a manifest to the Coast Guard, to MARINA, to a port authority or to
anyone else, and it makes no network requests of any kind. Handing the manifest
in is still the operator's job, by whatever means the boarding officer requires.

The printed sheet is a complete record of the voyage, not a reproduction of any
prescribed form: we do not reproduce official forms, because we cannot verify
which version is current. Copy the particulars onto the form you are given if
you are given one.

The arithmetic is exact and the refusals are real, but every figure it reasons
from was typed in by the operator. It does not know your vessel, it cannot
confirm your capacity, it does not clear you to sail, and it is not legal
advice. It is no substitute for the inspection, the certificates, or the
master's judgement. Where this tool and the document in your hand disagree, the
document wins.

The voyage log is stored in this browser on this device only. Clearing your
browser data erases it, so print or save a PDF of every manifest you need to
keep.

MIT licensed.
