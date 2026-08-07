// ─────────────────────────────────────────────────────────────────────────────
// ADMIN FAQ & HELP (4 Agu 2026, Serkan istegi) — iOS HelpContent'in admin esi.
// Her modul chapter chapter: ne ise yarar, veri NEREDEN gelir, KIM girer,
// troubleshooting, referans dokumanlar. Icerik VERIDIR (chapters dizisi);
// gorunum soldaki chapter listesi + sagda Q&A. Arama tum metinde calisir.
// Yeni ozellik eklenince BURASI da guncellenir (felsefe: is ya TAM ya HIC).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useMemo } from 'react';

const CHAPTERS = [
  {
    id: 'overview', icon: '◆', title: 'SYSTEM OVERVIEW',
    intro: 'What GO2 eFB is, how the three environments fit together, and the principles every module follows.',
    sections: [
      { h: 'ARCHITECTURE', qa: [
        ['What is GO2 eFB?',
         'An EASA AMC 20-25 Type B Electronic Flight Bag for business-jet operations. Two faces, one data source: the iPad app (SwiftUI) that the pilots fly with, and this web panel (React, letsgo2fly.com) for admin and dispatch. Everything meets in one Supabase backend — the single source of truth.'],
        ['Which side writes which data?',
         'Pilots write operational flight data on the iPad (crew selection, fuel, checks, NavLog times, signatures, photos). Dispatch/admin writes reference data here: aircraft, crew profiles, FTL duties and rulesets, aerodrome risk surveys (RAAQ), and post-flight corrections. The archived flight and its PDF report are produced on the server — both sides open the same file.'],
        ['Does the iPad need internet in flight?',
         'No — offline-first is a design principle. Pilot input goes to the device first and is mirrored to the server when a connection exists. Queues (uploads, archive, logs) drain automatically when internet returns. A downloaded plan can be flown with no connectivity at all.'],
      ]},
      { h: 'PRINCIPLES (apply everywhere)', qa: [
        ['"The system never claims to have checked something it could not check."',
         'Green never means "clean" — it means "no conflict observed against the data listed". Missing or stale data shows amber/INCONCLUSIVE, never green. Timestamps tell you the AGE of what you see. If automation breaks, the system says so.'],
        ['"Audit trail cannot be deleted."',
         'Audit tables (module data, flight logs, FTL edit log, weather snapshots, sync log) have no DELETE policy at database level. First-seen timestamps are written once and never change. Where deletion is legitimate (a planned duty that never happened), the reason is mandatory and the tombstone stays in the edit log.'],
        ['"One source per fact."',
         'The same figure is never maintained in two places. Block times come only from the archived flight; the FTL panel cannot edit them. Takeoff fuel comes from the Fuel module; the report PDF is rendered once on the server for everyone.'],
        ['"A job is done completely or not at all."',
         'Every feature ships across all its layers — app UI, database, sync, web panel, report PDF, audit trail, help text — or it does not ship. If scope is narrowed on purpose, the gap is written into the backlog, never left silent.'],
      ]},
      { h: 'REFERENCE DOCUMENTS', qa: [
        ['Which documents govern this system?',
         'EASA AMC 20-25 (Type B EFB) for the app itself; SHT-FTL/HG (13.04.2018 Rev 00) for flight time limitations — its ruleset regulation layer is transcribed from it article by article; ICAO Doc 9859 for the safety-risk framework used by RAAQ; FOP-FRM-02 (Route and Aerodrome Qualification Training Form) for the RAAQ special items; and the internal System & Module Handbook for module-level detail.'],
      ]},
    ],
  },
  {
    id: 'active', icon: '●', title: 'ACTIVE FLTS',
    intro: 'Uploaded flight plans, their parsed fields, module progress and the live status of each flight.',
    sections: [
      { h: 'DATA FLOW', qa: [
        ['Where does a flight plan come from?',
         'Dispatch uploads the OFP package here. The parse-plan function reads the raw text and produces one plan row PER SECTOR: departure, destination, alternate, STD/ETA, fuel figures (trip / alternate / final reserve / TOTAL FOB), route, ATC FPL block, FMS ident, registration and FIR list. Multi-leg documents are split by the (FMS IDENT, Log Nr.) page headers — each sector gets its own route and its own fuel table.'],
        ['Who fills the module columns (FLT CREW, FUEL, NAV LOG…)?',
         'The pilots, on the iPad, while preparing and flying. Each module mirrors its data to the server as soon as there is a connection, so this list shows live progress. Nothing in those columns is typed in the panel.'],
        ['What does the FOREFLIGHT handoff send?',
         'The sector\'s own airway route text (from the plan row), DEP/DEST, best TAS and first planned level. It is one-way and read-only.'],
      ]},
      { h: 'TROUBLESHOOTING', qa: [
        ['A sector shows the wrong route / a waypoint from another leg.',
         'Re-upload the OFP package. The parser matches each sector\'s ICAO FPL block by FIELD ORDER (departure line → route line → destination line), so an A→B and B→A pair in one document cannot cross-contaminate. If a plan parsed before 4 Aug 2026 shows a leaked route, re-parsing fixes it.'],
        ['NavLog on the iPad is empty for one leg.',
         'The leg isolator returns the FULL text rather than an empty list when it cannot find the sector safely — an over-long list is recoverable, an empty NavLog is not. Check the plan\'s FMS IDENT matches the OFP page headers.'],
      ]},
    ],
  },
  {
    id: 'archived', icon: '◎', title: 'ARCHIVED FLTS',
    intro: 'The permanent record: how a flight is archived, what the PDF contains, and how corrections work.',
    sections: [
      { h: 'HOW ARCHIVING WORKS', qa: [
        ['What happens when the pilot presses ARCHIVE?',
         'A pre-archive gate on the iPad lists anything missing BY NAME. When clear, the archive-flight function collects every module\'s server mirror (crew, mandatory, fuel, RAAQ, accept & sign, T/O data, NavLog, LND data), the weather snapshots, documents and photos, computes block/airborne minutes from the NavLog times (single source), renders the PDF report, and writes the archived_flights row. It then propagates the ACTUAL times into the FTL duty (step 14).'],
        ['Where do block times come from?',
         'Only from the NavLog entries of the archived flight: OFF BLOCK, TAKEOFF, LANDING, ON BLOCK. The FTL panel never edits them — if a time is wrong, correct the ARCHIVE (admin edit with reason) and the correction flows into FTL automatically on regeneration.'],
        ['How does a DIVERT appear?',
         'Automatically. The arrival used everywhere is the divert aerodrome; the report prints the destination in divert colour with the DIVERT REASON; the FTL sector receives actual_dest and shows "DEP-DEST>ACT DVT". No manual step.'],
      ]},
      { h: 'CORRECTIONS', qa: [
        ['Can an archived value be edited?',
         'Yes — with a mandatory reason. Admin EDIT stores the old value struck through and the new value in green, and the report gains an AMENDED band listing every change in full (values are never truncated: a clipped character is lost evidence). The original entry timestamps stay untouched.'],
        ['Can an archive be deleted?',
         'It must not be. Audit data is retention-bound; deletion of archived records is being converted to soft-delete. Never hard-delete an archive row.'],
      ]},
    ],
  },
  {
    id: 'aircrafts', icon: '✈', title: 'AIRCRAFTS',
    intro: 'Fleet list and airframe/engine totals.',
    sections: [
      { h: 'DATA', qa: [
        ['Who maintains this list?',
         'Admin. Registration, type, landing category and starting totals are entered here; every aircraft belongs to the company context (multi-tenant).'],
        ['Where do the hour/cycle totals come from?',
         'Starting totals entered on creation PLUS the archived flights\' airborne minutes and landing counts. The archive is the counter — no separate bookkeeping.'],
      ]},
    ],
  },
  {
    id: 'crews', icon: '◈', title: 'CREWS',
    intro: 'Pilot profiles, qualifications and FTL baselines.',
    sections: [
      { h: 'DATA', qa: [
        ['Where do pilot accounts come from?',
         'Created here via the manage-user function (email + password + code + role). The profile row carries the company id; the iPad reads the same profiles for its crew list, cached for offline use.'],
        ['What is an FTL baseline?',
         'The pilot\'s carried-forward totals (flight and duty hours) at a reference date, entered once per pilot so cumulative limits are correct from day one. Later hours accumulate from duties and archives automatically.'],
      ]},
    ],
  },
  {
    id: 'ftl', icon: '⏱', title: 'FTL',
    intro: 'Duty planning, the roster, duty history reports, the edit audit log and the ruleset — SHT-FTL/HG (air taxi, fixed wing). All times UTC; local time is derived internally only where the regulation requires it.',
    sections: [
      { h: 'ASSIGN DUTY', qa: [
        ['How is the duty window computed?',
         'From the sectors\' UTC times: report = first ETD minus the pre-flight report period; FDP = report → last on-block; duty end = +post-flight period; Max FDP comes from SHT-FTL/HG Md.22(2) Table 1: report-time band (06:00-15:00 / 15:01-18:00 / 18:01-05:59) × sector group (1-4 / 5 / 6+) × single-or-dual pilot; long-range duties (≥4h timezone crossing) are capped at 14:00 (Md.22(3)). The wizard shows every pilot\'s fitness (rest, 7/14/28-day and year cumulatives) against the duty before you assign — NOT LEGAL rows cannot be selected.'],
        ['Are the times UTC or local?',
         'UTC — every time you type and every time shown here, exactly like the rest of the EFB, the flight report and the archive. Local time is never asked for and never displayed. Where the regulation genuinely needs a LOCAL time, the panel derives it itself from the aerodrome timezone: the Table-1 band (Md.22/2, read in the local time of the aerodrome the crew is acclimatised to), the free-day windows (Md.4/ü, the home base\'s local night) and long-range detection (Md.4/ee).'],
        ['What do airport timezones change then?',
         'Only those three derived calculations — never the stored instant. Because times are UTC, absolutising them is direct, so a missing aerodrome timezone can no longer shift a duty end or a rest window. What it does affect is the Table-1 band: if the timezone is unknown, acclimatisation cannot be resolved and the pilot shows NOT LEGAL rather than being computed against a guessed band. Every airport in the database carries a timezone, so this should not appear.'],
        ['ADD COCKPIT CREW — CRZ CPT vs CHECK RIDE?',
         'Visible once PF and PM are set; it never alters the pairing. CRZ CPT: pick a third company pilot from the list — augmented-crew limits apply per SHT-FTL/HG Md.11 (Table-1 FDP +2:00 with one additional pilot, max 3 sectors, in-flight rest 90 min each / 2h for the landing crew on a reclining seat; never combined with split duty — Md.15(d)), and the third pilot is a full crew member for duty, rest and cumulatives. CHECK RIDE: type the external TRE/TRI\'s name — recorded on the assignment and printed on reports, but no company FTL is tracked for an external examiner and standard 2-pilot FDP applies.'],
        ['What is OPERATION and why does it change the limits?',
         'SHT-FTL/HG applies a different limit set to each kind of operation (Md.9): AIR TAXI and AERIAL WORK use the Md.22 Table-1 matrix, GENERAL AVIATION uses the flat Md.25 values (12:00 single-pilot, 14:00 two-pilot), TRAINING uses Md.27 — a 12:00 duty period PLUS a separate daily FLIGHT-time limit (halved if theoretical training is planned the same day, Md.27/ç, with a 60-minute post-flight period). Split duty, augmented crew and the long-range cap apply only to the operation types the regulation allows them for.'],
        ['Where does OPERATION come from — do I pick it?',
         'It comes from the ATC flight plan when one exists for the same date and route: RMK/BUSINESS FLIGHT → AIR TAXI, RMK/PRIVATE FLIGHT → GENERAL AVIATION. The panel shows the source under the selector. You can still change it, and the record then says MANUAL OVERRIDE together with what the flight plan said — so it is always documented WHY a limit set was applied. Real dispatcher typos are tolerated ("BUSSINESS") and the raw remark is stored verbatim. If nothing recognisable is filed, the type stays empty rather than being guessed.'],
        ['ICAO field 8 says N on every flight — is that a contradiction?',
         'No, and it is deliberately NOT flagged. In this operator\'s filing template field 8 (flight type) is N — non-scheduled — on every flight, private ones included; only the remark distinguishes them. A note on every private flight would be noise, and noise trains people to ignore notes. So N and S pass silently, while G — a positive claim of general aviation — does raise a contradiction note when the remark says otherwise. Nothing is discarded: the raw field-8 value and the raw remark are both stored on the plan, so flights where the two differ can always be queried.'],
        ['Why does a past-dated duty save as ACTUAL?',
         'A duty entered for a past date is not a plan — it already happened (the app may have been down, or the flight was flown on paper). It saves as actual/finished and the typed times are taken as REAL. The sector carries entered_manually and no plan_id; if the real archive arrives later, measured values overwrite the manual ones.'],
        ['What does the DAYS OFF column tell me?',
         'The pilot\'s free days in the month of the assignment, counted the way Md.5 requires: 7 per month grouped as 2+2+1+1+1 with both halves of the month represented, and 96 per calendar year. A day only counts if BOTH local nights around it are free (Md.4/ü — 22:00-08:00 the night before and the night after, in the pilot\'s home-base timezone). Days failing that test are not counted and are listed in the column\'s tooltip, so you can see exactly which ones were rejected. A single free day is also required after 6 consecutive duty days — that one blocks the assignment.'],
        ['What is the ACCLIM column?',
         'Which aerodrome\'s local time the Table-1 band is read in (SHT-FTL/HG Md.22/1). Normally that is the departure aerodrome, and the column stays grey. After an east-west trip it can differ: a crew member is acclimatised to an aerodrome once they fly to a time zone within a 2-hour band of it and take a minimum rest. Outside that band, resting LESS than 24 hours away from base keeps them acclimatised to the FIRST departure aerodrome; 24 hours or more moves them to the CURRENT one. Resting at home base always means home base.'],
        ['Why does that change MAX FDP?',
         'Because Table 1 is entered by the report time — and the regulation means the crew member\'s body clock, not the wall clock at the gate. If they are still on Istanbul time, a 06:00 departure from New York is 13:00 to them, and the band that applies is the one their body is in. The panel shows "BAND hh:mm" next to the aerodrome whenever the two differ, so you can see which time produced the limit. The physical times — report, off-block, duty end — never change.'],
        ['What if it says UNKNOWN?',
         'The chain could not be resolved — usually a missing aerodrome timezone, an unknown rest duration, or a ruleset that does not define acclimatisation. The pilot is then NOT LEGAL for the assignment rather than being silently computed with the departure time, because a band chosen by guesswork is a max FDP that cannot be defended in an audit.'],
        ['STANDBY — how does it change the duty I am assigning?',
         'Standby is recorded as a GND duty (AIRPORT STANDBY Md.17/1 or OTHER STANDBY Md.17/2) and it shortens the MAX FDP of a flight assigned the same day. AIRPORT standby counts as duty in full and shortens max FDP by whatever exceeds 4 hours; standby plus the assigned FDP may not exceed 16 hours combined (Md.17/1/c). OTHER standby counts 25% as duty, may not itself exceed 16 hours (Md.17/2/b), and shortens max FDP by whatever exceeds 6 hours — 8 hours if the FDP was extended by in-flight rest or split duty; if no duty follows, 8 hours of rest do (Md.17/2/e). The effect is shown while you are writing the standby, not only later on the flight.'],
        ['Why is MAX FDP in the tiles different from the crew table?',
         'Because standby is PER PILOT. Two pilots on the same flight can have different ceilings — one waited on standby since morning, the other did not. The tiles show the baseline WITHOUT standby; the crew table shows each pilot\'s real ceiling, and that per-pilot value is what gets saved on their duty row. When any selected pilot has a reduction, a note under the tiles spells it out. Breaching the 16-hour combined cap or the 16-hour external-standby maximum blocks the save — it is a regulatory ceiling, not an advisory. Swapping in a different pilot in EDIT re-resolves standby for the new pilot, even when the times do not change.'],
        ['How do I see later WHY an FDP was short?',
         'The duty row stores the reduction in minutes, a link to the standby duty, and a frozen human-readable summary (kind, times, article, reduction). It is frozen on purpose — the same reason every duty stores its ruleset snapshot — so the answer survives even if the standby row is later corrected or deleted. It appears as an SB badge on the roster and in duty history, and prints as its own line in the duty history report.'],
      ]},
      { h: 'ROSTER', qa: [
        ['Why does a 10-day OFF show as one row?',
         'Multi-day assignments (OFF blocks, reports, multi-day trips) display as one row with a start–end date range and a single crew list. The underlying data is still one row per day per pilot — FTL arithmetic needs that — only the display is grouped.'],
        ['EDIT vs CANCEL vs DELETE?',
         'EDIT (flight duties): change date, sectors (add with + ADD SECTOR, remove with ✕, retime, change DEST) and swap crew; the window is recomputed with the duty\'s OWN ruleset snapshot, not today\'s rules. On an ACTUAL duty the times are locked (single source = archive) and only crew can be corrected. CANCEL keeps the row marked cancelled — the only path for duties that happened. DELETE exists only for planned duties never linked to a flight, enforced by database policy. All three demand a reason, written to the edit log BEFORE the change.'],
        ['What is the CHAIN warning?',
         'If your edit pushes duty end so late that the pilot\'s next duty would start before the new earliest-next-report, the panel warns in amber. It never auto-fixes the next duty — a chain effect is a finding for a human, not a silent correction.'],
        ['What does the REVIEW badge mean?',
         'The archive tried to write actual times into this duty but the sector match was ambiguous (same day, similar sectors) — so it wrote NOTHING and flagged the duty instead. Open it, verify, and correct via EDIT. Writing into the wrong sector would corrupt another flight\'s record; the flag is the safe failure mode.'],
        ['How does a divert show here?',
         'The archived sector keeps its planned DEP-DEST and gains the actual arrival: "LTFE-LTAC>LTBA DVT". Times, FDP and rest all use the real values.'],
      ]},
      { h: 'SKPK — COMMANDER\'S DISCRETION', qa: [
        ['What is SKPK and where do I enter it?',
         'Commander\'s discretion under SHT-FTL/HG Md.12: when unforeseen circumstances arise AFTER duty start, the commander may extend the FDP or shorten a rest. It is not a planning tool — it records something that already happened, so the section only appears on a duty that has been flown, in ROSTER → EDIT. Leave it blank when nothing happened.'],
        ['What are the limits?',
         'FDP may be extended by at most 2:00, or 3:00 with an augmented crew (Md.12/1/a). Rest may be shortened by at most 2:00 and never below a 10:00 floor (Md.12/2). Rest may NOT be shortened after an FDP that was itself extended by discretion (Md.12/3). Breaching any of these blocks the save — the panel names the article rather than just refusing.'],
        ['Why does the next rest get longer?',
         'Md.12/2: if a rest is shortened, the rest earned after the SUBSEQUENT duty increases by TWICE the reduction. The panel applies that automatically to this duty\'s minimum rest and recomputes the earliest next report. If the pilot already has a duty inside that new window, you get a chain warning — never a silent fix.'],
        ['Who has to be told?',
         'The operator always — a commander\'s report is mandatory for ANY discretion (Md.12/1/c/1), so the panel refuses an SKPK entry with no report text. On top of that, if the realised extension or reduction exceeds 1:00, a copy of the commander\'s report TOGETHER WITH THE OPERATOR\'S OWN COMMENTS must reach the DGCA within 28 days of the event (Md.12/1/c/2).'],
        ['How is the 28-day deadline tracked?',
         'The SKPK tab lists every event with its deadline and status — OVERDUE, DUE IN n DAYS, SENT, or operator-only. Overdue events also show as a red count on the tab itself, so the deadline cannot pass unseen even if nobody opens the tab. PACKET prints the sendable document: flight, what was applied, the commander\'s report and the operator\'s comments. MARK SENT records the dispatch; what you type there IS the operator\'s comments and is stored and printed as such.'],
        ['Where does the suggested extension come from?',
         'From the archived times: actual FDP (report → last on-block) minus the max FDP that applied before discretion. It is offered as a button, never written for you — the commander\'s realised figure is a human statement, and the regulation asks for what actually happened, not for our arithmetic.'],
        ['Can I edit an SKPK entry afterwards?',
         'Yes, and re-editing is safe: the panel always recomputes from the pre-discretion baseline rather than stacking on the stored values, so the extension and the 2× compensation can never be applied twice. Every change is logged with a mandatory reason, and the date the report reached the operator is not moved backwards by later corrections.'],
      ]},
      { h: 'DUTY HISTORY & EDIT REPORT', qa: [
        ['What does DUTY HISTORY print?',
         'A per-pilot period report: every duty with sectors, roles and times, plus totals — duty hours, sectors as PF, as PM, and as CRZ CPT when present. Check-ride flights carry the TRE/TRI name.'],
        ['What is EDIT REPORT?',
         'The immutable audit log (ftl_duty_edits): every edit, cancel and delete with who, when, field, old → new and the reason. The table has no UPDATE or DELETE policy — if a delete is later refused, the log corrects itself with a follow-up row rather than erasing anything. For deleted duties this log is the only remaining evidence, on purpose.'],
      ]},
      { h: 'RULESET', qa: [
        ['How are FTL rules layered?',
         'Regulation values (SHT-FTL) are read-only; the company layer may only move in the safe direction — minimum rests can only rise, maximum limits can only fall. Changes are audit-logged and apply forward only: every duty stores the ruleset snapshot it was created under.'],
      ]},
    ],
  },
  {
    id: 'stats', icon: '▦', title: 'STATISTICS',
    intro: 'Fleet and crew totals computed from archived flights.',
    sections: [
      { h: 'DATA', qa: [
        ['What is counted, and from where?',
         'Total flights, flight hours (airborne), block hours, landings and night landings — all summed from archived_flights, filterable by aircraft and by crew member. Nothing here is entered by hand; if a figure looks wrong, the fix belongs in the archive (admin edit with reason), and statistics follow.'],
      ]},
    ],
  },
  {
    id: 'stations', icon: '◉', title: 'RAAQ',
    intro: 'Route and Aerodrome Qualification: the aerodrome database, categories, risk surveys and what the pilot sees.',
    sections: [
      { h: 'AERODROME DATABASE', qa: [
        ['Where does the aerodrome list come from?',
         'From the company\'s route & aerodrome qualification list, maintained here. Each aerodrome carries its ICAO, name and CATEGORY (A / B / C). ADD AIRPORT creates the row in the company context; names are stored uppercase.'],
        ['What do categories A, B and C mean?',
         'A: standard aerodrome — self-briefing suffices. B: additional briefing items apply (RAAQ items 1-4). C: aerodrome posing specific problems for approach, landing or take-off — item 5 also applies and special training completed by the aircrew is required. The category drives the pilot-side auto-check, so keep it correct; an aerodrome without a category disables the automatic briefing record on purpose.'],
      ]},
      { h: 'SURVEYED vs NOT SURVEYED — the key difference', qa: [
        ['What does a completed risk survey give the pilot?',
         'The RISK ASSESSMENT MATRIX here produces a score, a risk level (LOW/MEDIUM/HIGH/EXTREME), an ops-approval requirement and three narrative PPS briefing sections (traffic/ATC, meteorology, security/handling). The pilot\'s RAAQ card shows all of it, read-only, with the assessor and date.'],
        ['And when there is NO survey and no remarks?',
         'The pilot\'s card embeds the FOP-FRM-02 SPECIAL ITEMS instead: items 1-4 for CAT A/B, items 1-5 for CAT C. When the pilot confirms "reviewed", the items are AUTO-CHECKED and recorded — which items, which category, by whom, when (rass_data.raaq + the RASS_REVIEWED audit event). That is the paper qualification form captured digitally. If the category is not set, the card shows CATEGORY NOT SET — CONTACT DISPATCH and refuses to auto-check.'],
      ]},
      { h: 'TROUBLESHOOTING', qa: [
        ['Pilot reports "CATEGORY NOT SET" for an aerodrome.',
         'Open RAAQ here, find the aerodrome, set its category (or add the airport if missing). The pilot\'s auto-check works on the next open.'],
        ['A new destination is not in the list at all.',
         'ADD AIRPORT with ICAO + name + category. The risk survey can follow later; until then the pilot gets the special-items briefing path.'],
      ]},
    ],
  },
  {
    id: 'logs', icon: '≡', title: 'FLTS LOGS & TIMES',
    intro: 'The flight-level audit timeline.',
    sections: [
      { h: 'DATA', qa: [
        ['What is written here?',
         'Every significant action on a flight, stamped with the moment it actually happened: module completions, crew assignment (incl. CRZ CPT and TRE/TRI), field changes, RAAQ reviews with their auto-checked items, direct-to set/cleared, divert decisions, RVSM exceedances, sync events, archive gates. Offline events queue on the device and post later with their ORIGINAL timestamps, so the timeline stays truthful.'],
        ['Can log rows be edited or deleted?',
         'No. The table is append-only by policy. That is what makes it evidence.'],
      ]},
    ],
  },
  {
    id: 'reports', icon: 'R', title: 'EDIT REPORTS',
    intro: 'Post-archive corrections with full audit visibility.',
    sections: [
      { h: 'USAGE', qa: [
        ['When do I use EDIT REPORTS?',
         'When an archived flight contains a wrong entry (a mistyped time, a wrong ATIS letter). Correct the value WITH A REASON: the report PDF regenerates showing old value struck through, new in green, plus the AMENDED appendix listing every change in full. The FTL duty refreshes automatically from corrected times.'],
        ['What can never be corrected here?',
         'Nothing is ever silently replaced: the original stays visible under strike-through, first-seen timestamps stay fixed, and the amendment itself is part of the permanent record.'],
      ]},
    ],
  },
  {
    id: 'trouble', icon: '⚠', title: 'TROUBLESHOOTING (GENERAL)',
    intro: 'Cross-module symptoms and where to look first.',
    sections: [
      { h: 'COMMON SYMPTOMS', qa: [
        ['A pilot\'s iPad shows data the panel does not (or vice versa).',
         'The device is offline-first: entries live on the iPad immediately and mirror to the server when connected. Check the device\'s connectivity; queues drain automatically. The panel never edits pilot module data directly.'],
        ['An FTL duty still shows planned times after the flight.',
         'Was the flight archived? Step 14 of archiving writes actual times into the matching duty. If the duty shows a REVIEW badge instead, the match was ambiguous — resolve it via EDIT. If the flight was never flown in the app, enter the duty times manually (past date ⇒ actual).'],
        ['Numbers differ between two screens.',
         'Find the single source: block times → archived NavLog; fuel at takeoff → Fuel module; report content → the server PDF; aerodrome risk → RAAQ table. The screen that is not the source follows it — correct at the source, with a reason where one is demanded.'],
        ['Something was deleted but traces remain / something refuses to delete.',
         'By design: audit tables refuse deletion, and legitimate deletions require a reason and leave a tombstone in the edit log. A refusal is the database enforcing retention, not a bug.'],
      ]},
    ],
  },
];

const C = {
  accent: 'var(--accent)', t1: 'var(--t1)', t2: 'var(--t2)', t3: 'var(--t3)',
  border: 'var(--bg3)', bg2: 'var(--bg2)', bg3: 'var(--bg3)',
};

export default function AdminHelp() {
  const [chapter, setChapter] = useState('overview');
  const [search, setSearch] = useState('');

  const active = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CHAPTERS.find(c => c.id === chapter);
    // Arama: tum chapter'larda soru+cevap metninde gecenler tek listede
    const hits = [];
    CHAPTERS.forEach(c => c.sections.forEach(sec => sec.qa.forEach(([qq, aa]) => {
      if (qq.toLowerCase().includes(q) || aa.toLowerCase().includes(q)) {
        hits.push({ chapter: c.title, h: sec.h, qa: [qq, aa] });
      }
    })));
    return { search: true, hits };
  }, [chapter, search]);

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Chapter listesi */}
      <div style={{ width: 230, borderRight: `1px solid ${C.border}`, overflowY: 'auto', padding: '10px 8px', flexShrink: 0 }}>
        <input placeholder="Search help..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', background: C.bg2, border: `1px solid ${C.border}`,
                   color: C.t1, fontSize: 11, padding: '8px 10px', borderRadius: 6, fontFamily: 'var(--mono)', marginBottom: 10 }} />
        {CHAPTERS.map(c => (
          <div key={c.id} onClick={() => { setChapter(c.id); setSearch(''); }}
            style={{ padding: '9px 10px', margin: '2px 0', cursor: 'pointer', display: 'flex', gap: 9, alignItems: 'center',
                     borderRadius: 7, background: (!search && chapter === c.id) ? 'var(--accent-soft)' : 'transparent' }}>
            <span style={{ width: 16, textAlign: 'center', fontSize: 13, color: (!search && chapter === c.id) ? C.accent : C.t3 }}>{c.icon}</span>
            <span style={{ fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: 0.5, fontWeight: (!search && chapter === c.id) ? 700 : 500,
                           color: (!search && chapter === c.id) ? C.accent : C.t2 }}>{c.title}</span>
          </div>
        ))}
      </div>

      {/* Icerik */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 26px' }}>
        {active?.search ? (
          <>
            <div style={{ fontSize: 11, color: C.t3, fontFamily: 'var(--mono)', marginBottom: 14 }}>
              {active.hits.length} RESULT(S) FOR “{search.trim().toUpperCase()}”
            </div>
            {active.hits.map((h, i) => (
              <div key={i} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 9, color: C.t3, fontFamily: 'var(--mono)', letterSpacing: 1, marginBottom: 4 }}>
                  {h.chapter} · {h.h}
                </div>
                <QA q={h.qa[0]} a={h.qa[1]} />
              </div>
            ))}
          </>
        ) : active ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.accent, fontFamily: 'var(--mono)', letterSpacing: 1 }}>
              {active.icon} {active.title}
            </div>
            <div style={{ fontSize: 12, color: C.t2, margin: '6px 0 18px', lineHeight: 1.6, maxWidth: 860 }}>{active.intro}</div>
            {active.sections.map((sec, i) => (
              <div key={i} style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, fontFamily: 'var(--mono)', letterSpacing: 1.5,
                              borderBottom: `1px solid ${C.border}`, paddingBottom: 6, marginBottom: 12 }}>{sec.h}</div>
                {sec.qa.map(([q, a], j) => <QA key={j} q={q} a={a} />)}
              </div>
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}

function QA({ q, a }) {
  return (
    <div style={{ marginBottom: 14, maxWidth: 860 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.t1, marginBottom: 4 }}>{q}</div>
      <div style={{ fontSize: 11.5, color: C.t2, lineHeight: 1.7 }}>{a}</div>
    </div>
  );
}
