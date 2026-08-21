# Outstanding Questions / Tasks

Feedback loop: I append questions here; you answer them (edit this file or reply
in chat) and drop inputs in the repo; I update the file accordingly. Keep each
item in a single numbered item with a clear status.

---

## Resolved this round (Aug-2026 input drop)

### Q1. Scheduling guidance PDF — DONE
`Inputs/MFR Fall 2026 Preferred Course Offering Guidance.pdf` read and encoded.
Key rules captured (see ARCHITECTURE "Guidance"):
- Offer all 12 times (M1–T6); underutilized early-morning/late-afternoon hurt.
- 10+ sections ➜ ≥6 times, evenly M/T, more mornings, must include M1+T1; M1/M2/T1/T2 ≥ others; ≥25% of sections in 5th/6th periods.
- Multiple sections of a course spread M/T & through the day UNLESS one instructor.
- Single-period course ≥250 enrollment ➜ all 12 times.
- **Double-period** courses start only at 1st/3rd/5th period.
- Independent Study (499) unscheduled, Room NONE, scheduling code NSH; T-Day Dean's Time 1230–1323.
- Special Topics (495) single-period 3.0.
- Offered seats ≈ enrollment × 1.10.
- Avoid limiting a course to one time. Single-offering course must NOT be at 1st/5th/6th.
- Two-section course: avoid back-to-back within a double block (M1+M2 bad; M2+M3 OK).
- Cancellation: cancel if enrollment ≤10; <6 auto-cancel (499 exempt).
New constraint types added: `single_offering_peak`, `two_section_same_block`.
Double-period (start at 1st/3rd/5th, room held across both) is now encoded in the
solver (see Q6 follow-up). Remaining guidance rules (≥250 spread, 25%-afternoon,
M1/M2/T1/T2-density, distribution) are noted but NOT yet wired into the evaluator.

### Q2. Input drop — PROCESSED (plan changed)
The CSV idea was replaced by `Inputs/DFMS_PCO_F26_V7.xlsx` — a **solved Fall 2026 PCO**
(not raw inputs). Parsed into `src/scheduler/__tests__/fixtures/fall2026.json`
(16 courses, 116 sections, 41 instructors, 15 rooms, 12 periods, ground-truth
assignments). Regen script: `temp/parse_pco.py`. No live Supabase "Test" semester
was created; it's used as a local, deterministic test case instead.
**No qualification grid or preferences exist** — quals synthesized per your rule:
- Anyone teaching a T-day with exactly 4 sections ➜ qualified only for
  Data Sci 220 + Math 141.
- Everyone else ➜ qualified for all courses.
- Course directors ➜ qualified to direct all courses (CD = most-section lead).

### Q3. Export formats — DONE (ship with fueling)
Primary report views now export from any shown run (latest or saved) on the
Schedule page:
1. **CSV · by course** — sections grouped by course → periods/instructors/rooms.
2. **CSV · by teacher** — sections grouped by instructor.
3. **PCO xlsx** — the special layout from `Inputs/DFMS_PCO_F26_V7.xlsx`
   (Dept/Course/Section Cap/Class-Section letter/Associated Class/Room/Select
   Pattern/Start Time/M-or-T/Instructor/Exam Type).
Implemented in `src/lib/export.ts` (pure, tested) + a lazy-loaded
`src/lib/export-ui.tsx` wrapper that code-splits the SheetJS runtime (286KB chunk,
loaded on first export click). Letters (`M1A`, `T3B`…) distinguish concurrent
sections per period; double-period flag drives the `Select Pattern` and NONE
rooms render as `NONE`.

### Q4. Consecutive-period semantics — CONFIRMED (and code fixed)
Yes: **T4–T5 is also a lunch break** (same as M4–M5). NOTE: `src/lib/periods.ts`
was originally encoding the break between M3/M4 (treating M4/M5 as consecutive) —
a bug vs. the confirmed rule and the reference start times (T4=1030, T5=1330, 3h
apart). Corrected so M4/M5 and T4/T5 are NOT consecutive; the valid double-period
blocks are (1,2), (3,4), (5,6).

### Q5. Section numbering / sizing — ANSWERED
- Section list is a **fixed count** (decided from enrollment vs §-cap ≤23; shrink caps manually).
- **Locks bind to the lowest-indexed sections first.**
- If more sections are locked than needed, create them and emit a warning that
  capacity is too high / §-cap should be reduced.
- Course section counts are **manual input** (no auto-sizing from enrollment; the
  10%-seats rule is a planning heuristic applied by hand).

---

## Open items (next)
### Q6. Double-period and Independent Study modeling — ROOMS UI DONE, double-period DONE
The xlsx has one double-period course (Data Sci 421, occupies 2 periods) and
courses with Room `NONE` (Math 420, OpsRsch 305 = independent-study style).
ANSWER: designate a course as double-period (in general the periods get locked and
won't need scheduling). If it gets a room that isn't NONE it must hold that room
across both periods. NONE rooms are a manual AD lock (for courses that don't meet
in a classroom) and the algorithm never assigns them.
Progress: the **Rooms tab** (CRUD: name/capacity/assignable) ships, so ADs mark a
non-assignable "NONE"-style placeholder the solver never places. The
**double-period** course modeling (start-only-at-1st/3rd/5th, hold a real room
across both periods) is **DONE** — see the Q6 follow-up below.

### Q7. Search-based solver upgrade — DONE
The greedy scaffold reliably places all 116 sections deterministically, but did
NOT optimize the soft guidance targets. Delivering it was deferred behind the
DB/history/UI work, per the answer — but it got built anyway as `cspSolve`
(branch-and-bound CP, MRV+LCV) wired into `solve()`. Measured on the fixture with
default penalties: score ~4542/98 violations (greedy) → ~252/21 (CP), ~0.9–1.1s
per solve. Regression-guarded by `src/scheduler/__tests__/bench.test.ts` (CP
beats greedy, deterministic, 116 sections). The AD can further tune soft-target
penalties in the Constraints tab.

### Q6 follow-up: Double-period solver modeling — DONE
the **solver** now schedules double-period courses end-to-end:
- A double-period course (mark it in the Courses tab via `is_double_period`) is
  placed as a **2-slot block** starting only at the 1st/3rd/5th slot (M1/M3/M5 or
  T1/T3/T5), occupying both consecutive periods of the block.
- **Lunch-break adjacency corrected** in `src/lib/periods.ts`: the break is
  between M4/M5 and T4/T5 (matching the reference start times: T4=1030, T5=1330),
  NOT between M3/M4 as previously encoded. This makes the valid double-period
  blocks exactly (1,2), (3,4), (5,6). Existing solver/fixture tests all still pass.
- The room pass (`assignRooms`) holds **one real room across BOTH periods** of a
  block, and a block's room is occupied (and thus blocked from other sections)
  in both its periods.
- Implemented in both `cspSolve` (search) and the greedy `solveCore` fallback;
  `buildSolveInput` passes `is_double_period` through. NONE rooms remain a manual
  AD lock (as designed); the solver only places real rooms.
- Tests: `src/scheduler/__tests__/double-period.test.ts` (5). Still todo: remaining
  guidance constraints (≥250-spread, ≥25%-afternoon, M1/M2/T1/T2 density,
  distribution) are not yet evaluated.

### Q8. Confirm synthetic quals for real runs — DONE
The Fall 2026 quals are synthetic placeholders. When real letter-of-X (and
preferences) exist, the fixture and solver should use them.
ANSWER: make this something I can edit in the app when I'm testing it. I'll edit
people's qualifications and rerun the algorithm to test it.
Progress: the **Qualifications** grid is now editable in the app, so quals can be
adjusted per test run without code changes.

---

## Reference decisions
- **Course load = per-person target** (default 3; `new_instructor` 4), reduced
  manually. Not a hard cap. The CP solver now treats it as a soft `load_target`
  constraint (penalty 20, in the seeded defaults) so no one exceeds their load
  target — this fixed the off-by-one where everyone got load+1 sections.
- Locks are HARD; may pin any subset of course→section→period→room→instructor; solver fills the rest.
- Course director = course-level role; does not consume a period/load by itself (e.g. Math 243/253).
- Qualification levels: `can_teach | has_taught | can_direct`.
- Preferences = weighted points (lower `rank` stronger) + hard exclusions (ADs may remove).
- Rooms are deferred to a final pass; keep instructor in same room unless a schedule break.
- One active semester at a time; historical runs viewable/exportable.
- Roles: `faculty`, `new_instructor`, `academic_director`, `lead_admin` + free-text `label` (non-auth).