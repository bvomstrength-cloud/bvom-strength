# BB2 shared-interface integration — draft PR #73 / HOLD

## Map inspected before implementation

| Existing BVOM path | Previous BB2 duplicate | Integration |
| --- | --- | --- |
| `renderHistory`, `histSummary`, `histDetails`, `toggleHistoryWorkout` | `bvomBb2RenderHistory` built separate native details/cards | Extract the existing card into `bvomHistoryWorkoutCard`; both render paths call it. BB2 supplies a read-only view of ledger sets. |
| `bvomShareWorkoutText`, `shareHistoryWorkout`, native share / clipboard / copy modal | No BB2 route | Resolve stable ledger record references in the existing share function; use the existing formatter and fallbacks. |
| `editHistoryNote`, `bvomSessionNoteModal` | Finish-only BB2 notes | Same action and note dialog; commit NOTE_EDITED through the ledger. |
| `deleteHistoryWorkout`, `bvomChoiceModal` | Separate REMOVE WORKOUT / SESSION_VOIDED button | Same History-only delete workflow. Append HISTORY_HIDDEN, preserving original events, progression and credits. Existing audited session void remains a low-level correction operation, not ordinary Delete. |
| BB1 set buttons / set rows | BB2 independently emitted equivalent set markup | Both call `bvomWorkoutExerciseHeader` and `bvomWorkoutSetMarkup` for prescribed/extra sets; keep data-source callbacks separate. Share ADD EXTRA SET terminology, Edit Weight, fixed Finish, note/saved dialogs and timer. |
| Existing modal styling and bodyweight entry helpers | Inline correction forms on every History set | Normal History displays only grouped set summaries. EDIT SETS opens the existing modal shell; audited correction/credit-consent rules remain unchanged. |

BB2-only credit, recovery and block information remains programme information inside the shared presentation; it does not replace normal workout actions. No projected BB2 workout is stored in legacy History, and no temporary state.history substitution is used.

Stable block/session references resolve the current verified ledger projection. Note/delete dialogs retain account and exact-record guards. Archived training streams retain their original opening and complete event prefix. Only existing ledger-valid NOTE_EDITED / HISTORY_HIDDEN / HISTORY_UNHIDDEN annotations can append after sealing; cloud revision/ownership/conflict checks are unchanged. Any archive training mutation, prefix replacement, record loss or foreign ancestry is still rejected.

English exercise labels reuse matching BB1 catalogue names (including Chin-Up/Pull-Up aliases); Japanese labels retain the existing translations. No catalogue prescription, Log Push Press, progression formula, 32-credit rule or ledger schema change is part of this integration. No production deployment or merge is authorised. The full 220-session run remains opt-in and is not required for a presentation adapter.

## Focused verification

- `bb2_shared_interface_browser.cjs`: actual BB1 and BB2 cards at 360/390px, shared VIEW/HIDE DETAILS and action styles, grouped summaries, native-share payload, clipboard and copy fallback, note, set correction, Delete/Cancel, reload and file backup/restore. The same test is RED against the previous d587adf HTML because BB2 lacks the shared History controls.
- `bb2_shared_interface_contracts.mjs`: projection never writes legacy History; shared dialogs and stable references; current and sealed archived note/share/delete; no changed credits/progression/closing snapshot; stale-account and durable-write rollback.
- Cloud sidecar coverage: archived annotations upload with the exact original training prefix; rewritten archive prefixes and stale revisions fail. Authenticated browser coverage transports actual note/delete UI actions to the stored revision and receiving device without changing progress/quotas or legacy History.
- Existing History/bodyweight/package/integration tests now operate the shared expander and modal editor. Expected summaries use normal BVOM `reps×weight unit` formatting. Low-level audited set/session-void contracts remain mandatory, distinct from normal History-only deletion.
- No full 220-session run. All production changes remain on HOLD for real Android acceptance.
