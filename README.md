# branchtale

A platform for branching visual novels, not just one story. Started from
[mini-framework](https://github.com/pariad84/mini-framework)'s `signal-lost/` example, which is
now its first seeded story rather than the whole app.

It's built on `fn.js` (the seven-essentials CRUD framework core) and `fn.util.js` (shared
CRUD/UI-wiring helpers), both vendored here as-is from mini-framework, plus this app's own
`layout.js` and `app.js`. Open `index.html` to browse the Library.

Player + Story + Scene + Ending. The Library screen lists every Story a reader has added --
"+ New Story" creates one (title/author/description) and drops you straight into its Editor with
a blank `start` scene to write. Scene is a story's entire graph, each row one beat
(key/title/text/choices) scoped to its Story via `storyId`, since a scene's own `key` only needs
to be unique *within* a story -- every story is free to have its own `start`. Scenes reference
each other by that `key` field rather than an auto-increment id, since the graph can be
reader-written and needs stable targets for `choice.next`. The Editor screen (per story) is the
standard list + popup/form/save-btn CRUD pattern, plus Download/Upload buttons that serialize one
story's scenes to/from a portable JSON file. Each scene's `title`/`text`/`endingType`/`choices`
are edited as raw JSON in the form, and storing a field as a `{lang: value}` object instead of a
plain string turns the same textbox into a multi-language author -- the reading screen's language
switcher only ever offers languages a scene actually has. A "Check for Loops" button runs a DFS
over every language's choices (within the current story) and reports any cycles, purely
informational. A scene with an empty `choices` array (in the active language) is an ending;
arriving at one logs it into that story's Ending list the first time only, so replaying a story
keeps growing a real resource worth paging through. Player is CRUD'd through the usual
`popup`/`form`/`save-btn` only for its name (the Rename button); Story through it for everything,
from the Library.

Everything still lives in browser `localStorage`, so right now each reader only sees the stories
*they* added -- there's no shared backend yet for multiple people to publish to the same library.
That's next.
