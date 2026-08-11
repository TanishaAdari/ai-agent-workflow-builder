# Architecture and Permission Write-up

## Schema reasoning

The schema follows the execution path directly. `organizations` owns `org_members` and `workflows`. A workflow owns ordered `workflow_steps` and `workflow_triggers`. A workflow execution is stored in `workflow_runs`, and every step execution is stored in `step_runs`. This makes live progress easy to subscribe to and gives every step its own status, input, output, error and retry count.

`approval_gate` uses the same `step_runs` table instead of a separate approval table. The paused step stores `approved_by` and `approved_at`, while the parent `workflow_run` moves to `paused`. This keeps the run state and the step state consistent.

`org_usage_month` is a PostgreSQL view that exposes the organization's current usage percentage without duplicating calculated data in the main table.

## Two permission layers

Layer 1 is the Hasura data boundary. Every important row is filtered through the workflow's organization and its `org_members` relationship. A user can therefore only query or change rows for organizations where their user ID is present. The role in `org_members` then controls whether the user is an owner, editor or viewer.

Layer 2 is the workflow-specific gate. Hasura blocks sensitive step and trigger creation for non-owners, but execution and approval are checked again inside the Action functions. The runner verifies that the caller is an owner/editor before creating a run. The approval Action looks up the paused step's workflow organization and verifies the approver's membership and role before changing the step state.

The two layers have different jobs: Hasura protects data access, while the Action protects business decisions that happen during execution.

## Execution and retries

`triggerWorkflowRun` first loads the workflow, verifies the caller's organization role, checks quota, creates the run and executes steps in position order. `llm_call` and `http_request` both use a small retry wrapper with one retry after failure. Each attempt is reflected in `attempt_count`.

The runner writes `step_runs` as it goes. Because the frontend subscribes to `step_runs` filtered by `workflow_run_id`, the UI receives the running, completed, failed and paused states without polling or refreshing.

## Approval pause/resume

When the runner reaches an `approval_gate`, it creates the step run, changes it to `paused` and changes the parent workflow run to `paused`. It then returns without executing later steps.

`approveStep` is a separate Hasura Action. It checks the paused step, finds its workflow organization and verifies that the caller is an owner or editor in that same organization. Only then does it mark the step approved and continue the remaining steps.

This check cannot safely be represented only as a normal row permission because approval is a decision that happens in the middle of a running workflow.

## Trigger model

Manual execution uses the main Action. Webhook execution uses a second Action and a secret checked by its handler. Scheduled triggers are dispatched by a Hasura Cron Trigger. Database-event triggers are started by a Hasura Event Trigger on `watched_events`. Notifications use a separate Hasura Event Trigger so the `notify` step is event-driven instead of putting provider credentials in the browser.
