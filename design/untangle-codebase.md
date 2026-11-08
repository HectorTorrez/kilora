# Untangle UI decision log

Continuation of the untangle-codebase pass, 8 November 2026. The preceding API,
branch-access, contracts, data-client, comment and test work is in the five commits
ending at `c05f6e6`. This pass completes the remaining UI consolidation.

## Decisions and resolved links

- Share quote item fields, validation, defaults, conversion and cent-based totals.
  Counter quotes and order quotes previously implemented these independently.
  Keep the card and compact appearances, and keep each quote workflow's API actions
  separate. Order quote behavior now lives outside the order route. Stable field
  IDs preserve row identity when an item is removed. Preserve dirty quote edits
  when a background refresh or outcome change updates the saved quote.
- Share print document framing and cancellable QR generation. Quote and mechanic
  documents retain their existing sizing and content. A QR for an old URL cannot
  appear after navigation. Mechanic sheets still exclude costs and private notes;
  an unshared counter quote still has no public QR.
- Share immutable history item presentation. Owner record cards retain correction
  controls/details; workshop timelines retain author, blind-view and internal
  fields supplied by the server projection. Combining whole records would require
  unrelated permission and layout switches. Category lookup lives in `lib/history`
  so print documents do not depend on timeline UI.
- Give all form controls one field shell for labels, descriptions and errors.
  New-order reception uses the existing RHF/Zod fields and value rules. Vehicle
  creation and order reception are sibling forms, eliminating nested submissions.
  The order submit button explicitly targets the reception form. A preselected
  vehicle must exist in the active workshop before submission.
- Share the three list pages' loading/error/empty/content decision and the four
  search fields' icon, padding and wrapper. Share vehicle matching and phone
  validation. Existing list layouts and filter controls remain workflow-owned.
- Reset workshop content at the workshop boundary. A keyed provider discards local
  branch filters, selected vehicles, pagination and form defaults on a workshop
  change, preventing stale branch IDs from producing persistent authorization
  errors. Query cache entries remain keyed by workshop.
- Own quote outcome vocabulary in `lib/domain`. Badges, action controls and list
  filters use that vocabulary while keeping their existing visual styles.
- Move recommendation queries/actions out of team administration, and move due
  labels/urgency out of UI. Print and dashboard code now depend on data helpers,
  while membership administration no longer owns recommendation operations.
- Use the existing `lib/utils` class merger everywhere and remove the second `cn`
  dependency. Independent review compared 1,117 literal class strings and found
  identical output from the old and retained implementations.

Distinct workflow forms, record headers and page-specific tables remain separate;
sharing them would couple fields, permissions and layouts that change independently.
No database schema, endpoint or JSON contract changed in this pass.

## Verification

- Biome and TypeScript pass; production build passes; generated contract check passes.
- All Go tests pass against the seeded throwaway PostgreSQL database, including
  integration tests; `go vet` passes.
- Browser: create vehicle within new order, reject fractional odometer input,
  create order, save order quote (`2 × 12.35 = 24.70`), preserve unsaved quote edits
  while changing outcome, create counter quote and open its print view (`15.25`),
  render mechanic sheet and its QR, and switch workshops while editing a new order.
- Browser: workshop history preserves private fields for its own record and hides
  prices/private fields on all seven records from other workshops. Owner history
  displays costs and correction controls, including at a 390px viewport.
- Independent final reviews found no remaining substantive issues in this UI scope.

Verification used only the existing throwaway database from the previous pass.
Changes are local to `refactor/untangle-codebase`; nothing was pushed.
