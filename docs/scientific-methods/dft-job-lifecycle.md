# DFT workflow job lifecycle: reconcile & cancel

A `DftWorkflow` is a DAG of units (`dependsOn` edges). Each unit runs as one
Google Cloud Batch job on a single VM. The DAG is driven **event-first**: Batch
publishes `JobStateChanged` to Pub/Sub, which pushes `POST /dft/advance`, which
advances the workflow one tick (launch newly-runnable units, mark terminal ones).
Two situations break the purely event-driven model; this doc covers how they are
handled.

## The gap: silent jobs

The event path only fires when a job **changes state**. Two failure modes never
produce a terminal event, so the workflow would otherwise spin on `running`
forever:

1. **Stuck in QUEUED** — Batch cannot provision the VM (regional quota such as
   `C2_CPUS` too low, or no capacity). The job oscillates
   `QUEUED → SCHEDULED → SCHEDULED_PENDING_QUEUED → QUEUED` indefinitely without
   ever reaching `RUNNING` or `FAILED`.
2. **Vanished** — Batch garbage-collects a job (or a user deletes it out of
   band). `get_job` then returns `NOT_FOUND` and no event is delivered.

## Reconcile (`POST /dft/reconcile`, `driver.reconcile`)

A read-mostly sweep intended for a client poll (mounted while the workflow is
`running`, every 45 s) or a periodic Cloud Scheduler job. For each unit the DAG
believes is `queued`/`running`, it queries Batch state:

| Batch state | Action |
| --- | --- |
| `SUCCEEDED` / `FAILED` | apply via the normal event path (`_apply_event`) |
| `NOT_FOUND` | `mark_failed(uid, "…no longer exists…")` |
| `QUEUED`/`SCHEDULED` past `_STUCK_QUEUED_SECONDS` (25 min) | `mark_failed(uid, "Stuck in QUEUED …")` with a quota/capacity hint |
| `RUNNING`, or freshly `QUEUED` | leave alone |

Idempotent: an already-terminal unit is skipped. The 25-minute threshold is a
deliberate over-estimate — a real VM normally provisions in well under a minute,
so a unit still QUEUED after 25 min is almost certainly unschedulable rather than
slow.

## Cancel (`POST /dft/cancel`, `driver.cancel`)

User-initiated stop. Uses the Batch **CancelJob** API (not DeleteJob): the job
record and its logs are retained for inspection, while the VM is released.

- **Single unit** (`unitId`): cancel that unit's job, then
  `mark_failed(uid, "cancelled by user")`. Failure propagation stops every
  transitive dependent (`blocked: upstream unit … failed`). Completed units are
  untouched.
- **Whole workflow** (no `unitId`): cancel every unit currently `queued`/`running`.

Idempotent: a unit already terminal, or a job already `NOT_FOUND`, is skipped
without error — the unit is still marked failed so the DAG state is consistent.

`CancelJob` returns a long-running operation; the worker does **not** block on it
(`.result()` is not awaited) — cancellation is requested and the handler returns,
leaving VM teardown to Batch.

## Status semantics

Cancelled and stuck units both land in the existing `failed` status, distinguished
by `errorMessage` ("cancelled by user", "Stuck in QUEUED …"). No dedicated
`cancelled` status is introduced, keeping the orchestrator's terminal set
(`COMPLETED`, `FAILED`) and all status-rendering paths unchanged.
