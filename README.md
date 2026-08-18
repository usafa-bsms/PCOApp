# PCOApp

Preferred Course Offering scheduler for the USAFA Mathematical Sciences Dept (BSMS).

A deterministic, client-side constraint solver produces a semester schedule (instructor → course section → period) from roster, course, qualification, preference, lock, and constraint inputs, then persists the result to Supabase for faculty to view.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full plan and data model.

## Setup
```bash
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

## Commands
```bash
npm run dev      # Vite dev server
npm run build    # tsc -b && vite build (type-checks)
npm test         # vitest (solver unit tests)
npm run lint     # eslint
```