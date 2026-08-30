# branchtale

A platform for branching visual novels, not just one story. Started from
[mini-framework](https://github.com/pariad84/mini-framework)'s `signal-lost/` example, which is
now its first seeded story rather than the whole app.

It's built on `fn.js` (the seven-essentials CRUD framework core) and `fn.util.js` (shared
CRUD/UI-wiring helpers), both vendored here as-is from mini-framework, plus this app's own
`layout.js` and `app.js`. `fn.data.*` talks to a small local server (`server/`) instead of
`localStorage` now, so every reader hits the same shared JSON store -- see "Running it" below.

Player + Story + Scene + Ending. The Library screen lists every Story a reader has added --
"+ New Story" creates one (title/author/description) and drops you straight into its Editor with
a blank `start` scene to write. Scene is a story's entire graph, each row one beat
(key/title/text/choices) scoped to its Story via `storyId`, since a scene's own `key` only needs
to be unique *within* a story -- every story is free to have its own `start`. Scenes reference
each other by that `key` field rather than an auto-increment id, since the graph can be
reader-written and needs stable targets for `choice.next`. The Editor screen (per story) is the
standard list + popup/form/save-btn CRUD pattern, plus Download/Upload buttons that serialize one
story's scenes to/from a portable JSON file. Scenes are written through a structured `scene-form`
(language tabs, a label + next-scene input per choice) rather than raw JSON -- storing a field as
a `{lang: value}` object under the hood is what turns the same scene into a multi-language author,
the reading screen's language switcher only ever offering languages a scene actually has. A
"Check for Loops" button runs a DFS over every language's choices (within the current story) and
reports any cycles, purely informational. A scene with an empty `choices` array (in the active
language) is an ending; arriving at one logs it into that story's Ending list the first time only,
so replaying a story keeps growing a real resource worth paging through. Player is CRUD'd through
the usual `popup`/`form`/`save-btn` only for its name (the Rename button); Story through it for
everything, from the Library. Which story/scene/tab is showing is a real route
(`location.hash`, `fn.util.route`) rather than module state, so the browser back button steps
back through choices/tabs/stories instead of leaving the app.

## Running it

```
npm install
npm start
```

Then open http://localhost:3000 -- **not** `index.html` directly; `fn.data.*` now talks to the
server over HTTP, so opening the file via `file://` won't work. By default the server keeps one
shared JSON file (`server/db.json`, git-ignored, created on first run); every browser pointed at
it reads and writes through it, so stories one person adds now show up for everyone hitting the
same server -- this is deliberately local-only for now (no deploy, no accounts: anyone reaching
the server can read or write anything, by design, see "Known limitations" below), not yet a
public site.

To use Postgres instead of the JSON file, copy `.env.example` to `.env` and set `DATABASE_URL`
(`postgres://user:password@host:port/dbname`) -- `server/db.js` picks it up automatically (via
`dotenv`) and creates its one table (`data_rows`) on first run if it doesn't exist yet. Never
commit `.env` or a connection string into a file that gets pushed anywhere (it's already
git-ignored). Omit `DATABASE_URL` entirely to keep using `server/db.json`, no database needed.

## Known limitations

- **One shared JSON file, not a database.** Fine for a single local server with no real concurrent
  traffic; a genuine race (two saves at the same instant) can drop one of them. Good enough to
  develop against, not to deploy publicly as-is.
- **No accounts.** Anyone who can reach the server can create, edit, or delete any story --
  intentional for now (see the project's own discussion of this tradeoff), revisit if this ever
  goes further than local use.
- **Synchronous requests.** `fn.data.*` uses synchronous XHR, not `fetch`/Promises, so that
  `list`/`form`/`scene-form` and everything built on them needed zero changes to keep working
  against a real server (mini-framework's own README documents this as the one condition that
  keeps a storage-backend swap "free" -- see its "Known limitation: swapping to a real network
  backend isn't free"). It blocks the tab on every read/write, acceptable for a local server on
  the same machine, not for a real network with latency.
