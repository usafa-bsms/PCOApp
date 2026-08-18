# Outstanding Questions / Tasks

Feedback loop: I append questions here; you answer them (edit this file or reply in chat) and drop inputs in the repo; I update the file accordingly. Keep each item in a single numbered item with a clear status.

---

## Questions awaiting your input

### Q1. Scheduling guidance PDF
> Upload the PDF of this semester's scheduling guidance when you can. Drop it in the repo root (e.g. `docs/scheduling-guidance.pdf`) and I'll encode it as constraints. (From msg #6.)

### Q2. CSV input drop
> You'll share inputs as `.csv` files. When they're in the folder, I'll create a "Test" semester in the DB and load them. Flag me when ready. (From msg #8/#9.)

### Q3. Export formats (BONUS)
> You want to download/export the PCO/report in several formats (offline save + historical view). Which formats? (e.g. CSV, PDF, Excel, JSON). This drives the flexible output module. (From BONUS.)

### Q4. Consecutive-period semantics
> "Consecutive periods" = adjacent WITHOUT the lunch cut at {M4,M5}. I've implemented M4–M5 as a lunch break (also T4–T5). Confirm T4–T5 is also a break (same as M).

### Q5. Section numbering for locks
> ADs force by *section*. Is a course's section list a fixed count (`course_list.sections`) that locks reference by number (1,2,3…), or can ADs create sections ad hoc?

---

## Decided (for reference)

- **Course load**: per-person input; default `3`. It's a **target**, reduced manually for extra dept responsibilities (pilot, double-prep, etc.). No automatic reductions. Added role **`new_instructor`** (default load `4`). (Reflects msg #1.)
- **Locks**: ADs force any portion of `course → period → room → instructor` **by section**. Not all parts required (room often left). Solver keeps locked parts, fills the rest. (Reflects msg #2.)
- **Course director**: independent of teaching sections; does NOT itself consume a teaching period or count toward load. CD may still separately teach (e.g. Math 243/253). (Reflects msg #3.)
- **Qualification levels**: 3 levels (`can_teach`, `has_taught`, `can_direct`). Modeled as a grid: rows=instructors, cols=courses, cell=level. (Reflects msg #4.)
- **Preferences**: weighted points (`rank`, lower = stronger) + **hard exclusions**. ADs may override/remove a hard exclusion. (Reflects msg #5.)
- **Constraints (soft, from guidance)**: spread sections; morning/afternoon minimums; M/T balance; prefer **consecutive periods**; prefer **all-M or all-T** (single day); **no forced break** pattern like M1,M3,M5; note that **M4–M5 is a lunch break** (implemented, also T4–T5). (Reflects msg #6.)
- **Active semester**: one active at a time (e.g. Fall 2026 executing, Spring 2027 planning). Faculty can view **historical** runs; export/offline save supported. (Reflects msg #7.)
- **Room capacity**: a room characteristic (`23` for all regular rooms currently). Target = ~**110% of expected enrollment** seats (avg section size × #sections) for scheduling flexibility. (Reflects msg #8.)
- **Output**: PCO report must be downloadable in several formats (CSV/PDF/Excel/JSON pending). (Reflects BONUS.)
- **Roles**: `faculty`, `new_instructor`, `academic_director`, `lead_admin` + free-text `label` (non-auth context).