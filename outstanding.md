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
Remaining guidance rules (double-period start, ≥250 spread, 25%-afternoon, M1/M2/T1/T2-density, distribution) are noted but NOT yet wired into the evaluator — deferred with the solver upgrade (see Open items).

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

### Q3. Export formats — ANSWERED
Primary report views:
1. Sections by **course** (teacher sees their course → periods/instructors/rooms).
2. Sections by **teacher** (teacher finds their name → periods/courses/rooms).
3. The special **PCO xlsx** format from `Inputs/DFMS_PCO_F26_V7.xlsx`.
Not yet implemented; drives a future flexible output module.

### Q4. Consecutive-period semantics — CONFIRMED
Yes: **T4–T5 is also a lunch break** (same as M4–M5). `src/lib/periods.ts`
already treats neither as consecutive.

### Q5. Section numbering / sizing — ANSWERED
- Section list is a **fixed count** (decided from enrollment vs §-cap ≤23; shrink caps manually).
- **Locks bind to the lowest-indexed sections first.**
- If more sections are locked than needed, create them and emit a warning that
  capacity is too high / §-cap should be reduced.
- Course section counts are **manual input** (no auto-sizing from enrollment; the
  10%-seats rule is a planning heuristic applied by hand).

---

## Open items (next)

### Q6. Double-period and Independent Study modeling
The xlsx has one double-period course (Data Sci 421, occupies 2 periods) and
courses with Room `NONE` (Math 420, OpsRsch 305 = independent-study style). The
solver currently treats every section as single-period. Should double-period and
NONE-room courses get dedicated handling?

### Q7. Search-based solver upgrade
The greedy scaffold now reliably places all 116 sections deterministically with
rooms, but it does NOT optimize the soft guidance targets (spreading, morning
density, 25%-afternoon, minimizing penalty sum). Next step is a constraint-search
solver (penalty-based relaxation, deterministic) behind the same `SolveResult`
interface. Confirm you want that next, before the DB/history feature.

### Q8. Confirm synthetic quals for real runs
The Fall 2026 quals are synthetic placeholders. When a real letter-of-X (and
preferences) exist, the fixture and solver should use them. No action needed now.

---

## Reference decisions
- Course load = per-person target (default 3; `new_instructor` 4), reduced manually. Not a hard cap.
- Locks are HARD; may pin any subset of course→section→period→room→instructor; solver fills the rest.
- Course director = course-level role; does not consume a period/load by itself (e.g. Math 243/253).
- Qualification levels: `can_teach | has_taught | can_direct`.
- Preferences = weighted points (lower `rank` stronger) + hard exclusions (ADs may remove).
- Rooms are deferred to a final pass; keep instructor in same room unless a schedule break.
- One active semester at a time; historical runs viewable/exportable.
- Roles: `faculty`, `new_instructor`, `academic_director`, `lead_admin` + free-text `label` (non-auth).