# How do I do this? videos

Every staff page has a **How do I do this?** button (`app/components/HelpButton.tsx`).
It lists the tasks for the page you are on. Each task shows a short video with
the same steps written underneath.

| What | Where |
| --- | --- |
| The written guides | `utils/help/sections/*.ts` |
| Which page gets which guides | each section's `paths` (longest match wins) |
| The videos | `public/help/<guide id>.mp4` and `.jpg` |
| Which guides have a video | `utils/help/videos.json` (generated) |
| How each video is acted out | `scripts/help-videos/scenarios/<guide id>.mjs` |

A guide with no video still works: the panel shows the written steps and says
the video is not recorded yet.

## Recording

Videos are not filmed by hand. A scenario lists the steps; for each step the
recorder speaks the line in the Australian voice, shows it as a caption, and
moves a visible cursor through the clicks. When a screen changes, fix the
scenario and record it again.

```bash
cd scripts/help-videos
npm install                 # once
npx playwright install chromium   # once

# in another terminal: the CRM running locally against the DEMO database
HELP_DEMO_DATA=1 node record.mjs contacts-add-new
HELP_DEMO_DATA=1 node record.mjs --all
```

Needs `ffmpeg` on the path and Python with `edge-tts` (`pip install edge-tts`).

### Demo data only

A video is a permanent picture of whatever was on screen, and a scenario clicks
real buttons (some send email). So:

- The recorder refuses any address that is not this machine.
- It refuses to run unless `HELP_DEMO_DATA=1` is set. Set it only when the local
  CRM is pointed at the demo database with made-up people in it.
- The one exception is a scenario marked `noClientData: true`: it only reads a
  page that shows no client records (for example Lender Policy).

## Writing a scenario

```js
export default {
  start: "/contacts",
  steps: [
    { say: "Click New contact.", do: async (h) => h.click('text="New contact"') },
    { say: "Type their name.", do: async (h) => h.type('input[name="name"]', "Alex Demo") },
  ],
};
```

`h.click`, `h.type`, `h.select`, `h.point` (ring a control without clicking),
`h.scroll`, `h.goto`, `h.pause`, and `h.page` for anything else. Keep each
line to one sentence or two; a step stays on screen for as long as its line
takes to say.
