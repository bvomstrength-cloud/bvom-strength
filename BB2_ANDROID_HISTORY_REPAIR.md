# Android History and Add Set repair — PR #73 stays HOLD

Baseline: `58680e1a3032a5e21a94dec23399a0f1c4da760d`.
The actual Android backup was not attached. The regression fixture is explicitly
synthetic and matches the supplied 16-legacy-row / 35-event / credited / closed
structure; its provenance is documented beside it.

## Finish → persistence → normal History

The fixed Finish control uses the BB2 activity guard and normal note dialog.
`bvomBb2End` plans and commits Finish, credit and note together to `state.bb2`,
then durably saves the existing BVOM document and renders the normal interface.
BB2's ledger is the canonical record. It intentionally does not append a second
legacy `data.history` entry, which would duplicate the journal and expose BB2 to
legacy whole-row cloud writers. Zero BB2 entries in that array alone therefore
does not prove a failed Finish; the rendered normal History must project BB2.

The renderer previously appended BB2 as a separate section **after every legacy
workout**, instead of adding it to the same chronological list. With 16 older
legacy rows, the recent BB2 completion was absent from the normal list and below
the initial mobile viewport. Prior tests only checked for text somewhere in the
History DOM, allowing this defect to pass. The new mobile regression was RED:
16 normal rows rather than 17, with the recent BB2 card outside that list.

The repair inserts validated current/archived BB2 cards as ordinary History
siblings, orders the shared list by recorded time, and preserves legacy indices
and canonical BB2 identities for edit/correction actions. Rendering writes no
records, credits or progression. It keeps `data.history` at 16 in this fixture;
the view correctly contains 17 workouts. Extra working sets and corrected loads
contribute to displayed volume; unestimated bodyweight volume remains unknown.
A failed module load or invalid replay now shows a visible error rather than
silently dropping BB2. Reload can retry without changing saved data.

The existing last-workout query also read only legacy History, producing a false
layoff overlay that blocked controls despite a recent BB2 completion. It now
uses the same validated read-only projection. While it loads, BVOM does not infer
a layoff from stale legacy data. Legacy-only programme behaviour is unchanged.
The projection cache is memory-only, bounded to one full journal fingerprint and
module identity; edits, corrections, archives and owner changes invalidate it.

## Add Set

The button and its handlers previously required a prescribed set before allowing
an extra. That hid the control at workout Start and differed from BB1. The mobile
baseline reproduced the missing button without force-clicking or calling a
progression function. The control is now visible from Start and logs the existing
EXTRA_SET_RECORDED event with actual load/reps and `prescribed:false`.

The frozen engine/catalogue and approved 42 core sets are unchanged. Extra indices
remain separate, unique and capped at 30 per exercise. Prescribed-set completion
and progression still use prescribed work only. Extra-only sessions can use the
normal incomplete Finish/recovery path, retaining their records without a credit
or progression. Extra sets lock working plans and start the normal rest timer;
CANCEL remains intact.

## Proof required before handing out a new test ZIP

The new mobile persistent-browser test checks the synthetic backup's first normal
History row, unchanged journal, no false layoff overlay, Add Set before prescribed
work, extra-only reload/incomplete saving, actual volume and History, minimum
minus one prescribed sets plus an extra staying incomplete, qualifying Finish
with a note, duplicate prevention, export/file restore, browser close/reopen and
visible/recoverable History-load failure. All subsequent training writes use
normal application controls.

The isolated authenticated browser suite additionally projects the 35-event
fixture on two real Auth devices, logs a first-use extra and normal Finish, and
compares the actual revisioned cloud row and receiving device without adding a
legacy History copy. Existing stale-device/CAS/conflict and other-programme tests
remain in place. Full regression/browser/packaging and complete journeys run in
CI; no production accounts, credentials, data or database changes are involved.

Local mobile tests and focused regressions pass. CI links and the final candidate
SHA belong in the PR verification report. A new ZIP is provided only after the
two reported failures pass the mobile and authenticated checks. PR stays draft,
unmerged and HOLD; Android owner acceptance is still required.
