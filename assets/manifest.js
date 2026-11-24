/*
 * Boat passenger manifest rules — pure module.
 *
 * No DOM, no storage, no network, no clock. Every function here is a function of
 * its arguments only, so the whole rule set is testable from a table
 * (see tests/manifest.test.js).
 *
 * WHAT THIS MODULE IS FOR
 *   A passenger manifest exists so that after an incident the authorities know
 *   exactly who was aboard. Completeness and an honest head count are therefore
 *   the product; everything below is a check on one of those two things.
 *
 * WHAT IT IS NOT
 *   It is not a copy of any authority's form, table or schedule, and it files
 *   nothing with anybody. Requirements for a passenger manifest — which
 *   particulars must appear, how a vessel's capacity is reckoned, when the
 *   manifest must be handed in — are set by the authority and differ by vessel
 *   and route. So every requirement in this file is a NAMED CONSTANT, each one
 *   marked either "sourced" (with the document it came from) or "indicative"
 *   (our starting figure, which we could not source), and every one of them is
 *   meant to be overridden by the operator from the vessel's own papers.
 *
 * SOURCES USED (named, so you can check them)
 *   DO-2000-25  DOTC Department Order No. 2000-25, 18 April 2000, "Guidelines
 *               for Checking Unauthorized Persons on Board Domestic Vessels".
 *               Applies to Philippine-registered passenger vessels in the
 *               domestic trade. Used here for three things only:
 *                 III.A  the authority to allow persons on board is "limited
 *                        only to the authorized passenger carrying capacity of
 *                        the vessel including the ship's crew"
 *                 IV.B   the passenger manifest, "indicating the name, age and
 *                        gender of passengers listed", together with the
 *                        Master's Oath of Safe Departure, is submitted to the
 *                        nearest Coast Guard unit "at least one (1) hour before
 *                        the scheduled departure"
 *                 VI.A.12 overcrowding beyond the authorized passenger capacity
 *                        is penalised, the fine reckoned as total excess
 *                        passengers x 200% x passage rate for the entire voyage
 *               It is a 2000 order and may since have been amended, superseded
 *               or replaced for your route. Check before you rely on it.
 *
 * WHAT WE COULD NOT SOURCE, AND THEREFORE DO NOT ASSERT
 *   - The authorised passenger capacity of any vessel. There is no default and
 *     no table of them here. It is a required input, read off your vessel's own
 *     certificate.
 *   - Whether children or infants count differently toward capacity, and from
 *     what age. We found no general rule we could stand behind, so the child
 *     rule is something you set, and it starts at "every person counts as one".
 *   - The number and sizes of life vests required. We only ever check one per
 *     person aboard, which is a floor, not the requirement.
 *   - The current prescribed manifest form, and the current Maritime Industry
 *     Authority issuance on submitting manifests. Not reproduced.
 */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------------ *
   * AUTHORITY — named, not linked to any transmission. This tool sends  *
   * nothing to any of these bodies.                                     *
   * ------------------------------------------------------------------ */
  var AUTHORITY = {
    coastGuard: "Philippine Coast Guard",
    marina: "Maritime Industry Authority (MARINA)",
    manifestOrder: "DOTC Department Order No. 2000-25 (18 April 2000)",
    manifestOrderTitle: "Guidelines for Checking Unauthorized Persons on Board Domestic Vessels",
    capacitySources: [
      "Certificate of Number (small vessels; the figure is often painted on the hull)",
      "Certificate of Compliance carried aboard a motorbanca",
      "Passenger Ship Safety Certificate (certificated passenger ships)"
    ],
    transmits: "nothing"
  };

  /* ------------------------------------------------------------------ *
   * NAMED CONSTANTS. Nothing in this module uses a number that is not   *
   * declared here or typed in by the operator.                          *
   * ------------------------------------------------------------------ */

  /* Deliberately absent: there is no default authorised capacity, because a
     guessed capacity is the exact mistake this tool exists to prevent. */
  var AUTHORISED_CAPACITY_DEFAULT = null;

  /* DO-2000-25 III.A — the authorised capacity is reckoned to include crew. */
  var CREW_COUNTS_AGAINST_CAPACITY = true;

  /* DO-2000-25 IV.B — the particulars the order names for the manifest. */
  var PARTICULARS_SOURCED = ["name", "age", "sex"];

  /* Our starting required set. Address and contact are what operators are
     usually asked for after an incident, not something we could source. */
  var REQUIRED_PARTICULARS_DEFAULT = ["name", "age", "sex", "nationality", "contact"];

  /* A row with no name identifies nobody, so the name is never optional. */
  var NAME_ALWAYS_REQUIRED = true;

  var PARTICULARS = [
    { key: "name", label: "Full name", sourced: true },
    { key: "age", label: "Age", sourced: true },
    { key: "sex", label: "Sex", sourced: true },
    { key: "nationality", label: "Nationality", sourced: false },
    { key: "address", label: "Address", sourced: false },
    { key: "contact", label: "Contact number", sourced: false },
    { key: "remarks", label: "Remarks / ticket no.", sourced: false }
  ];

  /* Child rule — a rule the operator sets, never one we assume.
     "full" is the default and the safe reading: every person aboard is a person. */
  var CHILD_RULE_FULL = "full";
  var CHILD_RULE_HALF = "half_under";
  var CHILD_RULE_EXEMPT = "exempt_under";
  var CHILD_RULE_DEFAULT = CHILD_RULE_FULL;
  var CHILD_RULES = [
    { key: CHILD_RULE_FULL, label: "Every person counts as one, children and infants included" },
    { key: CHILD_RULE_HALF, label: "Children under the age below count as half a person" },
    { key: CHILD_RULE_EXEMPT, label: "Children under the age below are not counted against capacity" }
  ];

  /* Indicative only. We could not source a general child age for capacity in
     this trade; set it from your own authority's document. */
  var CHILD_AGE_THRESHOLD_DEFAULT = 12;

  /* Half-persons are rounded UP to the next whole person: the conservative
     direction, and the only one that cannot put an extra body on the boat. */
  var CHILD_HALF_ROUNDING = "up";

  /* One life vest per person aboard is a floor we are confident of, not the
     requirement. Authorities also require child-size vests and spares, and we
     could not source that schedule, so we do not check it. */
  var LIFEJACKET_RATIO_DEFAULT = 1;

  /* DO-2000-25 IV.B — one hour before scheduled departure. Indicative: the
     order is from 2000 and your boarding officer may ask for longer. */
  var SUBMISSION_LEAD_MINUTES_DEFAULT = 60;

  /* DO-2000-25 VI.A.12 — excess passengers x 200% x passage rate. Indicative:
     the schedule in force governs, and we do not reproduce it. */
  var OVERLOAD_FINE_MULTIPLIER_DEFAULT = 2.0;

  /* Not rules. Limits that keep the page and the printed sheet usable. */
  var MAX_PASSENGERS = 400;
  var AGE_SANITY_MAX = 120;

  /* The constant table the page prints, so the figures on screen and the
     figures in the code can never drift apart. */
  var CONSTANT_NOTES = [
    { key: "AUTHORISED_CAPACITY_DEFAULT", value: "none — required input",
      label: "no default", source: "deliberately absent",
      note: "The authorised passenger capacity is read off the vessel's own certificate and typed in. This tool ships no table of capacities and will not issue a manifest until the figure is entered." },
    { key: "CREW_COUNTS_AGAINST_CAPACITY", value: "yes",
      label: "sourced", source: AUTHORITY.manifestOrder + " III.A",
      note: "Persons allowed on board are \"limited only to the authorized passenger carrying capacity of the vessel including the ship's crew\", so crew are added to passengers before the comparison." },
    { key: "PARTICULARS_SOURCED", value: PARTICULARS_SOURCED.join(", "),
      label: "sourced", source: AUTHORITY.manifestOrder + " IV.B",
      note: "The order names a manifest \"indicating the name, age and gender of passengers listed\". Those three are the only particulars we can point at a document for." },
    { key: "REQUIRED_PARTICULARS_DEFAULT", value: REQUIRED_PARTICULARS_DEFAULT.join(", "),
      label: "indicative", source: "not sourced beyond the three above",
      note: "Nationality, address and contact are what operators are commonly asked for after an incident. We could not source them as requirements. Switch any of them off, or switch address on, to match what your boarding officer asks for." },
    { key: "CHILD_RULE_DEFAULT", value: CHILD_RULE_DEFAULT,
      label: "indicative", source: "set by the operator",
      note: "Starts at counting every person aboard as one person. If your authority allows a different reckoning for children, set it yourself — this tool does not know your authority's rule and will not assume a concession." },
    { key: "CHILD_AGE_THRESHOLD_DEFAULT", value: CHILD_AGE_THRESHOLD_DEFAULT + " years",
      label: "indicative", source: "not sourced",
      note: "A starting figure only. \"Under\" is strict: a passenger whose age equals the threshold is counted as an adult." },
    { key: "CHILD_HALF_ROUNDING", value: CHILD_HALF_ROUNDING,
      label: "our choice", source: "conservative by design",
      note: "Half-persons are rounded up to the next whole person. Rounding down could put one more body aboard than the certificate allows." },
    { key: "LIFEJACKET_RATIO_DEFAULT", value: LIFEJACKET_RATIO_DEFAULT + " per person aboard",
      label: "floor, not the requirement", source: "not sourced",
      note: "Checked only if you enter how many vests are aboard. Child-size vests and spares are required on top of this in most rules we saw, and we could not source the schedule, so we do not check it." },
    { key: "SUBMISSION_LEAD_MINUTES_DEFAULT", value: SUBMISSION_LEAD_MINUTES_DEFAULT + " minutes",
      label: "sourced, may be stale", source: AUTHORITY.manifestOrder + " IV.B",
      note: "The manifest with the Master's Oath of Safe Departure goes to the nearest Coast Guard unit at least one hour before scheduled departure. A 2000 order: confirm the current lead time locally." },
    { key: "OVERLOAD_FINE_MULTIPLIER_DEFAULT", value: OVERLOAD_FINE_MULTIPLIER_DEFAULT + " x passage rate per excess passenger",
      label: "indicative", source: AUTHORITY.manifestOrder + " VI.A.12",
      note: "Shown only to put a figure on an overloaded departure. The penalty schedule in force governs, separate MARINA penalties and suspension of the operator's franchise may apply, and we reproduce no schedule." },
    { key: "MAX_PASSENGERS", value: String(MAX_PASSENGERS),
      label: "not a rule", source: "page limit",
      note: "How many rows this page will hold. It is not a capacity and has nothing to do with your vessel." }
  ];

  /* ------------------------------------------------------------------ *
   * SMALL PURE HELPERS                                                  *
   * ------------------------------------------------------------------ */

  function isNum(v) { return typeof v === "number" && isFinite(v); }

  /* A count field: blank, junk or negative becomes 0. Never NaN. */
  function toCount(v) {
    if (v === null || v === undefined || v === "") { return 0; }
    var n = typeof v === "number" ? v : parseFloat(String(v).replace(/[,\s]/g, ""));
    if (!isFinite(n) || n < 0) { return 0; }
    return Math.floor(n);
  }

  /* An optional whole number: blank or junk becomes null, so "not entered" and
     "entered as zero" stay different things. */
  function toOptionalInt(v) {
    if (v === null || v === undefined || v === "") { return null; }
    var n = typeof v === "number" ? v : parseFloat(String(v).replace(/[,\s]/g, ""));
    if (!isFinite(n)) { return null; }
    return Math.floor(n);
  }

  function toOptionalMoney(v) {
    if (v === null || v === undefined || v === "") { return null; }
    var n = typeof v === "number" ? v : parseFloat(String(v).replace(/[,\s]/g, ""));
    if (!isFinite(n) || n < 0) { return null; }
    return n;
  }

  function clean(v) {
    if (v === null || v === undefined) { return ""; }
    return String(v).replace(/\s+/g, " ").trim();
  }

  /* Name key for duplicate detection: case, spacing and punctuation are noise;
     "DELA CRUZ, Juan" and "dela cruz juan" are the same person twice. */
  function normaliseName(v) {
    return clean(v).toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  }

  function normaliseSex(v) {
    var s = clean(v).toUpperCase();
    if (s === "M" || s === "MALE" || s === "LALAKI") { return "M"; }
    if (s === "F" || s === "FEMALE" || s === "BABAE") { return "F"; }
    return clean(v);
  }

  /* "YYYY-MM-DDTHH:MM" (an <input type=datetime-local> value) -> minutes on a
     fixed arithmetic scale. Built with Date.UTC so the result never depends on
     the machine's time zone and the function stays pure. */
  function parseStamp(v) {
    var s = clean(v);
    var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s);
    if (!m) { return null; }
    var y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5];
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) { return null; }
    var t = Date.UTC(y, mo - 1, d, h, mi);
    if (!isFinite(t)) { return null; }
    /* reject impossible civil dates such as 2026-02-30 */
    var back = new Date(t);
    if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) { return null; }
    return Math.round(t / 60000);
  }

  function two(n) { return (n < 10 ? "0" : "") + n; }

  /* Inverse of parseStamp, for printing a derived time such as "submit by". */
  function formatStamp(mins) {
    if (!isNum(mins)) { return ""; }
    var d = new Date(mins * 60000);
    return d.getUTCFullYear() + "-" + two(d.getUTCMonth() + 1) + "-" + two(d.getUTCDate()) +
      " " + two(d.getUTCHours()) + ":" + two(d.getUTCMinutes());
  }

  function formatDuration(mins) {
    if (!isNum(mins)) { return ""; }
    var neg = mins < 0;
    var m = Math.abs(Math.round(mins));
    var h = Math.floor(m / 60);
    var r = m % 60;
    var s = h > 0 ? (h + "h " + two(r) + "m") : (r + "m");
    return neg ? "minus " + s : s;
  }

  function plural(n, one, many) { return n === 1 ? one : (many || one + "s"); }

  function issue(severity, code, message, detail) {
    return { severity: severity, code: code, message: message, detail: detail || null };
  }
  function block(code, message, detail) { return issue("block", code, message, detail); }
  function warn(code, message, detail) { return issue("warn", code, message, detail); }

  /* ------------------------------------------------------------------ *
   * SETTINGS — the operator's rules, with our starting values            *
   * ------------------------------------------------------------------ */
  function withDefaults(settings) {
    var s = settings || {};
    var rule = s.childRule;
    if (rule !== CHILD_RULE_HALF && rule !== CHILD_RULE_EXEMPT) { rule = CHILD_RULE_FULL; }
    var required = [];
    var given = s.required;
    if (Object.prototype.toString.call(given) === "[object Array]") {
      for (var i = 0; i < PARTICULARS.length; i++) {
        if (given.indexOf(PARTICULARS[i].key) !== -1) { required.push(PARTICULARS[i].key); }
      }
    } else {
      required = REQUIRED_PARTICULARS_DEFAULT.slice();
    }
    if (NAME_ALWAYS_REQUIRED && required.indexOf("name") === -1) { required.unshift("name"); }
    var thr = toOptionalInt(s.childAgeThreshold);
    var lead = toOptionalInt(s.submissionLeadMinutes);
    var ratio = toOptionalMoney(s.lifejacketRatio);
    var mult = toOptionalMoney(s.overloadMultiplier);
    return {
      childRule: rule,
      childAgeThreshold: thr === null || thr < 0 ? CHILD_AGE_THRESHOLD_DEFAULT : thr,
      required: required,
      lifejacketRatio: ratio === null || ratio <= 0 ? LIFEJACKET_RATIO_DEFAULT : ratio,
      submissionLeadMinutes: lead === null || lead < 0 ? SUBMISSION_LEAD_MINUTES_DEFAULT : lead,
      overloadMultiplier: mult === null || mult < 0 ? OVERLOAD_FINE_MULTIPLIER_DEFAULT : mult
    };
  }

  /* ------------------------------------------------------------------ *
   * HEAD COUNT — who is a child, and how many persons that makes         *
   * ------------------------------------------------------------------ */

  function passengerAge(p) {
    var a = toOptionalInt(p && p.age);
    if (a === null || a < 0) { return null; }
    return a;
  }

  /* "Under the threshold" is strict. An unknown age is NOT treated as a child:
     a blank age must never buy a capacity concession. */
  function isChild(p, settings) {
    var s = withDefaults(settings);
    var a = passengerAge(p);
    if (a === null) { return false; }
    return a < s.childAgeThreshold;
  }

  function countPersons(passengers, settings) {
    var s = withDefaults(settings);
    var list = passengers || [];
    var adults = 0, children = 0;
    for (var i = 0; i < list.length; i++) {
      if (isChild(list[i], s)) { children++; } else { adults++; }
    }
    var chargeable;
    if (s.childRule === CHILD_RULE_EXEMPT) {
      chargeable = adults;
    } else if (s.childRule === CHILD_RULE_HALF) {
      chargeable = adults + Math.ceil(children / 2);
    } else {
      chargeable = adults + children;
    }
    return {
      listed: list.length,
      adults: adults,
      children: children,
      chargeable: chargeable,
      concession: list.length - chargeable,
      childRule: s.childRule,
      childAgeThreshold: s.childAgeThreshold
    };
  }

  /* ------------------------------------------------------------------ *
   * CAPACITY — refuse, do not warn                                      *
   * ------------------------------------------------------------------ */
  function capacityCheck(input) {
    var o = input || {};
    var s = withDefaults(o.settings);
    var counts = countPersons(o.passengers, s);
    var crew = toCount(o.crewCount);
    var cap = toOptionalInt(o.authorisedCapacity);
    var issues = [];

    if (cap === null || cap < 1) {
      issues.push(block("CAPACITY_NOT_SET",
        "Authorised passenger capacity is not set. Enter the figure from the vessel's own certificate — this tool ships no capacity table and will not assume one.",
        { entered: o.authorisedCapacity === undefined ? null : o.authorisedCapacity }));
      return {
        ok: false, status: "CAPACITY_NOT_SET", capacity: null,
        crew: crew, counts: counts,
        countedAgainstCapacity: counts.chargeable + (CREW_COUNTS_AGAINST_CAPACITY ? crew : 0),
        personsAboard: counts.listed + crew,
        over: null, remaining: null, issues: issues
      };
    }

    var counted = counts.chargeable + (CREW_COUNTS_AGAINST_CAPACITY ? crew : 0);
    var over = counted - cap;

    if (crew < 1) {
      issues.push(warn("NO_CREW",
        "No crew counted. A vessel under way has at least a master aboard, and crew count against the authorised capacity."));
    }
    if (counts.concession > 0) {
      issues.push(warn("CHILD_CONCESSION_IN_USE",
        counts.concession + " " + plural(counts.concession, "person", "persons") +
        " of capacity is being released by the child rule you set. Every child still appears on the manifest and still needs a life vest.",
        { released: counts.concession, children: counts.children, rule: counts.childRule }));
    }

    if (over > 0) {
      issues.push(block("OVER_CAPACITY",
        "Over the authorised capacity by " + over + " " + plural(over, "person", "persons") +
        ". " + counted + " counted against a capacity of " + cap +
        ". Take " + over + " " + plural(over, "person", "persons") + " off before departure.",
        { over: over, counted: counted, capacity: cap }));
      return {
        ok: false, status: "OVER_CAPACITY", capacity: cap, crew: crew, counts: counts,
        countedAgainstCapacity: counted, personsAboard: counts.listed + crew,
        over: over, remaining: 0, issues: issues
      };
    }

    return {
      ok: true, status: counted === cap ? "AT_CAPACITY" : "WITHIN_CAPACITY",
      capacity: cap, crew: crew, counts: counts,
      countedAgainstCapacity: counted, personsAboard: counts.listed + crew,
      over: 0, remaining: cap - counted, issues: issues
    };
  }

  /* ------------------------------------------------------------------ *
   * HEAD COUNT INTEGRITY — the written total must equal the list         *
   * ------------------------------------------------------------------ */
  function headCountCheck(declaredTotal, passengers) {
    var listed = (passengers || []).length;
    var declared = toOptionalInt(declaredTotal);
    if (declared === null) {
      return { ok: true, listed: listed, declared: listed, source: "list", difference: 0, issues: [] };
    }
    if (declared === listed) {
      return { ok: true, listed: listed, declared: declared, source: "declared", difference: 0, issues: [] };
    }
    var diff = declared - listed;
    var word = diff > 0
      ? "The written total is " + diff + " more than the names on the list."
      : "The written total is " + (-diff) + " fewer than the names on the list.";
    return {
      ok: false, listed: listed, declared: declared, source: "declared", difference: diff,
      issues: [block("HEAD_COUNT_MISMATCH",
        "Head count does not match the list: " + declared + " written, " + listed +
        " listed. " + word + " A manifest total is not a rounding — list the missing " +
        plural(Math.abs(diff), "passenger", "passengers") + " or correct the total.",
        { declared: declared, listed: listed, difference: diff })]
    };
  }

  /* ------------------------------------------------------------------ *
   * DUPLICATES — a double entry inflates the count and hides a gap       *
   * ------------------------------------------------------------------ */
  function duplicateCheck(passengers) {
    var list = passengers || [];
    var byKey = {}, byName = {}, i, p, name, age, key, k;
    for (i = 0; i < list.length; i++) {
      p = list[i] || {};
      name = normaliseName(p.name);
      if (!name) { continue; }           /* nameless rows are an incompleteness, not a duplicate */
      age = passengerAge(p);
      key = name + "|" + (age === null ? "" : age);
      if (!byKey[key]) { byKey[key] = []; }
      byKey[key].push(i + 1);
      if (!byName[name]) { byName[name] = []; }
      byName[name].push(i + 1);
    }
    var exact = [], sameName = [];
    for (k in byKey) {
      if (byKey.hasOwnProperty(k) && byKey[k].length > 1) {
        exact.push({ key: k, name: k.split("|")[0], rows: byKey[k] });
      }
    }
    for (k in byName) {
      if (byName.hasOwnProperty(k) && byName[k].length > 1) {
        var allExact = false;
        for (var j = 0; j < exact.length; j++) {
          if (exact[j].name === k && exact[j].rows.length === byName[k].length) { allExact = true; }
        }
        if (!allExact) { sameName.push({ name: k, rows: byName[k] }); }
      }
    }
    var issues = [];
    if (exact.length) {
      var parts = [];
      for (i = 0; i < exact.length; i++) {
        parts.push(exact[i].name + " (rows " + exact[i].rows.join(", ") + ")");
      }
      issues.push(block("DUPLICATE_PASSENGER",
        exact.length + " " + plural(exact.length, "passenger", "passengers") +
        " entered twice: " + parts.join("; ") +
        ". Remove the duplicate — a double entry inflates the head count and hides someone who is actually missing.",
        { groups: exact }));
    }
    if (sameName.length) {
      var p2 = [];
      for (i = 0; i < sameName.length; i++) {
        p2.push(sameName[i].name + " (rows " + sameName[i].rows.join(", ") + ")");
      }
      issues.push(warn("SAME_NAME_DIFFERENT_AGE",
        "Same name, different age: " + p2.join("; ") +
        ". Confirm these are two people and not one person entered twice.",
        { groups: sameName }));
    }
    return { ok: exact.length === 0, exact: exact, sameName: sameName, issues: issues };
  }

  /* ------------------------------------------------------------------ *
   * COMPLETENESS — the manifest's whole purpose                          *
   * ------------------------------------------------------------------ */
  function particularLabel(key) {
    for (var i = 0; i < PARTICULARS.length; i++) {
      if (PARTICULARS[i].key === key) { return PARTICULARS[i].label; }
    }
    return key;
  }

  function completenessCheck(passengers, settings) {
    var s = withDefaults(settings);
    var list = passengers || [];
    var missing = [], issues = [], odd = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i] || {};
      for (var f = 0; f < s.required.length; f++) {
        var key = s.required[f];
        var filled;
        if (key === "age") {
          filled = passengerAge(p) !== null;
        } else {
          filled = clean(p[key]) !== "";
        }
        if (!filled) { missing.push({ row: i + 1, field: key, label: particularLabel(key), name: clean(p.name) }); }
      }
      var a = passengerAge(p);
      if (a !== null && a > AGE_SANITY_MAX) {
        odd.push({ row: i + 1, age: a });
      }
    }
    if (missing.length) {
      var shown = [];
      for (var m = 0; m < missing.length && m < 4; m++) {
        shown.push("row " + missing[m].row + " " + (missing[m].name || "(no name)") + " — " + missing[m].label.toLowerCase());
      }
      var tail = missing.length > shown.length ? " and " + (missing.length - shown.length) + " more" : "";
      issues.push(block("INCOMPLETE_PARTICULARS",
        missing.length + " required " + plural(missing.length, "particular", "particulars") +
        " missing: " + shown.join("; ") + tail +
        ". A manifest exists so that every person aboard can be identified afterwards.",
        { missing: missing }));
    }
    if (odd.length) {
      issues.push(warn("AGE_LOOKS_WRONG",
        "An age over " + AGE_SANITY_MAX + " was entered (row " + odd[0].row + "). Check it.",
        { rows: odd }));
    }
    return { ok: missing.length === 0, missing: missing, issues: issues };
  }

  /* ------------------------------------------------------------------ *
   * LIFE VESTS — a floor, checked only if a count is given               *
   * ------------------------------------------------------------------ */
  function lifejacketCheck(lifejackets, personsAboard, settings) {
    var s = withDefaults(settings);
    var have = toOptionalInt(lifejackets);
    var need = Math.ceil(toCount(personsAboard) * s.lifejacketRatio);
    if (have === null) {
      return { checked: false, have: null, need: need, short: null,
        issues: [warn("LIFEJACKETS_NOT_RECORDED",
          "Life vests aboard not recorded. The manifest will print \"not recorded\" against it.")] };
    }
    if (have < need) {
      var shortBy = need - have;
      return { checked: true, have: have, need: need, short: shortBy,
        issues: [block("LIFEJACKETS_SHORT",
          shortBy + " " + plural(shortBy, "life vest", "life vests") + " short: " + have +
          " aboard for " + need + " " + plural(need, "person", "persons") +
          ". This is a one-per-person floor, not your authority's full schedule.",
          { have: have, need: need, short: shortBy })] };
    }
    return { checked: true, have: have, need: need, short: 0, issues: [] };
  }

  /* ------------------------------------------------------------------ *
   * ARRIVAL — closing the voyage                                         *
   * ------------------------------------------------------------------ */
  function arrivalCheck(input) {
    var o = input || {};
    var dep = parseStamp(o.departureAt);
    var ret = parseStamp(o.returnAt);
    var aboard = toCount(o.personsAboard);
    var returned = toOptionalInt(o.personsReturned);
    var issues = [];

    if (clean(o.returnAt) === "") {
      issues.push(block("VOYAGE_OPEN",
        "Voyage open — no arrival recorded. Record the return time and the head count on arrival to close this voyage.",
        null));
      return { closed: false, status: "OPEN", durationMinutes: null, returned: returned,
        aboard: aboard, unaccounted: null, issues: issues };
    }
    if (ret === null) {
      issues.push(block("RETURN_TIME_INVALID",
        "Arrival time is not a readable date and time. Close the voyage with the actual time of arrival.", null));
      return { closed: false, status: "OPEN", durationMinutes: null, returned: returned,
        aboard: aboard, unaccounted: null, issues: issues };
    }
    if (dep === null) {
      issues.push(block("DEPARTURE_TIME_INVALID",
        "Departure date and time is missing or unreadable, so the voyage cannot be timed or closed.", null));
      return { closed: false, status: "OPEN", durationMinutes: null, returned: returned,
        aboard: aboard, unaccounted: null, issues: issues };
    }

    var dur = ret - dep;
    if (dur < 0) {
      issues.push(block("RETURN_BEFORE_DEPARTURE",
        "Arrival is " + formatDuration(dur).replace("minus ", "") + " before departure (" +
        formatStamp(ret) + " against " + formatStamp(dep) +
        "). Correct one of the two times — a voyage cannot arrive before it leaves.",
        { departureAt: formatStamp(dep), returnAt: formatStamp(ret), minutes: dur }));
      return { closed: false, status: "OPEN", durationMinutes: dur, returned: returned,
        aboard: aboard, unaccounted: null, issues: issues };
    }
    if (dur === 0) {
      issues.push(warn("ZERO_DURATION",
        "Arrival is the same minute as departure. Check the times.", { minutes: 0 }));
    }

    var unaccounted = null;
    if (returned === null) {
      issues.push(block("RETURN_COUNT_MISSING",
        "Head count on arrival not entered. Counting everyone back is the point of the manifest.", null));
    } else if (returned !== aboard) {
      unaccounted = aboard - returned;
      if (unaccounted > 0) {
        issues.push(block("RETURN_COUNT_MISMATCH",
          unaccounted + " " + plural(unaccounted, "person", "persons") + " unaccounted for: " +
          aboard + " departed, " + returned + " returned. Do not close this voyage — account for " +
          plural(unaccounted, "the person", "all " + unaccounted + " persons") +
          " and report to the Coast Guard.",
          { aboard: aboard, returned: returned, unaccounted: unaccounted }));
      } else {
        issues.push(block("RETURN_COUNT_MISMATCH",
          (-unaccounted) + " more " + plural(-unaccounted, "person", "persons") + " returned than departed: " +
          aboard + " departed, " + returned + " returned. Someone was aboard who is not on the manifest.",
          { aboard: aboard, returned: returned, unaccounted: unaccounted }));
      }
    }

    var blocked = false;
    for (var i = 0; i < issues.length; i++) { if (issues[i].severity === "block") { blocked = true; } }
    return {
      closed: !blocked, status: blocked ? "OPEN" : "CLOSED", durationMinutes: dur,
      durationText: formatDuration(dur), returned: returned, aboard: aboard,
      unaccounted: unaccounted, issues: issues
    };
  }

  /* ------------------------------------------------------------------ *
   * ROSTER PASTE — one passenger per line, so a ticket list can be       *
   * typed once instead of field by field                                 *
   * Column order: name, age, sex, nationality, address, contact, remarks  *
   * ------------------------------------------------------------------ */
  var ROSTER_COLUMNS = ["name", "age", "sex", "nationality", "address", "contact", "remarks"];
  var AGE_CELL = /^\d{1,3}$/;

  function splitRow(line) {
    var seps = ["\t", ";", "|", ","];
    for (var i = 0; i < seps.length; i++) {
      if (line.indexOf(seps[i]) !== -1) { return { cells: line.split(seps[i]), sep: seps[i] }; }
    }
    return { cells: [line], sep: "" };
  }

  /* How many leading cells belong to the name.
     Philippine ticket lists are written "Surname, First name", so with a comma
     separator the name itself spans more than one cell and a naive split puts
     half the name in the age column — which quietly wrecks the whole manifest.
     The age is the one cell that is bare digits, so the name is everything
     before it. Without an age anywhere on the line there is nothing to anchor
     on, so we take the first cell only and the page tells the operator to use
     tabs or semicolons for a list with blank ages. */
  function nameSpan(cells, sep) {
    if (sep !== ",") { return 1; }
    for (var i = 1; i < cells.length && i <= 3; i++) {
      var c = clean(cells[i]);
      if (AGE_CELL.test(c) && Number(c) <= AGE_SANITY_MAX) { return i; }
    }
    return 1;
  }

  function parseRoster(text) {
    var out = [], skipped = 0, truncated = false;
    var raw = clean(text) === "" ? [] : String(text).split(/\r\n|\r|\n/);
    for (var i = 0; i < raw.length; i++) {
      var line = raw[i];
      if (clean(line) === "") { skipped++; continue; }
      /* a leading row number such as "1." or "12)" is numbering, not a name */
      line = line.replace(/^\s*\d{1,3}\s*[.)]\s*/, "");
      var split = splitRow(line);
      var cells = split.cells;
      var first = normaliseName(cells[0]);
      if (i === 0 && (first === "NAME" || first === "FULL NAME" || first === "PASSENGER" ||
        first === "PASSENGER NAME" || first === "NO" || first === "PANGALAN")) { skipped++; continue; }

      var span = nameSpan(cells, split.sep);
      var nameParts = [], n;
      for (n = 0; n < span; n++) {
        if (clean(cells[n]) !== "") { nameParts.push(clean(cells[n])); }
      }
      var p = { name: nameParts.join(", ") };
      var rest = cells.slice(span);
      for (var c = 1; c < ROSTER_COLUMNS.length; c++) {
        p[ROSTER_COLUMNS[c]] = clean(rest[c - 1]);
      }
      /* Nothing pasted is thrown away: surplus cells — an address with a comma
         in it, say — go on the end of the remarks instead of being dropped. */
      if (rest.length > ROSTER_COLUMNS.length - 1) {
        var extra = [];
        for (var x = ROSTER_COLUMNS.length - 1; x < rest.length; x++) {
          if (clean(rest[x]) !== "") { extra.push(clean(rest[x])); }
        }
        if (extra.length) { p.remarks = (p.remarks ? p.remarks + ", " : "") + extra.join(", "); }
      }
      if (p.name === "") { skipped++; continue; }
      p.sex = normaliseSex(p.sex);
      var a = toOptionalInt(p.age);
      p.age = a === null || a < 0 ? "" : String(a);
      if (out.length >= MAX_PASSENGERS) { truncated = true; break; }
      out.push(p);
    }
    return { passengers: out, skipped: skipped, truncated: truncated, columns: ROSTER_COLUMNS.slice() };
  }

  /* ------------------------------------------------------------------ *
   * REVIEW — the whole manifest, in one pure call                        *
   * ------------------------------------------------------------------ */
  function collect(target, list) {
    for (var i = 0; i < list.length; i++) { target.push(list[i]); }
  }

  function review(voyage, passengers, settings) {
    var v = voyage || {};
    var list = passengers || [];
    var s = withDefaults(settings);

    var cap = capacityCheck({
      authorisedCapacity: v.authorisedCapacity,
      crewCount: v.crewCount,
      passengers: list,
      settings: s
    });
    var head = headCountCheck(v.declaredTotal, list);
    var dup = duplicateCheck(list);
    var comp = completenessCheck(list, s);
    var vests = lifejacketCheck(v.lifejackets, cap.personsAboard, s);

    var depIssues = [];
    if (list.length === 0) {
      depIssues.push(block("NO_PASSENGERS",
        "No passengers listed. A manifest with nobody on it identifies nobody — add every person who is boarding, or do not sail.", null));
    }
    if (list.length > MAX_PASSENGERS) {
      depIssues.push(warn("LIST_TOO_LONG",
        "More than " + MAX_PASSENGERS + " rows. This page holds " + MAX_PASSENGERS + "; split the manifest."));
    }
    if (clean(v.vesselName) === "") {
      depIssues.push(block("VESSEL_NOT_NAMED", "Name the vessel. A manifest that does not say which boat it belongs to is useless after an incident.", null));
    }
    if (clean(v.master) === "") {
      depIssues.push(block("MASTER_NOT_NAMED", "Name the master. The master certifies the manifest.", null));
    }
    if (parseStamp(v.departureAt) === null) {
      depIssues.push(block("DEPARTURE_TIME_MISSING", "Enter the date and time of departure.", null));
    }
    if (clean(v.departurePoint) === "") {
      depIssues.push(warn("NO_DEPARTURE_POINT", "Departure point is blank."));
    }
    if (clean(v.destination) === "") {
      depIssues.push(warn("NO_DESTINATION", "Destination is blank. A search starts from where you said you were going."));
    }
    if (clean(v.operator) === "") {
      depIssues.push(warn("NO_OPERATOR", "Operator or boat owner is blank."));
    }
    collect(depIssues, cap.issues);
    collect(depIssues, head.issues);
    collect(depIssues, dup.issues);
    collect(depIssues, comp.issues);
    collect(depIssues, vests.issues);

    var blockers = [], warnings = [], i;
    for (i = 0; i < depIssues.length; i++) {
      if (depIssues[i].severity === "block") { blockers.push(depIssues[i]); } else { warnings.push(depIssues[i]); }
    }

    var arr = arrivalCheck({
      departureAt: v.departureAt,
      returnAt: v.returnAt,
      personsAboard: cap.personsAboard,
      personsReturned: v.personsReturned
    });
    var closeBlockers = [], closeWarnings = [];
    for (i = 0; i < arr.issues.length; i++) {
      if (arr.issues[i].severity === "block") { closeBlockers.push(arr.issues[i]); } else { closeWarnings.push(arr.issues[i]); }
    }

    var cleared = blockers.length === 0;

    /* derived from the sourced lead time, not a deadline we invented */
    var dep = parseStamp(v.departureAt);
    var submitBy = null;
    if (dep !== null) {
      submitBy = {
        minutes: dep - s.submissionLeadMinutes,
        text: formatStamp(dep - s.submissionLeadMinutes),
        leadMinutes: s.submissionLeadMinutes
      };
    }

    /* indicative exposure, shown only when refused and only if a passage rate
       was entered. Not a demand, not a schedule. */
    var exposure = null;
    var rate = toOptionalMoney(v.passageRate);
    if (cap.status === "OVER_CAPACITY" && cap.over > 0 && rate !== null && rate > 0) {
      exposure = {
        excess: cap.over,
        multiplier: s.overloadMultiplier,
        passageRate: rate,
        amount: cap.over * s.overloadMultiplier * rate,
        basis: AUTHORITY.manifestOrder + " VI.A.12 (indicative)"
      };
    }

    return {
      cleared: cleared,
      status: !cleared ? "REFUSED" : arr.status,
      counts: {
        listed: cap.counts.listed,
        adults: cap.counts.adults,
        children: cap.counts.children,
        chargeable: cap.counts.chargeable,
        concession: cap.counts.concession,
        crew: cap.crew,
        personsAboard: cap.personsAboard,
        countedAgainstCapacity: cap.countedAgainstCapacity,
        capacity: cap.capacity,
        remaining: cap.remaining,
        over: cap.over,
        declaredTotal: head.declared,
        headCountSource: head.source
      },
      capacity: cap,
      headCount: head,
      duplicates: dup,
      completeness: comp,
      lifejackets: vests,
      departure: { cleared: cleared, blockers: blockers, warnings: warnings },
      closing: {
        closed: arr.closed, status: arr.status, durationMinutes: arr.durationMinutes,
        durationText: arr.durationText || "", unaccounted: arr.unaccounted,
        blockers: closeBlockers, warnings: closeWarnings
      },
      submitBy: submitBy,
      exposure: exposure,
      settings: s
    };
  }

  var MANIFEST = {
    AUTHORITY: AUTHORITY,
    AUTHORISED_CAPACITY_DEFAULT: AUTHORISED_CAPACITY_DEFAULT,
    CREW_COUNTS_AGAINST_CAPACITY: CREW_COUNTS_AGAINST_CAPACITY,
    PARTICULARS: PARTICULARS,
    PARTICULARS_SOURCED: PARTICULARS_SOURCED,
    REQUIRED_PARTICULARS_DEFAULT: REQUIRED_PARTICULARS_DEFAULT,
    NAME_ALWAYS_REQUIRED: NAME_ALWAYS_REQUIRED,
    CHILD_RULES: CHILD_RULES,
    CHILD_RULE_FULL: CHILD_RULE_FULL,
    CHILD_RULE_HALF: CHILD_RULE_HALF,
    CHILD_RULE_EXEMPT: CHILD_RULE_EXEMPT,
    CHILD_RULE_DEFAULT: CHILD_RULE_DEFAULT,
    CHILD_AGE_THRESHOLD_DEFAULT: CHILD_AGE_THRESHOLD_DEFAULT,
    CHILD_HALF_ROUNDING: CHILD_HALF_ROUNDING,
    LIFEJACKET_RATIO_DEFAULT: LIFEJACKET_RATIO_DEFAULT,
    SUBMISSION_LEAD_MINUTES_DEFAULT: SUBMISSION_LEAD_MINUTES_DEFAULT,
    OVERLOAD_FINE_MULTIPLIER_DEFAULT: OVERLOAD_FINE_MULTIPLIER_DEFAULT,
    MAX_PASSENGERS: MAX_PASSENGERS,
    AGE_SANITY_MAX: AGE_SANITY_MAX,
    CONSTANT_NOTES: CONSTANT_NOTES,
    ROSTER_COLUMNS: ROSTER_COLUMNS,

    toCount: toCount,
    toOptionalInt: toOptionalInt,
    clean: clean,
    normaliseName: normaliseName,
    normaliseSex: normaliseSex,
    parseStamp: parseStamp,
    formatStamp: formatStamp,
    formatDuration: formatDuration,
    particularLabel: particularLabel,
    withDefaults: withDefaults,
    isChild: isChild,
    countPersons: countPersons,
    capacityCheck: capacityCheck,
    headCountCheck: headCountCheck,
    duplicateCheck: duplicateCheck,
    completenessCheck: completenessCheck,
    lifejacketCheck: lifejacketCheck,
    arrivalCheck: arrivalCheck,
    parseRoster: parseRoster,
    review: review
  };

  if (typeof module === "object" && module && module.exports) { module.exports = MANIFEST; }
  root.MANIFEST = MANIFEST;
})(typeof globalThis !== "undefined" ? globalThis : this);
