# Final Task Walkthrough

## Org A

Log in as the Org A owner.

Create a workflow containing:

1. `llm_call`
2. `http_request`
3. `conditional_branch`
4. `approval_gate`

Run it manually. The LLM returns `APPROVE`, the HTTP call completes, the branch selects the approval path and the run becomes `paused`.

The screen should update from `running` to `completed` for the earlier steps and then show `paused` for the approval step without refreshing.

Approve the step as the Org A owner or editor. The Action resumes the remaining steps and the run finishes.

## Second trigger

Use the webhook Action with the same workflow ID. The workflow should start without pressing the Run button.

## Org B isolation

Log out and sign in as the Org B viewer.

Org A should not appear in the organization-scoped workflow query. A direct GraphQL query using an Org A workflow UUID should return no row because of Hasura's relationship filter.

A direct attempt to call `triggerWorkflowRun` with the Org A UUID should fail because the Action handler checks the caller's membership.

A direct attempt to approve an Org A paused step should also fail because `approveStep` checks the approver against the run's organization.

That last sequence is the strongest part of the walkthrough because it proves that the protection is not just hidden UI buttons.
