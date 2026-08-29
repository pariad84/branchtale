# branchtale

Signal Lost -- a branching sci-fi visual novel, moved here from
[mini-framework](https://github.com/pariad84/mini-framework)'s `signal-lost/` example into its
own repo.

It's built on `fn.js` (the seven-essentials CRUD framework core) and `fn.util.js` (shared
CRUD/UI-wiring helpers), both vendored here as-is from mini-framework, plus this app's own
`layout.js` and `app.js`. Open `index.html` to play.

Player + Scene + Ending, a story that -- unlike a typical CRUD resource -- is meant to be edited
by the person using the app. Scene is the entire story (seeded with a 15-row default: 10 beats +
5 endings), each referencing the next by its own stable `key` field rather than an auto-increment
id, since the story graph can be reader-written and needs readable targets for `choice.next`. The
Editor screen is the standard list + popup/form/save-btn CRUD pattern, plus Download/Upload
buttons that serialize the whole story to/from one portable JSON array. Each scene's
`title`/`text`/`endingType`/`choices` are edited as raw JSON in the form, and storing a field as
a `{lang: value}` object instead of a plain string turns the same textbox into a multi-language
author -- the story screen's language switcher only ever offers languages a scene actually has.
A "Check for Loops" button runs a DFS over every language's choices and reports any cycles,
purely informational. A scene with an empty `choices` array (in the active language) is an
ending; arriving at one logs it into Ending the first time only, so replaying the story keeps
growing a real resource worth paging through. Player is CRUD'd through the usual
`popup`/`form`/`save-btn` only for its name (the Rename button).
