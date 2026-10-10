# Page overviews: writing and recording brief

Every help section gets an **overview**: a tour of the page for someone who has
never seen it. It answers "what is this page for, and what am I looking at?".
The task guides already answer "how do I do X"; do not repeat them.

Read `RECORDING-BRIEF.md` first. All of its rules still apply (demo data only,
no outside services, check frames before moving on).

## The written overview

Add an `overview` to each section in your sections file, before `guides`:

```ts
overview: {
  id: "overview-contacts",            // "overview-" + the section name in kebab-case
  title: "Overview of Contacts",      // "Overview of <sidebar label>"
  summary: "What the Contacts page is for and what each part of it does.",
  steps: [
    { title: "The counters at the top", detail: "Hot, warm and matched totals for the people loaded." },
    ...
  ],
},
```

- `summary`: one or two sentences. What the page is for, who uses it, and when.
- `steps`: 4 to 7 entries, one per part of the page, in the order the eye meets
  them (top to bottom, left to right). `title` names the part using the words
  on screen. `detail` says what it shows or what it is for, in one sentence.
  These are shown as bullets, not numbered steps.
- Where the page feeds or is fed by another page, say so once ("Leads you
  promote here appear on Opportunities").
- Write from the page as it renders in the demo, not from memory of the code.
  Plain words. No developer terms, no table or file names.
- Sections with detail pages (a contact, an opportunity, a lender): cover the
  list page, then one entry on what opening an item shows.

## The video

`scenarios/overview-<name>.mjs`, 35 to 60 seconds, about 6 to 9 spoken lines.

- Open with one line saying what the page is for.
- Then walk the page in the same order as the written entries, using `h.point`
  to ring each part while the line about it is spoken. Scroll when needed.
- This is a tour. Do not create, edit, send or delete anything. Opening a tab,
  a filter or one item to show what is inside is fine. Leave the data as found.
- End with one line pointing to the task guides, for example: "For step by
  step help with a task here, pick it from the list under this overview."
- Reuse your existing seed, mocks and helpers. Re-apply your seed before
  recording so the page is in its starting state.
- Record with `--no-manifest`, as before, and check a frame sheet for each.

## Report back

A table: overview id | recorded/skipped | seconds | note. Plus anything on a
page that contradicts an existing task guide, and any new CRM fault seen.
