# AgentFlow — Technical Write-Up

## 1. Overview

AgentFlow is a multi-tenant AI agent workflow builder built with Next.js, Nhost, Hasura, PostgreSQL and GraphQL. A workflow belongs to an organization and contains ordered steps. Each workflow execution creates a `workflow_run` and corresponding `step_run` records.

The main demonstration workflow contains an LLM call, conditional branch, HTTP request and approval gate. The system also supports manual, webhook, scheduled and database-event triggers.

## 2. Database and Schema Design

The PostgreSQL database models organizations, organization members, workflows, workflow steps, workflow runs, step runs and workflow triggers.

The main relationship is:

```text
User
  ↓
org_members
  ↓
organization
  ↓
workflow
  ↓
workflow_steps
  ↓
workflow_runs
  ↓
step_runs
```

A workflow belongs to one organization. Its steps are ordered using their position. When a workflow is executed, a workflow run is created and the individual workflow steps are represented by step runs.

Workflow triggers are stored separately and identify how a workflow should be started, including manual, webhook, scheduled and database-event triggers.

The schema is defined in:

```text
hasura/migrations/001_init/up.sql
```

Hasura relationships, permissions, Actions and triggers are configured in:

```text
hasura/metadata/metadata.json
```

## 3. Two Permission Layers

AgentFlow uses two complementary authorization layers.

### Layer 1 — Hasura Row-Level Permissions

Hasura permissions restrict database access according to organization membership.

The effective relationship is:

```text
workflow
   ↓
organization
   ↓
org_members
   ↓
user_id
```

This ensures that a user can only read and modify data belonging to organizations where that user is a member.

This protection is enforced at the database/API layer rather than relying only on frontend filtering.

### Layer 2 — Server-Side Action/Function Authorization

Privileged workflow operations are checked again inside the Action/function handlers.

The handlers use the authenticated Hasura session variable:

```text
x-hasura-user-id
```

and verify organization membership before performing sensitive operations.

The approval handler additionally checks that the approving user is an `owner` or `editor` of the same organization as the workflow.

Sensitive operations such as privileged workflow execution, approval and protected trigger operations therefore receive an additional server-side authorization check.

## 4. Workflow Execution and Approval

The main workflow executes in this order:

```text
llm_call
    ↓
conditional_branch
    ↓
http_request
    ↓
approval_gate
```

The LLM step returns `APPROVE` or `REJECT`. When the result is `APPROVE`, the conditional branch continues to the next steps.

The HTTP step performs the configured request.

The approval gate then pauses the workflow until an authorized owner or editor approves it.

The approval lifecycle is:

```text
workflow running
      ↓
approval_gate
      ↓
workflow paused
      ↓
authorized approval
      ↓
approval step = approved
      ↓
workflow run = completed
```

The approval record stores the approving user and approval timestamp.

The frontend receives live `step_runs` updates through GraphQL subscriptions, allowing execution progress to be shown without requiring a manual page refresh.

## 5. Trigger Architecture

The workflow engine supports multiple trigger mechanisms.

### Manual

The `triggerWorkflowRun` Action starts a workflow directly from the application.

### Webhook

The `triggerWorkflowWebhook` Action/function allows an external request to start a workflow. The webhook handler validates the configured webhook secret and resolves an owner for the workflow's organization before starting the workflow runner.

### Scheduled

The `run-scheduled-workflows.ts` function handles scheduled workflow execution using the configured trigger interval.

### Database Event

The `database-event-trigger.ts` handler receives database events, finds matching `database_event` workflow triggers and starts the corresponding workflow.

A `row_changed` database-event trigger was tested with `Org A Test Workflow` and successfully created a workflow run.

## 6. Multi-Tenant Isolation

The application was tested with separate organizations, including Org A and Org B.

When an Org B account attempted to access an Org A workflow directly by UUID, Hasura returned no workflow:

```json
{
  "data": {
    "workflows_by_pk": null
  }
}
```

An attempt to trigger an Org A workflow from the other organization was rejected with:

```text
You cannot trigger this workflow
```

This demonstrates that organization isolation is enforced by the backend and is not dependent only on the frontend interface.

The frontend also clears organization-specific state when users sign out or switch accounts, preventing stale workflow information from the previous organization from remaining visible.

## 7. Quota and Execution Controls

Before starting execution, the workflow runner checks the organization's usage against its configured limit:

```text
calls_used < calls_allowed
```

Usage is updated after workflow execution and a monthly reset function is included.

For a production-scale implementation, quota reservation and completion accounting could be moved into a transactional database function to provide stronger concurrency guarantees. The current implementation keeps the assignment focused while enforcing the quota at execution time.

## 8. Testing and Results

The following areas were implemented and tested:

- TypeScript compilation
- Manual workflow execution
- LLM step
- Conditional branching
- HTTP request
- Approval gate
- Approval authorization
- Webhook trigger
- Scheduled trigger
- Database-event trigger
- Live `step_runs` subscription
- Organization isolation
- Direct workflow-ID protection
- Cross-organization trigger protection
- Account switching
- Nhost backend deployment
- Vercel frontend deployment

The application is deployed at:

https://ai-agent-workflow-builder-tawny-pi.vercel.app/

The source repository is available at:

https://github.com/TanishaAdari/ai-agent-workflow-builder