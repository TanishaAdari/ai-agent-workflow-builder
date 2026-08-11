# AgentFlow — AI Agent Workflow Builder

A small full-stack workflow builder built for the assignment using Next.js, Nhost, Hasura, PostgreSQL and GraphQL.

The project keeps the UI simple. The important parts are enforced in Hasura and in the Action/function handlers rather than only in the browser.

## Live Application

https://ai-agent-workflow-builder-tawny-pi.vercel.app/

## GitHub Repository

https://github.com/TanishaAdari/ai-agent-workflow-builder

---

## What the assignment is asking for

The app is a mini workflow engine. A workflow belongs to an organization and contains ordered steps. A workflow run creates one `workflow_run` and one `step_run` for each step.

The application supports:

- Creating and managing workflows
- Ordered workflow steps
- Manual workflow execution
- Webhook triggers
- Scheduled triggers
- Database-event triggers
- LLM execution
- Conditional branching
- HTTP requests
- Approval gates
- Live workflow execution updates
- Organization-level authorization
- Owner/editor/viewer roles
- Usage quotas

An approval step pauses the workflow until an authorized organization member approves it.

There are two security layers:

1. Hasura row permissions keep requests inside the caller's organizations.
2. Hasura checks sensitive step/trigger writes, while the Action/function handlers re-check permissions for workflow execution and approval.

This means changing a URL or guessing a UUID does not give another organization access.

---

## Stack

### Frontend

- Next.js
- React
- TypeScript
- GraphQL
- GraphQL subscriptions

### Backend

- Nhost Auth
- Nhost PostgreSQL
- Hasura GraphQL
- Nhost Functions
- Hasura Actions
- Hasura Event Triggers
- Hasura Cron Triggers

### AI

- Groq
- `llama-3.1-8b-instant`
- Disclosed fallback behavior when `GROQ_API_KEY` is not configured

---

## Folder Structure

```text
app/                 Next.js UI
components/          Nhost auth provider
lib/                 Small GraphQL helper
functions/           Nhost Action/Event/Cron handlers
hasura/migrations/   PostgreSQL schema
hasura/metadata/     Hasura relationships, permissions, actions and triggers
docs/                Write-up and demo walkthrough
```

---

## 1. Nhost Project Setup

Create an Nhost project and copy its subdomain and region.

The frontend uses:

```text
NEXT_PUBLIC_NHOST_SUBDOMAIN=your-project-subdomain
NEXT_PUBLIC_NHOST_REGION=your-project-region
```

The backend functions use Nhost-provided server-side variables such as:

```text
NHOST_ADMIN_SECRET
NHOST_GRAPHQL_URL
```

These values must remain server-side and must never be exposed to the browser or committed to GitHub.

### LLM configuration

The application can run without a Groq API key.

When `GROQ_API_KEY` is configured, the LLM step can use Groq.

When it is not configured, the `llm_call` function uses a disclosed fallback behavior and returns:

```text
APPROVE
```

after a short delay.

This fallback is intentionally disclosed rather than presenting a stub as a real external LLM response.

---

## 2. Database and Hasura Setup

The PostgreSQL schema is stored in:

```text
hasura/migrations/001_init/up.sql
```

The Hasura configuration is stored in:

```text
hasura/metadata/metadata.json
```

The migration defines the database tables.

The Hasura metadata configures:

- Relationships
- Row-level permissions
- Actions
- Event Triggers
- Cron Triggers

These have been applied to the Nhost/Hasura backend used by the application.

---

## 3. Organizations and Roles

The application uses organization membership to determine access.

The tested roles are:

```text
owner
editor
viewer
```

The test environment contains:

```text
Org A
Org B
```

Users are associated with organizations through the `org_members` table.

The authorization relationship is:

```text
User
  ↓
org_members
  ↓
organization
  ↓
workflow
```

A user can only access workflows belonging to organizations where that user is a member.

---

## 4. Running the Project Locally

Install dependencies:

```bash
npm install
```

Create `.env.local` from `.env.example` if required:

```bash
cp .env.example .env.local
```

Configure:

```text
NEXT_PUBLIC_NHOST_SUBDOMAIN=your-project-subdomain
NEXT_PUBLIC_NHOST_REGION=your-project-region
```

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

---

## 5. Workflow Structure

The main demo workflow contains four ordered steps:

```text
1. llm_call
       ↓
2. conditional_branch
       ↓
3. http_request
       ↓
4. approval_gate
```

### Step 1 — LLM Call

The LLM step is instructed to return:

```text
APPROVE
```

or:

```text
REJECT
```

The tested workflow returned:

```text
APPROVE
```

### Step 2 — Conditional Branch

The conditional branch evaluates the LLM output.

When the value is:

```text
APPROVE
```

the workflow continues through the configured branch.

### Step 3 — HTTP Request

The demo workflow sends an HTTP request to:

```text
https://httpbin.org/post
```

The response is stored as part of the step run.

### Step 4 — Approval Gate

The approval gate pauses workflow execution until an authorized organization member approves it.

The approval step itself becomes:

```text
approved
```

while the overall workflow run becomes:

```text
completed
```

This distinction is intentional.

---

## 6. Workflow Triggers

AgentFlow supports four trigger types.

### Manual Trigger

The manual trigger uses the workflow execution Action to start a workflow.

```text
triggerWorkflowRun
```

### Webhook Trigger

The webhook trigger starts a workflow through the webhook handler.

The handler validates the webhook secret and resolves an owner for the workflow's organization before starting the workflow runner.

The deployed function is:

```text
trigger-workflow-webhook
```

The endpoint follows the Nhost Functions URL pattern:

```text
/v1/trigger-workflow-webhook
```

Example:

```bash
curl -i -X POST "https://YOUR_FUNCTIONS_HOST/v1/trigger-workflow-webhook" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: YOUR_WEBHOOK_SECRET" \
  -d '{"workflow_id":"WORKFLOW_UUID","payload":{"source":"external"}}'
```

### Scheduled Trigger

Scheduled workflows are handled by:

```text
run-scheduled-workflows.ts
```

A scheduled workflow trigger stores an interval configuration such as:

```json
{
  "interval_minutes": 60
}
```

The deployed scheduled function was tested successfully and returned:

```json
{
  "started": 1
}
```

### Database-Event Trigger

Database-event workflows are handled by:

```text
database-event-trigger.ts
```

The database-event trigger is configured with:

```json
{
  "event_type": "row_changed"
}
```

The handler:

1. Receives the database event.
2. Finds matching `database_event` workflow triggers.
3. Resolves the owner of the workflow's organization.
4. Calls the workflow runner.
5. Creates a real workflow run.

The database-event function was tested successfully.

The configured database-event trigger belongs to:

```text
Org A Test Workflow
```

A real workflow run was created through this trigger and progressed through the workflow until the approval gate.

---

## 7. Approval Flow

Approval is handled server-side.

The execution flow is:

```text
Workflow starts
      ↓
llm_call
      ↓
conditional_branch
      ↓
http_request
      ↓
approval_gate
      ↓
workflow pauses
      ↓
authorized owner/editor approves
      ↓
approval step = approved
      ↓
workflow run = completed
```

The approval Action verifies that the approving user is an `owner` or `editor` in the same organization as the workflow.

The database records:

```text
approved_by
approved_at
```

for an approved step.

---

## 8. Security and Authorization

The application uses two security layers.

### Layer 1 — Hasura Permissions

Hasura row-level permissions restrict access using organization membership.

The relationship is effectively:

```text
workflow
   ↓
organization
   ↓
org_members
   ↓
user_id
```

This prevents users from accessing workflows belonging to organizations they do not belong to.

### Layer 2 — Server-Side Checks

The Action/function handlers use the authenticated Hasura session variable:

```text
x-hasura-user-id
```

The handlers query `org_members` before performing privileged operations.

This means authorization is not dependent only on the browser UI.

Sensitive operations are protected server-side.

The approval Action separately verifies that the approver belongs to the same organization and has an appropriate role.

---

## 9. Organization Isolation Testing

The application was tested with:

```text
Org A
Org B
```

Org A contains the main test workflows.

Org B has its own organization context.

### Direct Workflow Access Test

When the Org B account attempted to access an Org A workflow directly by UUID, Hasura returned:

```json
{
  "data": {
    "workflows_by_pk": null
  }
}
```

### Cross-Organization Trigger Test

When the Org B account attempted to trigger an Org A workflow, the backend returned:

```text
You cannot trigger this workflow
```

This confirms that organization isolation is enforced by the backend and not only by the frontend.

---

## 10. Account Switching

The frontend clears organization-specific workflow state when the authenticated user changes or signs out.

This prevents information from the previous account or organization from remaining visible after switching accounts.

Account switching between Org A and Org B was tested without requiring a manual browser refresh to load the correct organization state.

---

## 11. Live Workflow Updates

The frontend uses GraphQL subscriptions to receive live `step_runs` updates.

A typical workflow execution displays:

```text
Step 1: llm_call
completed

Step 2: conditional_branch
completed

Step 3: http_request
completed

Step 4: approval_gate
approved
```

The overall workflow run is stored separately and becomes:

```text
completed
```

after the approval flow finishes.

---

## 12. Quota

The runner checks:

```text
calls_used < calls_allowed
```

before starting execution.

The organization stores:

```text
calls_allowed
calls_used
calls_period_start
```

Usage is updated after workflow execution.

A monthly usage reset function is included.

For a production implementation, quota reservation and completion accounting could be moved into a transactional database function to handle high concurrency more robustly. For this assignment, the current Action-based enforcement keeps the implementation intentionally small.

---

## 13. LLM Fallback

When `GROQ_API_KEY` is configured, the LLM step can use Groq.

When the key is not configured, the implementation uses the disclosed fallback behavior:

```text
APPROVE
```

after a short delay.

The fallback is documented explicitly so that it is clear that a real external LLM request is not being made when no API key is available.

---

## 14. Deployment

### Nhost Backend

The backend functions are deployed through Nhost.

The functions include:

```text
approve-step.ts
database-event-trigger.ts
notify-handler.ts
run-scheduled-workflows.ts
shared.ts
trigger-workflow-run.ts
trigger-workflow-webhook.ts
usage-reset.ts
```

The PostgreSQL migration and Hasura metadata are also configured in the Nhost backend.

### Vercel Frontend

The Next.js frontend is deployed on Vercel.

Live application:

https://ai-agent-workflow-builder-tawny-pi.vercel.app/

The Vercel frontend uses:

```text
NEXT_PUBLIC_NHOST_SUBDOMAIN
NEXT_PUBLIC_NHOST_REGION
```

Build command:

```text
npm run build
```

---

## 15. Testing Completed

The following functionality has been implemented and tested:

- [x] TypeScript compilation
- [x] Manual workflow execution
- [x] LLM step
- [x] Conditional branch
- [x] HTTP request
- [x] Approval gate
- [x] Approval authorization
- [x] Webhook trigger
- [x] Scheduled trigger
- [x] Database-event trigger
- [x] Live `step_runs` subscription
- [x] Organization isolation
- [x] Direct workflow-ID access protection
- [x] Cross-organization trigger protection
- [x] Account switching without manual browser refresh
- [x] Nhost backend deployment
- [x] Vercel frontend deployment

---

## 16. Final Demo Walkthrough

The recommended final demonstration is:

1. Sign in as the Org A owner.
2. Open the demo workflow.
3. Run the workflow.
4. Show the LLM output.
5. Show the conditional branch.
6. Show the HTTP request.
7. Show the approval gate.
8. Approve the workflow step.
9. Show that the approval step is `approved`.
10. Show that the overall workflow run is `completed`.
11. Demonstrate the webhook trigger.
12. Demonstrate the scheduled trigger.
13. Demonstrate the database-event trigger.
14. Sign out.
15. Sign in as the Org B owner.
16. Show that Org A workflows are not visible.
17. Attempt to access an Org A workflow directly.
18. Show that the request is rejected.
19. Attempt to trigger the Org A workflow from Org B.
20. Show `You cannot trigger this workflow`.

---

## 17. Final Submission Checklist

- [x] GitHub repository created and pushed
- [x] PostgreSQL migration applied
- [x] Hasura metadata configured
- [x] Organizations created
- [x] Organization roles configured
- [x] LLM workflow step tested
- [x] Conditional branch tested
- [x] HTTP request tested
- [x] Approval flow tested
- [x] Manual trigger tested
- [x] Webhook trigger tested
- [x] Scheduled trigger tested
- [x] Database-event trigger tested
- [x] Live `step_runs` subscription tested
- [x] Org B isolation tested
- [x] Direct workflow-ID access protection tested
- [x] Cross-organization trigger protection tested
- [x] Account switching tested
- [x] Vercel deployment completed
- [ ] Final README committed and pushed
- [ ] One-page technical write-up completed
- [ ] Final demo recording completed

---

## Project Links

### GitHub Repository

https://github.com/TanishaAdari/ai-agent-workflow-builder

### Live Application

https://ai-agent-workflow-builder-tawny-pi.vercel.app/