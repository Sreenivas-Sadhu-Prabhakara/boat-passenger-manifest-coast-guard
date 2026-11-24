/*
 * Passenger manifest — page wiring only.
 *
 * Every rule, count and refusal comes from assets/manifest.js. Nothing here
 * decides whether a manifest may be issued; this file reads the form, calls
 * the rules module, and draws the result and the sheet.
 *
 * No dependencies, no network, no dynamic code. Everything the operator types
 * stays in this browser: the draft and the voyage log are written to this
 * device's local storage and nowhere else.
 */
(function () {
  "use strict";

  var M = window.MANIFEST;
  if (!M) { return; }

  var DRAFT_KEY = "omsme-boat-manifest-draft";
  var LOG_KEY = "omsme-boat-manifest-log";
  var LOG_MAX = 120;

  var VOYAGE_FIELDS = ["operator", "vessel", "vesselno", "master", "masterlic", "capacity",
    "crew", "vests", "from", "to", "depart", "fare", "declared", "childage", "lead",
    "returnat", "returned", "arrivalnote"];
  var PAX_FIELDS = ["p-name", "p-age", "p-sex", "p-nat", "p-contact", "p-addr", "p-remarks"];

  var state = {
    passengers: [],
    childRule: M.CHILD_RULE_DEFAULT,
    required: M.REQUIRED_PARTICULARS_DEFAULT.slice(),
    log: []
  };
  var lastReview = null;

  /* ------------------------------ helpers ------------------------------ */

  function byId(id) { return document.getElementById(id); }
  function val(id) { var e = byId(id); return e ? e.value : ""; }
  function setVal(id, v) { var e = byId(id); if (e) { e.value = v === null || v === undefined ? "" : String(v); } }
  function setText(id, t) { var e = byId(id); if (e) { e.textContent = t; } }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = String(text); }
    return e;
  }
  function clear(node) { while (node && node.firstChild) { node.removeChild(node.firstChild); } }

  var INT = (function () {
    try { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }); } catch (e) { return null; }
  })();
  var PESO = (function () {
    try {
      return new Intl.NumberFormat("en-PH", {
        style: "currency", currency: "PHP", minimumFractionDigits: 0, maximumFractionDigits: 2
      });
    } catch (e) { return null; }
  })();

  function num(n) {
    if (typeof n !== "number" || !isFinite(n)) { return "—"; }
    return INT ? INT.format(n) : String(n);
  }
  function money(n) {
    if (typeof n !== "number" || !isFinite(n)) { return "—"; }
    if (PESO) { return PESO.format(n); }
    return "PHP " + n.toFixed(2);
  }
  function plural(n, one, many) { return n === 1 ? one : (many || one + "s"); }
  function dash(v) {
    var s = M.clean(v);
    return s === "" ? "—" : s;
  }

  /* ------------------------------ reading the form ------------------------------ */

  function readVoyage() {
    return {
      operator: val("operator"),
      vesselName: val("vessel"),
      vesselNumber: val("vesselno"),
      master: val("master"),
      masterLicence: val("masterlic"),
      authorisedCapacity: val("capacity"),
      crewCount: val("crew"),
      lifejackets: val("vests"),
      departurePoint: val("from"),
      destination: val("to"),
      departureAt: val("depart"),
      passageRate: val("fare"),
      declaredTotal: val("declared"),
      returnAt: val("returnat"),
      personsReturned: val("returned"),
      arrivalNote: val("arrivalnote")
    };
  }

  function readSettings() {
    return {
      childRule: state.childRule,
      childAgeThreshold: val("childage"),
      required: state.required,
      submissionLeadMinutes: val("lead")
    };
  }

  /* ------------------------------ the rule toggles ------------------------------ */

  function buildRequiredToggles() {
    var box = byId("reqset");
    if (!box) { return; }
    clear(box);
    for (var i = 0; i < M.PARTICULARS.length; i++) {
      var p = M.PARTICULARS[i];
      var b = el("button", null, p.label + (p.sourced ? " ·" : ""));
      b.type = "button";
      b.setAttribute("data-req", p.key);
      b.setAttribute("aria-pressed", state.required.indexOf(p.key) !== -1 ? "true" : "false");
      if (p.key === "name" && M.NAME_ALWAYS_REQUIRED) {
        b.disabled = true;
        b.title = "A manifest row with no name identifies nobody, so the name is always required.";
      } else {
        b.title = p.sourced
          ? "Named in Department Order 2000-25 as a manifest particular."
          : "Commonly asked for, but we could not source it as a requirement.";
      }
      box.appendChild(b);
    }
  }

  function paintChildRule() {
    var box = byId("childrule");
    if (!box) { return; }
    var bs = box.querySelectorAll("button[data-child]");
    for (var i = 0; i < bs.length; i++) {
      bs[i].setAttribute("aria-pressed", bs[i].getAttribute("data-child") === state.childRule ? "true" : "false");
    }
    var thr = M.withDefaults(readSettings()).childAgeThreshold;
    setText("c-chargeable-label", state.childRule === M.CHILD_RULE_FULL
      ? "Passengers counted against capacity"
      : "Passengers counted against capacity (child rule, under " + thr + ")");
  }

  /* ------------------------------ the passenger list ------------------------------ */

  function cell(tr, text, cls) {
    var td = el("td", cls || null, text);
    tr.appendChild(td);
    return td;
  }

  function renderPassengers() {
    var tb = byId("paxrows");
    if (!tb) { return; }
    clear(tb);
    if (state.passengers.length === 0) {
      var tr0 = el("tr");
      var td0 = el("td", null, "No passengers listed yet. A manifest with nobody on it identifies nobody.");
      td0.colSpan = 9;
      tr0.appendChild(td0);
      tb.appendChild(tr0);
    }
    for (var i = 0; i < state.passengers.length; i++) {
      var p = state.passengers[i];
      var tr = el("tr");
      cell(tr, String(i + 1), "num");
      cell(tr, M.clean(p.name) === "" ? "(no name)" : M.clean(p.name));
      cell(tr, M.clean(p.age) === "" ? "—" : M.clean(p.age), "num");
      cell(tr, dash(p.sex));
      cell(tr, dash(p.nationality));
      cell(tr, dash(p.address));
      cell(tr, dash(p.contact));
      cell(tr, dash(p.remarks));
      var td = el("td");
      var seg = el("div", "seg");
      var b = el("button", null, "Remove");
      b.type = "button";
      b.setAttribute("data-del", String(i));
      seg.appendChild(b);
      td.appendChild(seg);
      tr.appendChild(td);
      tb.appendChild(tr);
    }
    setText("paxcount", state.passengers.length + " " + plural(state.passengers.length, "person", "persons") + " listed");
  }

  /* ------------------------------ issues ------------------------------ */

  function issueNode(kind, code, message) {
    var d = el("div", "issue " + kind);
    if (code) { d.appendChild(el("span", "code", code)); }
    d.appendChild(document.createTextNode(message));
    return d;
  }

  function renderIssues(review) {
    var box = byId("issues");
    if (!box) { return; }
    clear(box);
    var i;
    for (i = 0; i < review.departure.blockers.length; i++) {
      box.appendChild(issueNode("block", review.departure.blockers[i].code, review.departure.blockers[i].message));
    }
    if (review.departure.cleared) {
      box.appendChild(issueNode("good", null,
        "Nothing is blocking this manifest. " + num(review.counts.listed) + " " +
        plural(review.counts.listed, "passenger", "passengers") + " and " + num(review.counts.crew) + " " +
        plural(review.counts.crew, "crew member", "crew") + " aboard, " +
        (review.counts.remaining === null ? "" : num(review.counts.remaining) + " " +
          plural(review.counts.remaining, "place", "places") + " to spare. ") +
        "Print it, have the master sign it, and hand it in."));
    }
    for (i = 0; i < review.closing.blockers.length; i++) {
      box.appendChild(issueNode(
        review.closing.blockers[i].code === "VOYAGE_OPEN" ? "warn" : "block",
        review.closing.blockers[i].code, review.closing.blockers[i].message));
    }
    for (i = 0; i < review.departure.warnings.length; i++) {
      box.appendChild(issueNode("warn", review.departure.warnings[i].code, review.departure.warnings[i].message));
    }
    for (i = 0; i < review.closing.warnings.length; i++) {
      box.appendChild(issueNode("warn", review.closing.warnings[i].code, review.closing.warnings[i].message));
    }
    var open = openVoyages();
    if (open > 0) {
      box.appendChild(issueNode("warn", "LOG_HAS_OPEN_VOYAGES",
        open + " saved " + plural(open, "voyage", "voyages") + " in the log " +
        (open === 1 ? "is" : "are") + " still open — nobody has been counted back. Close " +
        (open === 1 ? "it" : "them") + " in the voyage log below."));
    }
  }

  /* ------------------------------ the result panel ------------------------------ */

  function renderResult(review) {
    var c = review.counts;
    var blockers = review.departure.blockers.length;

    if (review.capacity.status === "CAPACITY_NOT_SET") {
      setText("status-k", "Authorised capacity not set");
      setText("status-v", "—");
      setText("status-sub", "Type the authorised passenger capacity from the vessel's own certificate. This tool ships no capacity table and will not assume one.");
    } else if (review.capacity.status === "OVER_CAPACITY") {
      setText("status-k", "Refused — over the authorised capacity");
      setText("status-v", num(c.over) + " OVER");
      setText("status-sub", num(c.countedAgainstCapacity) + " counted against a capacity of " +
        num(c.capacity) + ". Take " + num(c.over) + " " + plural(c.over, "person", "persons") +
        " off before departure.");
    } else if (blockers > 0) {
      setText("status-k", "Manifest refused");
      setText("status-v", "REFUSED");
      setText("status-sub", blockers + " " + plural(blockers, "refusal", "refusals") +
        " below. Printing is locked until each one is cleared.");
    } else {
      setText("status-k", "Counted against authorised capacity");
      setText("status-v", num(c.countedAgainstCapacity) + " of " + num(c.capacity));
      if (review.status === "CLOSED") {
        setText("status-sub", "Voyage closed — all " + num(c.personsAboard) + " " +
          plural(c.personsAboard, "person", "persons") + " counted back after " + review.closing.durationText + ".");
      } else {
        setText("status-sub", "Manifest can be issued. Voyage stays open until the arrival time and the head count on arrival are recorded.");
      }
    }

    setText("c-listed", num(c.listed));
    setText("c-adults", num(c.adults));
    setText("c-children", num(c.children));
    setText("c-chargeable", num(c.chargeable));
    setText("c-crew", num(c.crew));
    setText("c-counted", num(c.countedAgainstCapacity));
    setText("c-capacity", c.capacity === null ? "not set" : num(c.capacity));
    setText("c-remaining", c.capacity === null ? "—"
      : (c.over > 0 ? "over by " + num(c.over) : num(c.remaining)));
    setText("c-aboard", num(c.personsAboard));
    setText("c-vests", review.lifejackets.checked
      ? num(review.lifejackets.have) + " / " + num(review.lifejackets.need)
      : "not recorded / " + num(review.lifejackets.need));
    setText("c-submit", review.submitBy ? review.submitBy.text : "—");

    var note = byId("refusal-note");
    if (note) {
      if (review.exposure) {
        note.textContent = "Refused. Carrying " + num(review.exposure.excess) + " over the authorised capacity " +
          "exposes the operator to a penalty reckoned as excess passengers × " + review.exposure.multiplier +
          " × the passage rate — on the figures entered, about " + money(review.exposure.amount) +
          ", plus whatever the schedule in force provides. Indicative only: " + review.exposure.basis + ".";
      } else if (blockers > 0) {
        note.textContent = "Printing is locked: " + blockers + " " + plural(blockers, "refusal", "refusals") +
          " above. An over-capacity or incomplete manifest is refused here, not warned about.";
      } else {
        note.textContent = "An over-capacity manifest is refused here, not warned about: printing stays locked until the number over is taken off the boat.";
      }
    }

    var p = byId("print");
    if (p) {
      p.disabled = !review.cleared;
      p.title = review.cleared
        ? "Print the manifest, or save it as a PDF."
        : "Printing is locked until the refusals above are cleared.";
    }
  }

  /* ------------------------------ the sheet to hand over ------------------------------ */

  function sheetField(grid, label, value) {
    var d = el("div");
    d.appendChild(el("b", null, label));
    d.appendChild(el("span", null, value === "" || value === null || value === undefined ? "—" : String(value)));
    grid.appendChild(d);
  }

  function childRuleSentence(review) {
    var s = review.settings;
    if (s.childRule === M.CHILD_RULE_FULL) {
      return "Every person aboard counted as one person, children and infants included.";
    }
    if (s.childRule === M.CHILD_RULE_HALF) {
      return "Children under " + s.childAgeThreshold + " counted as half a person, rounded up, under a rule set by the operator.";
    }
    return "Children under " + s.childAgeThreshold + " not counted against capacity, under a rule set by the operator.";
  }

  function renderSheet(review, v) {
    var sheet = byId("sheet");
    if (!sheet) { return; }
    clear(sheet);
    var c = review.counts;

    var head = el("div", "sheet-head");
    head.appendChild(el("h3", null, "PASSENGER MANIFEST AND VOYAGE RECORD"));
    head.appendChild(el("div", "sheet-sub",
      dash(v.operator) + " — one manifest for one voyage. Not a prescribed form: a record to hand over or copy onto the form you are given."));
    sheet.appendChild(head);

    var stamp;
    if (!review.cleared) {
      stamp = el("div", "sheet-stamp refused");
      var first = review.departure.blockers[0];
      stamp.textContent = "NOT CLEARED — DO NOT SAIL. " + (first ? first.message : "");
    } else if (review.status === "CLOSED") {
      stamp = el("div", "sheet-stamp closed");
      stamp.textContent = "VOYAGE CLOSED — " + num(c.personsAboard) + " " +
        plural(c.personsAboard, "person", "persons") + " departed and " + num(c.personsAboard) +
        " accounted for on arrival.";
    } else {
      stamp = el("div", "sheet-stamp open");
      stamp.textContent = "VOYAGE OPEN — arrival not yet recorded. This record is not complete until the head count on arrival is entered.";
    }
    sheet.appendChild(stamp);

    var g1 = el("div", "sheet-grid");
    sheetField(g1, "Operator", dash(v.operator));
    sheetField(g1, "Vessel", dash(v.vesselName));
    sheetField(g1, "Vessel no.", dash(v.vesselNumber));
    sheetField(g1, "Authorised capacity", c.capacity === null ? "NOT SET" : num(c.capacity) + " persons, crew included");
    sheetField(g1, "Master", dash(v.master));
    sheetField(g1, "Licence no.", dash(v.masterLicence));
    sheetField(g1, "From", dash(v.departurePoint));
    sheetField(g1, "Departure", M.parseStamp(v.departureAt) === null ? "NOT SET" : M.formatStamp(M.parseStamp(v.departureAt)));
    sheetField(g1, "To", dash(v.destination));
    sheetField(g1, "Manifest due", review.submitBy ? review.submitBy.text + " (" + review.submitBy.leadMinutes + " min before)" : "—");
    sheetField(g1, "Crew aboard", num(c.crew));
    sheetField(g1, "Life vests", review.lifejackets.checked
      ? num(review.lifejackets.have) + " aboard for " + num(review.lifejackets.need) + " persons"
      : "not recorded");
    sheet.appendChild(g1);

    sheet.appendChild(el("h3", null, "Passengers — " + num(c.listed) + " listed"));
    var wrap = el("div", "tablewrap");
    var table = el("table", "breakdown");
    var thead = el("thead");
    var htr = el("tr");
    var heads = [["#", "num"], ["Full name", null], ["Age", "num"], ["Sex", null],
      ["Nationality", null], ["Address", null], ["Contact", null], ["Remarks", null]];
    for (var h = 0; h < heads.length; h++) {
      var th = el("th", heads[h][1], heads[h][0]);
      htr.appendChild(th);
    }
    thead.appendChild(htr);
    table.appendChild(thead);
    var tbody = el("tbody");
    if (state.passengers.length === 0) {
      var etr = el("tr");
      var etd = el("td", null, "NONE LISTED");
      etd.colSpan = 8;
      etr.appendChild(etd);
      tbody.appendChild(etr);
    }
    for (var i = 0; i < state.passengers.length; i++) {
      var p = state.passengers[i];
      var tr = el("tr");
      cell(tr, String(i + 1), "num");
      cell(tr, M.clean(p.name) === "" ? "(NO NAME)" : M.clean(p.name));
      cell(tr, M.clean(p.age) === "" ? "—" : M.clean(p.age), "num");
      cell(tr, dash(p.sex));
      cell(tr, dash(p.nationality));
      cell(tr, dash(p.address));
      cell(tr, dash(p.contact));
      cell(tr, dash(p.remarks));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    sheet.appendChild(wrap);

    var g2 = el("div", "sheet-grid");
    sheetField(g2, "Passengers", num(c.listed) + " (" + num(c.adults) + " adult, " + num(c.children) + " child)");
    sheetField(g2, "Head count", c.headCountSource === "declared"
      ? num(c.declaredTotal) + " written, " + num(c.listed) + " listed"
      : num(c.listed) + " — taken from the list");
    sheetField(g2, "Counted vs capacity", num(c.countedAgainstCapacity) + " of " +
      (c.capacity === null ? "NOT SET" : num(c.capacity)));
    sheetField(g2, "Persons aboard", num(c.personsAboard) + " including crew");
    sheetField(g2, "Places remaining", c.capacity === null ? "—"
      : (c.over > 0 ? "OVER BY " + num(c.over) : num(c.remaining)));
    sheetField(g2, "Passage rate", M.toOptionalInt(v.passageRate) === null ? "—" : money(parseFloat(v.passageRate)));
    sheet.appendChild(g2);

    var rule = el("div", "sheet-note", "Capacity reckoning: " + childRuleSentence(review));
    sheet.appendChild(rule);

    var cert = el("p", "sheet-note",
      "I certify that the persons named above are all the persons on board this vessel for this voyage, that the head count is correct, and that the number aboard is within the authorised passenger capacity of the vessel including the crew.");
    sheet.appendChild(cert);
    var sig = el("div", "sigrow");
    sig.appendChild(el("div", "sig", "Master — signature over printed name"));
    sig.appendChild(el("div", "sig", "Date and time signed"));
    sheet.appendChild(sig);

    sheet.appendChild(el("h3", null, "Arrival record"));
    var g3 = el("div", "sheet-grid");
    var ret = M.parseStamp(v.returnAt);
    sheetField(g3, "Arrived", ret === null ? "NOT RECORDED" : M.formatStamp(ret));
    sheetField(g3, "Voyage time", review.closing.durationText || "—");
    sheetField(g3, "Persons back", M.toOptionalInt(v.personsReturned) === null
      ? "NOT COUNTED" : num(M.toOptionalInt(v.personsReturned)) + " of " + num(c.personsAboard));
    sheetField(g3, "Unaccounted for", review.closing.unaccounted === null ? "—"
      : (review.closing.unaccounted > 0 ? num(review.closing.unaccounted) + " PERSONS UNACCOUNTED FOR"
        : num(-review.closing.unaccounted) + " MORE THAN DEPARTED"));
    sheetField(g3, "Remarks", dash(v.arrivalNote));
    sheetField(g3, "Status", review.status === "CLOSED" ? "CLOSED" : "OPEN");
    sheet.appendChild(g3);
    var sig2 = el("div", "sigrow");
    sig2.appendChild(el("div", "sig", "Master — head count on arrival certified"));
    sig2.appendChild(el("div", "sig", "Received by"));
    sheet.appendChild(sig2);

    sheet.appendChild(el("div", "sheet-note",
      "Prepared on a free offline tool that records and prints only. It transmits nothing and files nothing: " +
      "no copy of this manifest has been sent to the Philippine Coast Guard, to MARINA, to a port authority or to anyone else. " +
      "Submission remains the operator's responsibility. Capacity, required particulars and submission times are set by the " +
      "authority and were entered by the operator; figures on this sheet are only as good as what was typed in."));
  }

  /* ------------------------------ the voyage log ------------------------------ */

  function readLog() {
    try {
      var raw = localStorage.getItem(LOG_KEY);
      if (!raw) { return []; }
      var parsed = JSON.parse(raw);
      return Object.prototype.toString.call(parsed) === "[object Array]" ? parsed : [];
    } catch (e) { return []; }
  }
  function writeLog() {
    try { localStorage.setItem(LOG_KEY, JSON.stringify(state.log)); } catch (e) { /* storage off */ }
  }
  function openVoyages() {
    var n = 0;
    for (var i = 0; i < state.log.length; i++) { if (state.log[i].status !== "CLOSED") { n++; } }
    return n;
  }

  function logHaystack(entry) {
    var parts = [entry.vesselName, entry.destination, entry.departurePoint, entry.departureAt,
      entry.operator, entry.master, entry.status];
    for (var i = 0; i < (entry.passengers || []).length; i++) {
      parts.push(entry.passengers[i].name);
    }
    return parts.join(" ").toLowerCase();
  }

  function renderLog() {
    var tb = byId("logrows");
    if (!tb) { return; }
    clear(tb);
    var filter = M.clean(val("logfilter")).toLowerCase();
    var shown = 0;
    for (var i = 0; i < state.log.length; i++) {
      var e = state.log[i];
      if (filter && logHaystack(e).indexOf(filter) === -1) { continue; }
      shown++;
      var tr = el("tr");
      cell(tr, e.departureAt ? M.formatStamp(M.parseStamp(e.departureAt)) || e.departureAt : "—");
      cell(tr, dash(e.vesselName));
      cell(tr, dash(e.destination));
      cell(tr, num(e.personsAboard), "num");
      cell(tr, e.personsReturned === null || e.personsReturned === undefined || e.personsReturned === ""
        ? "—" : num(M.toOptionalInt(e.personsReturned)), "num");
      cell(tr, e.status === "CLOSED" ? "closed" : (e.status === "REFUSED" ? "refused" : "OPEN"));
      var td = el("td");
      var seg = el("div", "seg");
      var b1 = el("button", null, "Open");
      b1.type = "button";
      b1.setAttribute("data-load", e.id);
      var b2 = el("button", null, "Delete");
      b2.type = "button";
      b2.setAttribute("data-drop", e.id);
      seg.appendChild(b1);
      seg.appendChild(b2);
      td.appendChild(seg);
      tr.appendChild(td);
      tb.appendChild(tr);
    }
    if (shown === 0) {
      var tr0 = el("tr");
      var td0 = el("td", null, state.log.length === 0
        ? "No voyages saved on this device yet."
        : "No saved voyage matches that search.");
      td0.colSpan = 7;
      tr0.appendChild(td0);
      tb.appendChild(tr0);
    }
    var open = openVoyages();
    setText("logsummary", state.log.length === 0
      ? "nothing saved yet"
      : state.log.length + " saved · " + (open === 0 ? "none open" :
        open + " still OPEN — nobody counted back"));
  }

  function saveVoyage() {
    if (!lastReview) { return; }
    var v = readVoyage();
    var entry = {
      id: "v" + Date.now() + "-" + state.log.length,
      savedAt: M.formatStamp(Math.round(Date.now() / 60000)),
      status: lastReview.status,
      personsAboard: lastReview.counts.personsAboard,
      voyage: v,
      settings: { childRule: state.childRule, childAgeThreshold: val("childage"), required: state.required.slice() },
      passengers: state.passengers.slice(),
      operator: v.operator, vesselName: v.vesselName, destination: v.destination,
      departurePoint: v.departurePoint, departureAt: v.departureAt, master: v.master,
      personsReturned: v.personsReturned
    };
    /* saving the same departure twice replaces it, so closing a voyage updates
       the record instead of leaving two of them in the log */
    var replaced = false;
    for (var i = 0; i < state.log.length; i++) {
      if (state.log[i].departureAt === entry.departureAt &&
        M.normaliseName(state.log[i].vesselName) === M.normaliseName(entry.vesselName) &&
        entry.departureAt !== "") {
        entry.id = state.log[i].id;
        state.log[i] = entry;
        replaced = true;
        break;
      }
    }
    if (!replaced) { state.log.unshift(entry); }
    while (state.log.length > LOG_MAX) { state.log.pop(); }
    writeLog();
    renderLog();
    recompute();
  }

  function loadVoyage(id) {
    for (var i = 0; i < state.log.length; i++) {
      if (state.log[i].id === id) {
        var e = state.log[i];
        var v = e.voyage || {};
        setVal("operator", v.operator); setVal("vessel", v.vesselName); setVal("vesselno", v.vesselNumber);
        setVal("master", v.master); setVal("masterlic", v.masterLicence);
        setVal("capacity", v.authorisedCapacity); setVal("crew", v.crewCount); setVal("vests", v.lifejackets);
        setVal("from", v.departurePoint); setVal("to", v.destination); setVal("depart", v.departureAt);
        setVal("fare", v.passageRate); setVal("declared", v.declaredTotal);
        setVal("returnat", v.returnAt); setVal("returned", v.personsReturned); setVal("arrivalnote", v.arrivalNote);
        if (e.settings) {
          state.childRule = e.settings.childRule || M.CHILD_RULE_DEFAULT;
          setVal("childage", e.settings.childAgeThreshold);
          if (Object.prototype.toString.call(e.settings.required) === "[object Array]") {
            state.required = e.settings.required.slice();
          }
        }
        state.passengers = (e.passengers || []).slice();
        buildRequiredToggles();
        paintChildRule();
        renderPassengers();
        recompute();
        var sheet = byId("sheet");
        if (sheet && sheet.scrollIntoView) { sheet.scrollIntoView(); }
        return;
      }
    }
  }

  function dropVoyage(id) {
    for (var i = 0; i < state.log.length; i++) {
      if (state.log[i].id === id) {
        state.log.splice(i, 1);
        writeLog();
        renderLog();
        recompute();
        return;
      }
    }
  }

  /* ------------------------------ draft persistence ------------------------------ */

  function saveDraft() {
    try {
      var d = { v: readVoyage(), passengers: state.passengers, childRule: state.childRule, required: state.required };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch (e) { /* private mode or storage off: the page still works */ }
  }

  function loadDraft() {
    var d = null;
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      if (raw) { d = JSON.parse(raw); }
    } catch (e) { d = null; }
    if (!d || typeof d !== "object") { return; }
    var v = d.v || {};
    setVal("operator", v.operator); setVal("vessel", v.vesselName); setVal("vesselno", v.vesselNumber);
    setVal("master", v.master); setVal("masterlic", v.masterLicence);
    setVal("capacity", v.authorisedCapacity);
    if (M.clean(v.crewCount) !== "") { setVal("crew", v.crewCount); }
    setVal("vests", v.lifejackets);
    setVal("from", v.departurePoint); setVal("to", v.destination); setVal("depart", v.departureAt);
    setVal("fare", v.passageRate); setVal("declared", v.declaredTotal);
    setVal("returnat", v.returnAt); setVal("returned", v.personsReturned); setVal("arrivalnote", v.arrivalNote);
    if (d.childRule) { state.childRule = d.childRule; }
    if (Object.prototype.toString.call(d.required) === "[object Array]" && d.required.length) {
      state.required = d.required.slice();
    }
    if (Object.prototype.toString.call(d.passengers) === "[object Array]") {
      state.passengers = d.passengers.slice(0, M.MAX_PASSENGERS);
    }
  }

  /* ------------------------------ constants table ------------------------------ */

  function renderConstants() {
    var tb = byId("constant-rows");
    if (!tb) { return; }
    clear(tb);
    for (var i = 0; i < M.CONSTANT_NOTES.length; i++) {
      var c = M.CONSTANT_NOTES[i];
      var tr = el("tr");
      cell(tr, c.key);
      cell(tr, String(c.value));
      cell(tr, c.label + " — " + c.source);
      tb.appendChild(tr);
      var tr2 = el("tr", "sub");
      var td = el("td", null, c.note);
      td.colSpan = 3;
      tr2.appendChild(td);
      tb.appendChild(tr2);
    }
  }

  /* ------------------------------ recompute ------------------------------ */

  function recompute() {
    var v = readVoyage();
    var review = M.review(v, state.passengers, readSettings());
    lastReview = review;
    renderResult(review);
    renderIssues(review);
    renderSheet(review, v);
    paintChildRule();
    saveDraft();
  }

  /* ------------------------------ actions ------------------------------ */

  function addPassenger() {
    var note = byId("import-note");
    var name = M.clean(val("p-name"));
    if (name === "") {
      var e = byId("p-name");
      if (e) { e.focus(); }
      if (note) {
        clear(note);
        note.appendChild(issueNode("block", "NAME_REQUIRED",
          "Type the passenger's full name. A manifest row with no name identifies nobody."));
      }
      return;
    }
    if (state.passengers.length >= M.MAX_PASSENGERS) {
      if (note) {
        clear(note);
        note.appendChild(issueNode("warn", "LIST_FULL",
          "This page holds " + M.MAX_PASSENGERS + " rows. Split the manifest."));
      }
      return;
    }
    state.passengers.push({
      name: name,
      age: M.clean(val("p-age")),
      sex: M.normaliseSex(val("p-sex")),
      nationality: M.clean(val("p-nat")),
      address: M.clean(val("p-addr")),
      contact: M.clean(val("p-contact")),
      remarks: M.clean(val("p-remarks"))
    });
    var keep = M.clean(val("p-nat"));
    for (var i = 0; i < PAX_FIELDS.length; i++) { setVal(PAX_FIELDS[i], ""); }
    setVal("p-nat", keep);   /* most of a boatload shares a nationality */
    if (note) { clear(note); }
    var f = byId("p-name");
    if (f) { f.focus(); }
    renderPassengers();
    recompute();
  }

  function importRoster() {
    var note = byId("import-note");
    var r = M.parseRoster(val("roster"));
    var room = M.MAX_PASSENGERS - state.passengers.length;
    var added = 0;
    for (var i = 0; i < r.passengers.length && added < room; i++) {
      state.passengers.push(r.passengers[i]);
      added++;
    }
    if (note) {
      clear(note);
      var msg = added + " " + plural(added, "passenger", "passengers") + " added.";
      if (r.skipped) { msg += " " + r.skipped + " " + plural(r.skipped, "line", "lines") + " skipped (blank, a heading, or no name)."; }
      if (r.truncated || added < r.passengers.length) { msg += " The page holds " + M.MAX_PASSENGERS + " rows, so the rest were not added."; }
      msg += " Check the ages and the sex column before you print — a pasted list is only as good as what you pasted.";
      note.appendChild(issueNode(added > 0 ? "good" : "warn", null, msg));
    }
    if (added > 0) { setVal("roster", ""); }
    renderPassengers();
    recompute();
  }

  function resetAll() {
    for (var i = 0; i < VOYAGE_FIELDS.length; i++) { setVal(VOYAGE_FIELDS[i], ""); }
    for (var j = 0; j < PAX_FIELDS.length; j++) { setVal(PAX_FIELDS[j], ""); }
    setVal("crew", "2");
    setVal("childage", String(M.CHILD_AGE_THRESHOLD_DEFAULT));
    setVal("lead", String(M.SUBMISSION_LEAD_MINUTES_DEFAULT));
    setVal("roster", "");
    state.passengers = [];
    state.childRule = M.CHILD_RULE_DEFAULT;
    state.required = M.REQUIRED_PARTICULARS_DEFAULT.slice();
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* storage off */ }
    var note = byId("import-note");
    if (note) { clear(note); }
    buildRequiredToggles();
    renderPassengers();
    recompute();
  }

  function doPrint() {
    if (!lastReview || !lastReview.cleared) {
      var box = byId("issues");
      if (box && box.scrollIntoView) { box.scrollIntoView(); }
      return;
    }
    window.print();
  }

  /* ------------------------------ wiring ------------------------------ */

  function closestWith(node, attr) {
    var n = node;
    while (n && n !== document) {
      if (n.getAttribute && n.getAttribute(attr) !== null) { return n; }
      n = n.parentNode;
    }
    return null;
  }

  function wire() {
    document.addEventListener("input", function (ev) {
      var t = ev.target;
      if (!t || !t.id) { return; }
      if (t.id === "logfilter") { renderLog(); return; }
      if (t.id === "roster") { return; }
      if (t.id.indexOf("p-") === 0) { return; }
      recompute();
    });
    document.addEventListener("change", function (ev) {
      var t = ev.target;
      if (!t || !t.id) { return; }
      if (t.id.indexOf("p-") === 0 || t.id === "roster" || t.id === "logfilter") { return; }
      recompute();
    });

    var rules = byId("childrule");
    if (rules) {
      rules.addEventListener("click", function (ev) {
        var b = closestWith(ev.target, "data-child");
        if (!b) { return; }
        state.childRule = b.getAttribute("data-child");
        paintChildRule();
        recompute();
      });
    }

    var req = byId("reqset");
    if (req) {
      req.addEventListener("click", function (ev) {
        var b = closestWith(ev.target, "data-req");
        if (!b || b.disabled) { return; }
        var key = b.getAttribute("data-req");
        var at = state.required.indexOf(key);
        if (at === -1) { state.required.push(key); } else { state.required.splice(at, 1); }
        state.required = M.withDefaults({ required: state.required }).required;
        buildRequiredToggles();
        recompute();
      });
    }

    var rows = byId("paxrows");
    if (rows) {
      rows.addEventListener("click", function (ev) {
        var b = closestWith(ev.target, "data-del");
        if (!b) { return; }
        var i = parseInt(b.getAttribute("data-del"), 10);
        if (isFinite(i) && i >= 0 && i < state.passengers.length) {
          state.passengers.splice(i, 1);
          renderPassengers();
          recompute();
        }
      });
    }

    var logrows = byId("logrows");
    if (logrows) {
      logrows.addEventListener("click", function (ev) {
        var load = closestWith(ev.target, "data-load");
        if (load) { loadVoyage(load.getAttribute("data-load")); return; }
        var drop = closestWith(ev.target, "data-drop");
        if (drop) { dropVoyage(drop.getAttribute("data-drop")); }
      });
    }

    var pairs = [["add", addPassenger], ["import", importRoster], ["print", doPrint], ["reset", resetAll],
      ["save", saveVoyage]];
    for (var i = 0; i < pairs.length; i++) {
      var b = byId(pairs[i][0]);
      if (b) { b.addEventListener("click", pairs[i][1]); }
    }

    var cp = byId("clearpax");
    if (cp) {
      cp.addEventListener("click", function () {
        state.passengers = [];
        renderPassengers();
        recompute();
      });
    }
    var cl = byId("clearlog");
    if (cl) {
      cl.addEventListener("click", function () {
        state.log = [];
        writeLog();
        renderLog();
        recompute();
      });
    }

    /* Enter in the add-passenger fields adds the passenger */
    for (var k = 0; k < PAX_FIELDS.length; k++) {
      var f = byId(PAX_FIELDS[k]);
      if (f) {
        f.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter") { ev.preventDefault(); addPassenger(); }
        });
      }
    }
  }

  /* ------------------------------ start ------------------------------ */

  state.log = readLog();
  loadDraft();
  buildRequiredToggles();
  renderConstants();
  renderPassengers();
  renderLog();
  wire();
  recompute();
})();
