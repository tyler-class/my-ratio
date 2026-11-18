# Ratio

Conventions for working on Ratio, shared with the owner's other self-hosted Cloudflare apps
(Nitrogen, Duffel, HSA Locker). Follow them when building or changing anything here.

## Workflow

- Start with `git pull --ff-only`.
- Every round of changes gets a new version number, without being asked: when you start making
  changes after the last push to `main`, bump the patch version in `package.json` first
  (1.0.1 → 1.0.2), so each push ships under its own version. Bump minor or major only when the
  owner asks. Mention the new version when you report or push.
- The MCP server reports its own version (`src/worker/mcp.ts` imports it from `package.json`,
  and `test/api/mcp.test.ts` checks they match): keep it that way.
- Verify with typecheck, lint, tests and `curl`; don't open a browser unless the owner asks.
- Push to `main` only when the owner says so. Deploying (`npm run deploy`) is a separate step,
  also only when asked.
- Files headed "Selfhost Kit: synced from tyler-class/selfhost-kit" (`src/*/kit/*`,
  `scripts/release.ts`, `.github/workflows/update.yml`) are overwritten by the kit's sync: make
  those changes in the kit, not here.

## Motion

- Sheets and dialogs "lift": the backdrop fades in and the panel rises into place (as `Sheet`
  does). Keep it that way for anything new that pops out. Respect `prefers-reduced-motion`.
- Collapsible sections: the whole header row toggles, the chevron turns 180° (down when closed, up
  when open), the content slides open and shut, and the open state is remembered on the device.
  Prefer this over a native `<details>`.
- Drag to reorder (the Insights board, `Panels.tsx`): grip handle, dashed slot where it will land,
  lifted copy under the pointer, no drop animation. On touch, start the drag after a short press so
  a swipe still scrolls. If saving the new order fails, put the old order back.

## Controls

- Never a native `<select>`: use `Select` from `components/ui.tsx`.
- Toggle sliders and segmented controls (`SlideToggle`, `.slide`) draw their keyboard focus ring
  **inside** the button (an inset ring), because the track scrolls sideways and clips anything
  outside.
- Removing something (deleting a bean, brew or roaster, finishing a bag) shows a toast with
  **Undo** where the change can be undone. Deletes wait out the toast before reaching the server
  (`removeLater` in `lib/queries.ts`), so Undo just cancels them.
- A filter shows the same choices and counts everywhere the same data appears.

## Layout and look

- No `border-top` divider on a row with rounded corners: it bends. Draw the divider as a separate
  straight line.
- Hover shades on icon buttons stay clear of dividing lines.
- Every page heading, section heading and Insights panel heading has an icon.
- Empty states: an icon in a soft circle, a headline and one line. An Insights panel with nothing
  to show is hidden or says so clearly; a card with nothing in it is hidden.
- Phones: text wraps rather than running off the edge (truncate only where a single line is the
  point); notes fields grow with the text instead of needing a manual resize. Secondary lines sit
  left-aligned on their own line.
- When a row of chips (tags) runs out of room, show what fits and fold the rest into a "+N" pill
  that shows them in a small pop-out (`TagRow` in `components/ui.tsx`).
- Any grain or texture goes on backgrounds only, never over text or components, and stays subtle.

## Behaviour

- After a save, everything on screen updates straight away (update or invalidate the query
  cache); nothing needs a reload.
- A thing is changed the same way wherever it appears: one shared sheet (`useSheets()`), as now.
- View choices (search, sort, filters, collapsed sections) are remembered on the device, and put in
  the address when it makes sense to bookmark or share the view (`useView` and `useFolded` in
  `lib/view.ts`).

## Wording

- Product nouns are capitalized ("Bags", "Roasters", "Journal"); group headings are plural.
- Ranges of times read "9:00 to 9:04 AM", not with a dash.
- Relative times are compact: "3h ago", "5m ago", "3d ago".

## Still to do

- `TagRow` shows the first three tags and folds the rest; it doesn't yet measure what fits.
- Delete buttons still ask for a second tap before the Undo toast; drop it if Undo proves enough.
- Insights rank rows (`.rk-l`) still truncate long names to one line.
