/*
 * Table-driven tests for the passenger-manifest rules module.
 *
 *   node tests/manifest.test.js      (from the repo root)
 *   or open tests/index.html in a browser
 *
 * The guards the trade actually needs are the ones tested hardest here:
 * zero passengers, a capacity that is zero or blank, duplicate entries,
 * a return time before departure, and a voyage left open.
 */
(function () {
  "use strict";

  var M = (typeof require === "function")
    ? require("../assets/manifest.js")
    : (typeof window !== "undefined" ? window.MANIFEST : null);

  var results = [];
  function check(group, name, got, want) {
    var g = JSON.stringify(got), w = JSON.stringify(want);
    results.push({ group: group, name: name, pass: g === w, got: g, want: w });
  }
  function truthy(group, name, got) { check(group, name, !!got, true); }

  /* does a list of issues contain this code? */
  function has(issues, code) {
    for (var i = 0; i < (issues || []).length; i++) { if (issues[i].code === code) { return true; } }
    return false;
  }
  function codes(issues) {
    var out = [];
    for (var i = 0; i < (issues || []).length; i++) { out.push(issues[i].code); }
    return out;
  }
  function messageFor(issues, code) {
    for (var i = 0; i < (issues || []).length; i++) { if (issues[i].code === code) { return issues[i].message; } }
    return "";
  }

  /* a complete passenger: every particular in the default required set */
  function pax(name, age, sex) {
    return { name: name, age: String(age), sex: sex || "M", nationality: "Filipino",
      address: "Tabaco City", contact: "0917 000 0000", remarks: "" };
  }
  function paxList(n, startAge) {
    var out = [];
    for (var i = 0; i < n; i++) { out.push(pax("Passenger " + (i + 1), (startAge || 30) + i)); }
    return out;
  }

  function voyage(over) {
    var v = {
      operator: "Island Hopping Operator", vesselName: "M/B Maria Clara", vesselNumber: "MB-1234",
      master: "R. Dizon", masterLicence: "MC-0001",
      authorisedCapacity: 12, crewCount: 2,
      departurePoint: "Tabaco Port", departureAt: "2026-11-24T07:30",
      destination: "Sula Channel", lifejackets: 20,
      declaredTotal: "", passageRate: 350,
      returnAt: "", personsReturned: ""
    };
    for (var k in (over || {})) { if (over.hasOwnProperty(k)) { v[k] = over[k]; } }
    return v;
  }

  /* ================================================================== *
   * 1. CAPACITY MUST BE SET — blank or zero is refused, never guessed
   * ================================================================== */
  var CAPACITY_NOT_SET_CASES = [
    ["blank string", ""],
    ["null", null],
    ["undefined", undefined],
    ["zero", 0],
    ["zero as text", "0"],
    ["negative", -3],
    ["non-numeric text", "as painted"],
    ["fraction below one", 0.4]
  ];
  CAPACITY_NOT_SET_CASES.forEach(function (row) {
    var r = M.capacityCheck({ authorisedCapacity: row[1], crewCount: 2, passengers: paxList(3) });
    check("capacity not set", row[0] + " -> refused", r.ok, false);
    check("capacity not set", row[0] + " -> code", codes(r.issues)[0], "CAPACITY_NOT_SET");
    check("capacity not set", row[0] + " -> no capacity invented", r.capacity, null);
    check("capacity not set", row[0] + " -> over is not guessed", r.over, null);
  });
  truthy("capacity not set", "module ships no default capacity",
    M.AUTHORISED_CAPACITY_DEFAULT === null);
  truthy("capacity not set", "message tells the operator where to read it",
    messageFor(M.capacityCheck({ authorisedCapacity: "", passengers: paxList(1) }).issues,
      "CAPACITY_NOT_SET").indexOf("vessel's own certificate") !== -1);

  /* ================================================================== *
   * 2. CAPACITY ENFORCEMENT — passengers + crew against the certificate
   *    [capacity, crew, passengers, expected status, expected over, remaining]
   * ================================================================== */
  var CAPACITY_CASES = [
    [12, 2, 4, "WITHIN_CAPACITY", 0, 6],
    [12, 2, 10, "AT_CAPACITY", 0, 0],
    [12, 2, 11, "OVER_CAPACITY", 1, 0],
    [12, 2, 15, "OVER_CAPACITY", 5, 0],
    [12, 0, 12, "AT_CAPACITY", 0, 0],
    [12, 0, 13, "OVER_CAPACITY", 1, 0],
    [1, 2, 0, "OVER_CAPACITY", 1, 0],
    [20, 3, 17, "AT_CAPACITY", 0, 0],
    [20, 3, 18, "OVER_CAPACITY", 1, 0],
    [6, 1, 5, "AT_CAPACITY", 0, 0],
    [6, 1, 6, "OVER_CAPACITY", 1, 0],
    [150, 8, 100, "WITHIN_CAPACITY", 0, 42]
  ];
  CAPACITY_CASES.forEach(function (row) {
    var label = "cap " + row[0] + ", crew " + row[1] + ", " + row[2] + " pax";
    var r = M.capacityCheck({ authorisedCapacity: row[0], crewCount: row[1], passengers: paxList(row[2]) });
    check("capacity", label + " -> status", r.status, row[3]);
    check("capacity", label + " -> over", r.over, row[4]);
    check("capacity", label + " -> remaining", r.remaining, row[5]);
    check("capacity", label + " -> ok", r.ok, row[3] !== "OVER_CAPACITY");
    check("capacity", label + " -> counted", r.countedAgainstCapacity, row[2] + row[1]);
  });

  /* the refusal must name the number over, in the message itself */
  var over3 = M.capacityCheck({ authorisedCapacity: 10, crewCount: 2, passengers: paxList(11) });
  check("capacity refusal", "over by 3", over3.over, 3);
  truthy("capacity refusal", "message names the number over",
    messageFor(over3.issues, "OVER_CAPACITY").indexOf("by 3 persons") !== -1);
  truthy("capacity refusal", "message says how many to take off",
    messageFor(over3.issues, "OVER_CAPACITY").indexOf("Take 3 persons off") !== -1);
  var over1 = M.capacityCheck({ authorisedCapacity: 10, crewCount: 1, passengers: paxList(10) });
  truthy("capacity refusal", "singular reads 'by 1 person'",
    messageFor(over1.issues, "OVER_CAPACITY").indexOf("by 1 person.") !== -1);

  /* crew count against capacity is a sourced rule, not an option */
  truthy("capacity", "crew count against capacity", M.CREW_COUNTS_AGAINST_CAPACITY === true);
  truthy("capacity", "no crew warns", has(
    M.capacityCheck({ authorisedCapacity: 10, crewCount: 0, passengers: paxList(2) }).issues, "NO_CREW"));
  check("capacity", "crew blank counts as zero",
    M.capacityCheck({ authorisedCapacity: 10, crewCount: "", passengers: paxList(2) }).crew, 0);
  check("capacity", "crew negative clamped to zero",
    M.capacityCheck({ authorisedCapacity: 10, crewCount: -4, passengers: paxList(2) }).crew, 0);

  /* ================================================================== *
   * 3. CHILD RULE — the operator's rule, never ours
   *    [rule, threshold, ages, expected chargeable]
   * ================================================================== */
  var CHILD_CASES = [
    ["full", 12, [30, 30, 8, 2], 4],
    ["full", 12, [1, 1, 1], 3],
    ["half_under", 12, [30, 30, 8, 2], 3],
    ["half_under", 12, [30, 8], 2],
    ["half_under", 12, [8, 8], 1],
    ["half_under", 12, [8, 8, 8], 2],
    ["half_under", 12, [8, 8, 8, 8, 8], 3],
    ["exempt_under", 12, [30, 30, 8, 2], 2],
    ["exempt_under", 12, [8, 2], 0],
    ["exempt_under", 3, [30, 8, 2], 2],
    ["full", 3, [30, 8, 2], 3],
    ["exempt_under", 12, [12, 11], 1],
    ["half_under", 12, [12, 12], 2],
    ["exempt_under", 12, [0], 0],
    ["exempt_under", 12, [30, 30], 2]
  ];
  CHILD_CASES.forEach(function (row) {
    var list = row[2].map(function (a, i) { return pax("Child Case " + i, a); });
    var c = M.countPersons(list, { childRule: row[0], childAgeThreshold: row[1] });
    check("child rule", row[0] + " under " + row[1] + " ages [" + row[2].join(",") + "]",
      c.chargeable, row[3]);
    check("child rule", row[0] + " under " + row[1] + " ages [" + row[2].join(",") + "] listed",
      c.listed, row[2].length);
  });

  /* threshold is strict: age equal to the threshold is an adult */
  check("child rule", "age 12 is not a child under 12", M.isChild(pax("A", 12), { childAgeThreshold: 12 }), false);
  check("child rule", "age 11 is a child under 12", M.isChild(pax("A", 11), { childAgeThreshold: 12 }), true);
  /* an unknown age never buys a concession */
  check("child rule", "blank age is not a child", M.isChild({ name: "A", age: "" }, { childAgeThreshold: 12 }), false);
  check("child rule", "junk age is not a child", M.isChild({ name: "A", age: "baby" }, { childAgeThreshold: 12 }), false);
  check("child rule", "blank age counts full under exempt rule",
    M.countPersons([{ name: "A", age: "" }, pax("B", 2)],
      { childRule: "exempt_under", childAgeThreshold: 12 }).chargeable, 1);
  /* half persons round up, never down */
  check("child rule", "half rounding is up", M.CHILD_HALF_ROUNDING, "up");
  /* the default is to count everyone */
  check("child rule", "default rule counts everyone", M.CHILD_RULE_DEFAULT, "full");
  check("child rule", "unknown rule falls back to counting everyone",
    M.countPersons([pax("A", 2), pax("B", 2)], { childRule: "whatever" }).chargeable, 2);
  /* a concession is surfaced, not silent */
  truthy("child rule", "concession is flagged", has(M.capacityCheck({
    authorisedCapacity: 10, crewCount: 1, passengers: [pax("A", 30), pax("B", 2), pax("C", 3)],
    settings: { childRule: "exempt_under", childAgeThreshold: 12 }
  }).issues, "CHILD_CONCESSION_IN_USE"));
  check("child rule", "no concession, no flag", has(M.capacityCheck({
    authorisedCapacity: 10, crewCount: 1, passengers: [pax("A", 30), pax("B", 2)]
  }).issues, "CHILD_CONCESSION_IN_USE"), false);

  /* ================================================================== *
   * 4. HEAD COUNT INTEGRITY — a discrepancy is an error, not a rounding
   *    [declared, listed, ok, difference]
   * ================================================================== */
  var HEAD_CASES = [
    ["", 4, true, 0],
    [null, 4, true, 0],
    [4, 4, true, 0],
    ["4", 4, true, 0],
    [5, 4, false, 1],
    [3, 4, false, -1],
    [40, 4, false, 36],
    [0, 4, false, -4],
    [0, 0, true, 0],
    [1, 0, false, 1]
  ];
  HEAD_CASES.forEach(function (row) {
    var r = M.headCountCheck(row[0], paxList(row[1]));
    var label = "declared " + JSON.stringify(row[0]) + " vs " + row[1] + " listed";
    check("head count", label + " -> ok", r.ok, row[2]);
    check("head count", label + " -> difference", r.difference, row[3]);
    check("head count", label + " -> code", codes(r.issues)[0] || null,
      row[2] ? null : "HEAD_COUNT_MISMATCH");
  });
  check("head count", "blank total is taken from the list",
    M.headCountCheck("", paxList(7)).source, "list");
  check("head count", "blank total adopts the listed count",
    M.headCountCheck("", paxList(7)).declared, 7);
  truthy("head count", "mismatch names both numbers",
    messageFor(M.headCountCheck(9, paxList(7)).issues, "HEAD_COUNT_MISMATCH")
      .indexOf("9 written, 7 listed") !== -1);
  truthy("head count", "mismatch refuses to call itself a rounding",
    messageFor(M.headCountCheck(9, paxList(7)).issues, "HEAD_COUNT_MISMATCH")
      .indexOf("not a rounding") !== -1);

  /* ================================================================== *
   * 5. ZERO PASSENGERS
   * ================================================================== */
  var empty = M.review(voyage(), []);
  check("zero passengers", "refused", empty.cleared, false);
  truthy("zero passengers", "NO_PASSENGERS raised", has(empty.departure.blockers, "NO_PASSENGERS"));
  check("zero passengers", "status", empty.status, "REFUSED");
  check("zero passengers", "listed", empty.counts.listed, 0);
  check("zero passengers", "persons aboard is still the crew", empty.counts.personsAboard, 2);
  var emptyUndef = M.review(voyage(), undefined);
  truthy("zero passengers", "undefined list behaves as empty", has(emptyUndef.departure.blockers, "NO_PASSENGERS"));

  /* ================================================================== *
   * 6. DUPLICATE PASSENGER ENTRIES
   * ================================================================== */
  var DUP_CASES = [
    ["identical rows", [pax("Juan Dela Cruz", 30), pax("Juan Dela Cruz", 30)], false, [1, 2]],
    ["case and spacing differ", [pax("Juan Dela Cruz", 30), pax("  juan   dela cruz ", 30)], false, [1, 2]],
    ["punctuation differs", [pax("Dela Cruz, Juan", 30), pax("Dela Cruz Juan", 30)], false, [1, 2]],
    ["three times", [pax("Ana Reyes", 25), pax("ana reyes", 25), pax("ANA REYES", 25)], false, [1, 2, 3]],
    ["both ages blank", [{ name: "Ana Reyes" }, { name: "ana reyes" }], false, [1, 2]],
    ["different people", [pax("Juan Dela Cruz", 30), pax("Ana Reyes", 25)], true, null],
    ["same surname only", [pax("Juan Dela Cruz", 30), pax("Ana Dela Cruz", 25)], true, null]
  ];
  DUP_CASES.forEach(function (row) {
    var r = M.duplicateCheck(row[1]);
    check("duplicates", row[0] + " -> ok", r.ok, row[2]);
    if (row[3]) { check("duplicates", row[0] + " -> rows named", r.exact[0].rows, row[3]); }
  });
  /* same name, different age: a warning, not a refusal — families reuse names */
  var sameName = M.duplicateCheck([pax("Juan Dela Cruz", 42), pax("Juan Dela Cruz", 9)]);
  check("duplicates", "same name different age is not refused", sameName.ok, true);
  truthy("duplicates", "same name different age warns", has(sameName.issues, "SAME_NAME_DIFFERENT_AGE"));
  /* nameless rows are an incompleteness, not a duplicate */
  var nameless = M.duplicateCheck([{ name: "", age: "30" }, { name: "  ", age: "30" }]);
  check("duplicates", "blank names are not duplicates of each other", nameless.ok, true);
  /* the refusal names the passenger and the rows */
  truthy("duplicates", "refusal names rows",
    messageFor(M.duplicateCheck([pax("Juan Cruz", 30), pax("Juan Cruz", 30)]).issues,
      "DUPLICATE_PASSENGER").indexOf("rows 1, 2") !== -1);
  truthy("duplicates", "refusal explains the harm",
    messageFor(M.duplicateCheck([pax("Juan Cruz", 30), pax("Juan Cruz", 30)]).issues,
      "DUPLICATE_PASSENGER").indexOf("hides someone who is actually missing") !== -1);
  /* a duplicate blocks the whole manifest */
  var dupReview = M.review(voyage(), [pax("Juan Cruz", 30), pax("Juan Cruz", 30), pax("Ana Reyes", 25)]);
  check("duplicates", "duplicate refuses the manifest", dupReview.cleared, false);

  /* ================================================================== *
   * 7. COMPLETENESS — the required set is the operator's to choose
   * ================================================================== */
  var partial = { name: "Juan Cruz", age: "30", sex: "", nationality: "", address: "", contact: "", remarks: "" };
  var cDefault = M.completenessCheck([partial]);
  check("completeness", "default set flags sex, nationality, contact", cDefault.missing.length, 3);
  check("completeness", "default set refuses", cDefault.ok, false);
  var cNarrow = M.completenessCheck([partial], { required: ["name", "age"] });
  check("completeness", "narrowed set passes", cNarrow.ok, true);
  var cWide = M.completenessCheck([partial], { required: ["name", "age", "sex", "nationality", "address", "contact", "remarks"] });
  check("completeness", "widened set flags five", cWide.missing.length, 5);
  /* the name is never optional, whatever the operator switches off */
  var cNoName = M.completenessCheck([{ name: "", age: "30" }], { required: ["age"] });
  check("completeness", "name stays required", cNoName.ok, false);
  check("completeness", "name missing is named", cNoName.missing[0].field, "name");
  check("completeness", "name is forced back into the required set",
    M.withDefaults({ required: ["age"] }).required[0], "name");
  /* age must be a number, not any text */
  check("completeness", "age as text is missing",
    M.completenessCheck([{ name: "A", age: "bata" }], { required: ["name", "age"] }).ok, false);
  check("completeness", "age zero is present",
    M.completenessCheck([{ name: "A", age: "0" }], { required: ["name", "age"] }).ok, true);
  truthy("completeness", "impossible age warns",
    has(M.completenessCheck([{ name: "A", age: "230" }], { required: ["name"] }).issues, "AGE_LOOKS_WRONG"));
  /* which particulars we can and cannot point at a document for */
  check("completeness", "sourced particulars", M.PARTICULARS_SOURCED, ["name", "age", "sex"]);
  check("completeness", "default required set", M.REQUIRED_PARTICULARS_DEFAULT,
    ["name", "age", "sex", "nationality", "contact"]);
  truthy("completeness", "refusal explains why completeness matters",
    messageFor(cDefault.issues, "INCOMPLETE_PARTICULARS").indexOf("identified afterwards") !== -1);

  /* ================================================================== *
   * 8. LIFE VESTS — a one-per-person floor, checked only if given
   *    [have, personsAboard, checked, short]
   * ================================================================== */
  var VEST_CASES = [
    ["", 10, false, null],
    [null, 10, false, null],
    [10, 10, true, 0],
    [12, 10, true, 0],
    [9, 10, true, 1],
    [0, 10, true, 10],
    [0, 0, true, 0],
    [4, 11, true, 7]
  ];
  VEST_CASES.forEach(function (row) {
    var r = M.lifejacketCheck(row[0], row[1]);
    var label = JSON.stringify(row[0]) + " vests for " + row[1] + " aboard";
    check("life vests", label + " -> checked", r.checked, row[2]);
    check("life vests", label + " -> short", r.short, row[3]);
  });
  truthy("life vests", "not recorded is said out loud",
    has(M.lifejacketCheck("", 10).issues, "LIFEJACKETS_NOT_RECORDED"));
  truthy("life vests", "shortfall is named",
    messageFor(M.lifejacketCheck(9, 10).issues, "LIFEJACKETS_SHORT").indexOf("1 life vest short") !== -1);
  truthy("life vests", "shortfall admits it is only a floor",
    messageFor(M.lifejacketCheck(9, 10).issues, "LIFEJACKETS_SHORT").indexOf("floor") !== -1);
  /* exempt children still need a vest: the ratio is on persons aboard, not chargeable */
  var vestReview = M.review(
    voyage({ authorisedCapacity: 10, crewCount: 2, lifejackets: 5 }),
    [pax("A", 30), pax("B", 2), pax("C", 3), pax("D", 4)],
    { childRule: "exempt_under", childAgeThreshold: 12 });
  check("life vests", "children count for vests even when exempt from capacity",
    vestReview.lifejackets.need, 6);

  /* ================================================================== *
   * 9. ARRIVAL RECORD — closing the voyage
   * ================================================================== */
  /* left open */
  var openV = M.arrivalCheck({ departureAt: "2026-11-24T07:30", returnAt: "", personsAboard: 6, personsReturned: "" });
  check("arrival", "no return time -> open", openV.closed, false);
  check("arrival", "no return time -> status", openV.status, "OPEN");
  truthy("arrival", "no return time -> VOYAGE_OPEN", has(openV.issues, "VOYAGE_OPEN"));

  /* return before departure */
  var RETURN_CASES = [
    ["returns one minute earlier", "2026-11-24T07:29", "RETURN_BEFORE_DEPARTURE"],
    ["returns an hour earlier", "2026-11-24T06:30", "RETURN_BEFORE_DEPARTURE"],
    ["returns the day before", "2026-11-23T18:00", "RETURN_BEFORE_DEPARTURE"],
    ["returns the previous year", "2025-11-24T09:00", "RETURN_BEFORE_DEPARTURE"],
    ["unreadable time", "sometime after lunch", "RETURN_TIME_INVALID"],
    ["impossible date", "2026-02-30T09:00", "RETURN_TIME_INVALID"],
    ["hour 24", "2026-11-24T24:00", "RETURN_TIME_INVALID"]
  ];
  RETURN_CASES.forEach(function (row) {
    var r = M.arrivalCheck({ departureAt: "2026-11-24T07:30", returnAt: row[1], personsAboard: 6, personsReturned: 6 });
    check("arrival", row[0] + " -> not closed", r.closed, false);
    truthy("arrival", row[0] + " -> " + row[2], has(r.issues, row[2]));
  });
  truthy("arrival", "before-departure message names both times",
    messageFor(M.arrivalCheck({ departureAt: "2026-11-24T07:30", returnAt: "2026-11-24T06:30",
      personsAboard: 6, personsReturned: 6 }).issues, "RETURN_BEFORE_DEPARTURE")
      .indexOf("2026-11-24 06:30 against 2026-11-24 07:30") !== -1);

  /* a clean close */
  var closed = M.arrivalCheck({ departureAt: "2026-11-24T07:30", returnAt: "2026-11-24T11:00",
    personsAboard: 6, personsReturned: 6 });
  check("arrival", "clean close -> closed", closed.closed, true);
  check("arrival", "clean close -> status", closed.status, "CLOSED");
  check("arrival", "clean close -> duration minutes", closed.durationMinutes, 210);
  check("arrival", "clean close -> duration text", closed.durationText, "3h 30m");
  check("arrival", "clean close -> no issues", codes(closed.issues), []);

  /* same minute */
  var sameMin = M.arrivalCheck({ departureAt: "2026-11-24T07:30", returnAt: "2026-11-24T07:30",
    personsAboard: 6, personsReturned: 6 });
  check("arrival", "same minute still closes", sameMin.closed, true);
  truthy("arrival", "same minute warns", has(sameMin.issues, "ZERO_DURATION"));

  /* the count must reconcile */
  var COUNT_BACK_CASES = [
    [6, 6, true, null, null],
    [6, 5, false, 1, "RETURN_COUNT_MISMATCH"],
    [6, 4, false, 2, "RETURN_COUNT_MISMATCH"],
    [6, 7, false, -1, "RETURN_COUNT_MISMATCH"],
    [6, 0, false, 6, "RETURN_COUNT_MISMATCH"],
    [6, "", false, null, "RETURN_COUNT_MISSING"]
  ];
  COUNT_BACK_CASES.forEach(function (row) {
    var r = M.arrivalCheck({ departureAt: "2026-11-24T07:30", returnAt: "2026-11-24T11:00",
      personsAboard: row[0], personsReturned: row[1] });
    var label = row[0] + " departed, " + JSON.stringify(row[1]) + " returned";
    check("arrival count", label + " -> closed", r.closed, row[2]);
    check("arrival count", label + " -> unaccounted", r.unaccounted, row[3]);
    if (row[4]) { truthy("arrival count", label + " -> " + row[4], has(r.issues, row[4])); }
  });
  truthy("arrival count", "shortfall names the number unaccounted for",
    messageFor(M.arrivalCheck({ departureAt: "2026-11-24T07:30", returnAt: "2026-11-24T11:00",
      personsAboard: 6, personsReturned: 4 }).issues, "RETURN_COUNT_MISMATCH")
      .indexOf("2 persons unaccounted for") !== -1);
  truthy("arrival count", "extra person is called out",
    messageFor(M.arrivalCheck({ departureAt: "2026-11-24T07:30", returnAt: "2026-11-24T11:00",
      personsAboard: 6, personsReturned: 7 }).issues, "RETURN_COUNT_MISMATCH")
      .indexOf("not on the manifest") !== -1);

  /* ================================================================== *
   * 10. TIME PARSING — pure, and independent of the machine's time zone
   * ================================================================== */
  var STAMP_CASES = [
    ["2026-11-24T07:30", true], ["2026-11-24 07:30", true], ["2026-11-24T07:30:00", true],
    ["2026-02-29T07:30", false], ["2024-02-29T07:30", true], ["2026-13-01T07:30", false],
    ["2026-11-24T07:60", false], ["2026-11-31T07:30", false], ["24-11-2026 07:30", false],
    ["", false], ["   ", false], ["today", false], [null, false], [undefined, false]
  ];
  STAMP_CASES.forEach(function (row) {
    check("time parsing", JSON.stringify(row[0]) + " parses", M.parseStamp(row[0]) !== null, row[1]);
  });
  check("time parsing", "round trip", M.formatStamp(M.parseStamp("2026-11-24T07:30")), "2026-11-24 07:30");
  check("time parsing", "midnight round trip", M.formatStamp(M.parseStamp("2026-01-01T00:00")), "2026-01-01 00:00");
  check("time parsing", "one hour is 60 minutes apart",
    M.parseStamp("2026-11-24T08:30") - M.parseStamp("2026-11-24T07:30"), 60);
  check("time parsing", "across a month end",
    M.parseStamp("2026-12-01T00:00") - M.parseStamp("2026-11-30T23:00"), 60);
  var DURATION_CASES = [[0, "0m"], [45, "45m"], [60, "1h 00m"], [90, "1h 30m"], [210, "3h 30m"], [-30, "minus 30m"]];
  DURATION_CASES.forEach(function (row) {
    check("time parsing", "duration " + row[0], M.formatDuration(row[0]), row[1]);
  });

  /* ================================================================== *
   * 11. ROSTER PASTE — one passenger per line
   * ================================================================== */
  var tabbed = "Juan Dela Cruz\t34\tM\tFilipino\tTabaco City\t09170000001\n" +
    "Ana Reyes\t29\tfemale\tFilipino\tLegazpi\t09170000002";
  var tr = M.parseRoster(tabbed);
  check("roster paste", "tab separated count", tr.passengers.length, 2);
  check("roster paste", "first name", tr.passengers[0].name, "Juan Dela Cruz");
  check("roster paste", "age kept as digits", tr.passengers[0].age, "34");
  check("roster paste", "sex normalised to M", tr.passengers[0].sex, "M");
  check("roster paste", "female normalised to F", tr.passengers[1].sex, "F");
  check("roster paste", "contact read", tr.passengers[1].contact, "09170000002");

  var commas = M.parseRoster("name, age, sex\nJuan Cruz, 34, M\nAna Reyes, 29, F\n\n");
  check("roster paste", "header line skipped", commas.passengers.length, 2);
  check("roster paste", "header and two blank lines skipped", commas.skipped, 3);
  check("roster paste", "comma separated name trimmed", commas.passengers[0].name, "Juan Cruz");

  var numbered = M.parseRoster("1. Juan Cruz, 34, M\n2) Ana Reyes, 29, F\n3 Pedro Luna, 41, M");
  check("roster paste", "numbering stripped from 1.", numbered.passengers[0].name, "Juan Cruz");
  check("roster paste", "numbering stripped from 2)", numbered.passengers[1].name, "Ana Reyes");
  check("roster paste", "bare number is not stripped", numbered.passengers[2].name, "3 Pedro Luna");

  /* Philippine ticket lists are written "Surname, First name". The comma inside
     the name must not shift every other column one to the left — that silently
     wrecks the ages, and with them the child rule and the particulars check. */
  var sf = M.parseRoster(
    "Dela Cruz, Juan, 34, M, Filipino, Tabaco City, 09170000001\n" +
    "Santos, Mia, 8, F, Filipino, Tabaco City, 09170000004");
  check("roster paste", "surname-comma-first name kept whole", sf.passengers[0].name, "Dela Cruz, Juan");
  check("roster paste", "surname-comma-first age not shifted", sf.passengers[0].age, "34");
  check("roster paste", "surname-comma-first sex not shifted", sf.passengers[0].sex, "M");
  check("roster paste", "surname-comma-first nationality not shifted", sf.passengers[0].nationality, "Filipino");
  check("roster paste", "surname-comma-first address not shifted", sf.passengers[0].address, "Tabaco City");
  check("roster paste", "surname-comma-first contact not shifted", sf.passengers[0].contact, "09170000001");
  check("roster paste", "second surname-comma-first row", sf.passengers[1].name, "Santos, Mia");
  check("roster paste", "child's age survives the paste", sf.passengers[1].age, "8");
  check("roster paste", "a three-part name",
    M.parseRoster("Dela Cruz, Juan, Jr., 34, M").passengers[0].name, "Dela Cruz, Juan, Jr.");
  check("roster paste", "a three-part name keeps its age",
    M.parseRoster("Dela Cruz, Juan, Jr., 34, M").passengers[0].age, "34");
  check("roster paste", "tabs need no guessing",
    M.parseRoster("Santos, Mia\t8\tF").passengers[0].name, "Santos, Mia");
  check("roster paste", "semicolons need no guessing",
    M.parseRoster("Santos, Mia; 8; F").passengers[0].name, "Santos, Mia");
  /* with no age on the line there is nothing to anchor the name on: we take the
     first cell only, and the page says to use tabs for a list with blank ages */
  check("roster paste", "no age means first cell only",
    M.parseRoster("Santos, Mia, , F").passengers[0].name, "Santos");
  /* an impossible age is not an age, so it does not anchor the name either */
  check("roster paste", "150 is not an age anchor",
    M.parseRoster("Santos, 150, M").passengers[0].name, "Santos");
  /* surplus cells are appended to the remarks, never dropped */
  var surplus = M.parseRoster("Cruz, Juan, 34, M, Filipino, 123 Rizal St, Tabaco City, 0917, VIP");
  check("roster paste", "surplus cells kept in remarks", surplus.passengers[0].remarks, "0917, VIP");
  check("roster paste", "surplus cells do not disturb the name", surplus.passengers[0].name, "Cruz, Juan");

  var namesOnly = M.parseRoster("Juan Cruz\nAna Reyes\nPedro Luna");
  check("roster paste", "names-only lines", namesOnly.passengers.length, 3);
  check("roster paste", "names-only leaves age blank", namesOnly.passengers[0].age, "");
  check("roster paste", "empty text", M.parseRoster("").passengers.length, 0);
  check("roster paste", "whitespace only", M.parseRoster("   \n\n ").passengers.length, 0);
  check("roster paste", "junk age blanked", M.parseRoster("Juan Cruz, bata, M").passengers[0].age, "");
  check("roster paste", "negative age blanked", M.parseRoster("Juan Cruz, -4, M").passengers[0].age, "");
  check("roster paste", "sex left as typed when unrecognised",
    M.parseRoster("Juan Cruz, 34, X").passengers[0].sex, "X");
  check("roster paste", "column order is published", M.ROSTER_COLUMNS,
    ["name", "age", "sex", "nationality", "address", "contact", "remarks"]);
  var big = [];
  for (var bi = 0; bi < M.MAX_PASSENGERS + 25; bi++) { big.push("Passenger " + bi + ", 30, M"); }
  var bigR = M.parseRoster(big.join("\n"));
  check("roster paste", "page limit holds", bigR.passengers.length, M.MAX_PASSENGERS);
  check("roster paste", "page limit is reported", bigR.truncated, true);

  /* ================================================================== *
   * 12. REVIEW — the whole manifest in one call
   * ================================================================== */
  var clean4 = M.review(voyage(), paxList(4));
  check("review", "clean manifest clears departure", clean4.cleared, true);
  check("review", "clean manifest with no arrival is OPEN", clean4.status, "OPEN");
  check("review", "clean manifest blockers", codes(clean4.departure.blockers), []);
  check("review", "counts: listed", clean4.counts.listed, 4);
  check("review", "counts: crew", clean4.counts.crew, 2);
  check("review", "counts: persons aboard", clean4.counts.personsAboard, 6);
  check("review", "counts: counted against capacity", clean4.counts.countedAgainstCapacity, 6);
  check("review", "counts: remaining", clean4.counts.remaining, 6);
  check("review", "head count taken from the list", clean4.counts.declaredTotal, 4);

  var closedReview = M.review(voyage({ returnAt: "2026-11-24T11:00", personsReturned: 6 }), paxList(4));
  check("review", "closed voyage status", closedReview.status, "CLOSED");
  check("review", "closed voyage duration", closedReview.closing.durationText, "3h 30m");
  check("review", "closed voyage closing blockers", codes(closedReview.closing.blockers), []);

  var refused = M.review(voyage({ authorisedCapacity: 12, crewCount: 2 }), paxList(15));
  check("review", "over capacity is refused", refused.cleared, false);
  check("review", "over capacity status", refused.status, "REFUSED");
  check("review", "over capacity by", refused.counts.over, 5);
  truthy("review", "refusal is a blocker, not a warning", has(refused.departure.blockers, "OVER_CAPACITY"));
  check("review", "refusal is never filed as a warning", has(refused.departure.warnings, "OVER_CAPACITY"), false);

  /* submit-by time is derived from the sourced lead time */
  check("review", "submit-by uses the one-hour lead", clean4.submitBy.text, "2026-11-24 06:30");
  check("review", "lead minutes", clean4.submitBy.leadMinutes, 60);
  check("review", "operator can lengthen the lead",
    M.review(voyage(), paxList(4), { submissionLeadMinutes: 120 }).submitBy.text, "2026-11-24 05:30");
  check("review", "no departure time, no submit-by",
    M.review(voyage({ departureAt: "" }), paxList(4)).submitBy, null);

  /* indicative exposure appears only on a refusal and only with a passage rate */
  check("review", "exposure amount", refused.exposure.amount, 5 * 2 * 350);
  check("review", "exposure excess", refused.exposure.excess, 5);
  check("review", "no exposure without a passage rate",
    M.review(voyage({ passageRate: "" }), paxList(15)).exposure, null);
  check("review", "no exposure when within capacity", clean4.exposure, null);

  /* missing voyage particulars are refusals of their own */
  truthy("review", "unnamed vessel refused",
    has(M.review(voyage({ vesselName: "" }), paxList(4)).departure.blockers, "VESSEL_NOT_NAMED"));
  truthy("review", "unnamed master refused",
    has(M.review(voyage({ master: "" }), paxList(4)).departure.blockers, "MASTER_NOT_NAMED"));
  truthy("review", "missing departure time refused",
    has(M.review(voyage({ departureAt: "" }), paxList(4)).departure.blockers, "DEPARTURE_TIME_MISSING"));
  truthy("review", "blank destination warns only",
    has(M.review(voyage({ destination: "" }), paxList(4)).departure.warnings, "NO_DESTINATION"));
  check("review", "blank destination still clears",
    M.review(voyage({ destination: "" }), paxList(4)).cleared, true);

  /* every guard at once, and nothing crashes */
  var worst = M.review(
    voyage({ authorisedCapacity: "", crewCount: "", vesselName: "", master: "",
      departureAt: "", returnAt: "2020-01-01T00:00", personsReturned: 99, declaredTotal: 50, lifejackets: 0 }),
    [pax("Juan Cruz", 30), pax("juan cruz", 30), { name: "", age: "" }]);
  truthy("review", "all guards together: refused", worst.cleared === false);
  truthy("review", "all guards together: capacity", has(worst.departure.blockers, "CAPACITY_NOT_SET"));
  truthy("review", "all guards together: duplicate", has(worst.departure.blockers, "DUPLICATE_PASSENGER"));
  truthy("review", "all guards together: incomplete", has(worst.departure.blockers, "INCOMPLETE_PARTICULARS"));
  truthy("review", "all guards together: head count", has(worst.departure.blockers, "HEAD_COUNT_MISMATCH"));
  truthy("review", "all guards together: vessel", has(worst.departure.blockers, "VESSEL_NOT_NAMED"));
  truthy("review", "all guards together: master", has(worst.departure.blockers, "MASTER_NOT_NAMED"));
  truthy("review", "all guards together: departure time", has(worst.departure.blockers, "DEPARTURE_TIME_MISSING"));
  truthy("review", "all guards together: vests", has(worst.departure.blockers, "LIFEJACKETS_SHORT"));
  truthy("review", "all guards together: cannot be closed", worst.closing.closed === false);

  /* ================================================================== *
   * 13. NO NaN, NO Infinity — anywhere in the numbers we surface
   * ================================================================== */
  function scan(group, label, obj, depth) {
    if (depth > 6 || obj === null || obj === undefined) { return; }
    if (typeof obj === "number") {
      check(group, label + " is finite", isFinite(obj), true);
      return;
    }
    if (typeof obj !== "object") { return; }
    for (var k in obj) {
      if (obj.hasOwnProperty(k)) { scan(group, label + "." + k, obj[k], depth + 1); }
    }
  }
  var JUNK_VOYAGES = [
    voyage({ authorisedCapacity: "abc", crewCount: "two", lifejackets: "many", passageRate: "free", declaredTotal: "lots" }),
    voyage({ authorisedCapacity: -1, crewCount: -5, lifejackets: -2, passageRate: -100, declaredTotal: -9 }),
    voyage({ departureAt: "nope", returnAt: "nope", personsReturned: "nope" }),
    voyage({ authorisedCapacity: 0, crewCount: 0, lifejackets: 0, passageRate: 0, declaredTotal: 0 })
  ];
  JUNK_VOYAGES.forEach(function (v, i) {
    var r = M.review(v, [{ name: "Juan", age: "x" }, {}]);
    scan("no NaN", "junk voyage " + (i + 1), r.counts, 0);
    scan("no NaN", "junk voyage " + (i + 1) + " closing", r.closing, 0);
  });
  var r0 = M.review(voyage({ authorisedCapacity: 1, crewCount: 0 }), []);
  scan("no NaN", "empty manifest counts", r0.counts, 0);

  /* ================================================================== *
   * 14. CONSTANTS — every figure declared, labelled and overridable
   * ================================================================== */
  truthy("constants", "constant table is published", M.CONSTANT_NOTES.length > 0);
  M.CONSTANT_NOTES.forEach(function (c) {
    truthy("constants", c.key + " has a value", String(c.value).length > 0);
    truthy("constants", c.key + " carries a label", String(c.label).length > 0);
    truthy("constants", c.key + " names a source", String(c.source).length > 0);
    truthy("constants", c.key + " carries a note", String(c.note).length > 20);
  });
  check("constants", "no default capacity in the table",
    (function () {
      for (var i = 0; i < M.CONSTANT_NOTES.length; i++) {
        if (M.CONSTANT_NOTES[i].key === "AUTHORISED_CAPACITY_DEFAULT") {
          return M.CONSTANT_NOTES[i].value;
        }
      }
      return "missing";
    })(), "none — required input");
  /* every indicative figure can be overridden through settings */
  var over = M.withDefaults({ childAgeThreshold: 7, lifejacketRatio: 1.1, submissionLeadMinutes: 90, overloadMultiplier: 3 });
  check("constants", "child age overridable", over.childAgeThreshold, 7);
  check("constants", "vest ratio overridable", over.lifejacketRatio, 1.1);
  check("constants", "lead time overridable", over.submissionLeadMinutes, 90);
  check("constants", "fine multiplier overridable", over.overloadMultiplier, 3);
  var def = M.withDefaults({});
  check("constants", "defaults: child rule", def.childRule, "full");
  check("constants", "defaults: child age", def.childAgeThreshold, 12);
  check("constants", "defaults: vest ratio", def.lifejacketRatio, 1);
  check("constants", "defaults: lead minutes", def.submissionLeadMinutes, 60);
  check("constants", "defaults: fine multiplier", def.overloadMultiplier, 2);
  check("constants", "junk settings fall back to defaults",
    M.withDefaults({ childAgeThreshold: "x", lifejacketRatio: "x", submissionLeadMinutes: "x" }).childAgeThreshold, 12);
  truthy("constants", "the authority is named",
    M.AUTHORITY.coastGuard.indexOf("Coast Guard") !== -1);
  check("constants", "this tool transmits nothing", M.AUTHORITY.transmits, "nothing");

  /* ================================================================== *
   * REPORT
   * ================================================================== */
  var groups = [], seen = {};
  results.forEach(function (r) {
    if (!seen[r.group]) { seen[r.group] = { name: r.group, total: 0, failed: 0, firstFail: null }; groups.push(seen[r.group]); }
    var g = seen[r.group];
    g.total++;
    if (!r.pass) { g.failed++; if (!g.firstFail) { g.firstFail = r; } }
  });
  var total = results.length, failed = 0;
  results.forEach(function (r) { if (!r.pass) { failed++; } });

  if (typeof document !== "undefined") {
    var rows = document.getElementById("rows");
    var summary = document.getElementById("summary");
    groups.forEach(function (g) {
      var tr = document.createElement("tr");
      var a = document.createElement("td"); a.textContent = g.name;
      var b = document.createElement("td"); b.className = "num"; b.textContent = String(g.total);
      var c = document.createElement("td"); c.className = "num";
      c.textContent = g.failed === 0 ? "pass" : (g.failed + " failed");
      tr.appendChild(a); tr.appendChild(b); tr.appendChild(c);
      if (rows) { rows.appendChild(tr); }
      if (g.failed && rows) {
        var tr2 = document.createElement("tr");
        var d = document.createElement("td"); d.colSpan = 3;
        d.textContent = g.firstFail.name + " — got " + g.firstFail.got + ", want " + g.firstFail.want;
        tr2.appendChild(d); rows.appendChild(tr2);
      }
    });
    if (summary) {
      summary.textContent = failed === 0
        ? (total + " assertions, all passing")
        : (failed + " of " + total + " assertions FAILED");
    }
  } else {
    groups.forEach(function (g) {
      var line = g.failed === 0 ? "ok  " : "FAIL";
      var pad = g.name;
      while (pad.length < 24) { pad += " "; }
      console.log(line + "  " + pad + g.total + " assertions" +
        (g.failed ? "  <-- " + g.firstFail.name + ": got " + g.firstFail.got + ", want " + g.firstFail.want : ""));
    });
    console.log("");
    console.log(failed === 0
      ? "PASS  " + total + " assertions in " + groups.length + " groups"
      : "FAIL  " + failed + " of " + total + " assertions");
    if (typeof process !== "undefined" && failed) { process.exitCode = 1; }
  }
})();
