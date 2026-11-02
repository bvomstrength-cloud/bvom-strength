# Synthetic counterpart of the 2 November 2026 Android backup

The owner's backup was described but not attached. This is **not recovered user
data**. It reproduces the authorised structural case: 16 synthetic legacy
`data.history` entries, no materialised BB2 History entries, 35 valid BB2 events,
a completed/credited session and `activeSessionId: null`.

The BB2 setup, Start, prescribed sets and Finish were generated through the
actual 58680e1 app handlers with known 60 kg loads and 2.5 kg increments.
Twenty-one valid NOTE_EDITED revisions pad the natural 14-event completion to
the reported 35-event structure. They all reference that synthetic session and
use the same clearly synthetic note. Legacy records are dated 1–16 October; BB2
Start/Finish are dated 2 November. This also reproduces the legacy-only layoff
coach overlooking recent BB2 activity. No genuine workout was invented to stand
in for the owner's missing record.

The mobile test fixes its platform clock to 2 November, imports this state, and
uses actual controls for new extra sets, completion, notes, export/restore and
persistent browser close/reopen. The authenticated test assigns the synthetic
opening to its newly created disposable local account and uses recent relative
timestamps, preserving event types/ordinals and the 16/35 shape.
