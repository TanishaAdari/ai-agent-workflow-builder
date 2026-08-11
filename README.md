# AgentFlow — AI Agent Workflow Builder

A small full-stack workflow builder built for the assignment using Next.js, Nhost, Hasura, PostgreSQL and GraphQL.

The project keeps the UI simple. The important parts are enforced in Hasura and in the Action handlers rather than only in the browser.

## What the assignment is asking for

The app is a mini workflow engine. A workflow belongs to an organization and contains ordered steps. A run creates one `workflow_run` and one `step_run` for each step. An approval step changes the run to `paused` until an authorized user approves it.

There are two security layers:

1. Hasura row permissions keep every request inside the caller's organizations.
2. Hasura checks sensitive step/trigger writes, while the Action handlers re-check permissions for execution and approval.

This means changing a URL or guessing a UUID does not give another organization access.

## Stack

- Next.js + React
- Nhost Auth
- Nhost PostgreSQL
- Hasura GraphQL
- Nhost Functions / Hasura Actions
- GraphQL subscriptions
- Groq for the LLM step, with a disclosed local stub if `GROQ_API_KEY` is not configured

## Folder structure

```text
app/                 Next.js UI
components/          Nhost auth provider
lib/                 Small GraphQL helper
functions/            Nhost Action/Event/Cron handlers
hasura/migrations/   PostgreSQL schema
hasura/metadata/     Hasura relationships, permissions, actions and triggers
docs/                Write-up and demo walkthrough
```

## 1. Create an Nhost project

Create an Nhost project and copy its subdomain and region.

In the Nhost dashboard, configure these function environment variables:

```text
GROQ_API_KEY=your_groq_key
GROQ_MODEL=llama-3.1-8b-instant
WEBHOOK_SECRET=choose-a-long-random-value
```

If you do not have a Groq key, the `llm_call` function waits briefly and returns `APPROVE`. The README is intentionally explicit about this fallback because the assignment asks for a disclosed stub when an LLM key is unavailable.

Nhost automatically provides the function/Hasura variables used by the backend, including `NHOST_ADMIN_SECRET` and `NHOST_GRAPHQL_URL`.

## 2. Apply the database migration

Run the SQL in:

```text
hasura/migrations/001_init/up.sql
```

You can paste it into the Hasura SQL editor or apply it with the Nhost CLI.

Then import:

```text
hasura/metadata/metadata.json
```

The metadata tracks the tables, relationships, permissions, Actions, Event Triggers and Cron Triggers.

If your Nhost project uses a different unauthenticated Hasura role name, change the `public` permission on `triggerWorkflowWebhook` to the role used by your project.

## 3. Create two organizations and users

Create four Nhost users, for example:

```text
Org A owner
Org A editor
Org B owner
Org B viewer
```

Verify the email accounts if email verification is enabled.

Get each user's UUID from Nhost Auth and insert memberships from the Hasura SQL editor:

```sql
insert into organizations(name,calls_allowed) values ('Org A',100),('Org B',100);

insert into org_members(org_id,user_id,role)
select id,'ORG_A_OWNER_UUID','owner' from organizations where name='Org A';

insert into org_members(org_id,user_id,role)
select id,'ORG_A_EDITOR_UUID','editor' from organizations where name='Org A';

insert into org_members(org_id,user_id,role)
select id,'ORG_B_OWNER_UUID','owner' from organizations where name='Org B';

insert into org_members(org_id,user_id,role)
select id,'ORG_B_VIEWER_UUID','viewer' from organizations where name='Org B';
```

Replace the four placeholder UUIDs before running the SQL.

## 4. Run the Next.js app

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set:

```text
NEXT_PUBLIC_NHOST_SUBDOMAIN=your-project-subdomain
NEXT_PUBLIC_NHOST_REGION=your-project-region
```

Open `http://localhost:3000`.

## 5. Run the demo

1. Sign in as the Org A owner.
2. Select Org A.
3. Create the demo workflow.
4. The generated workflow contains `llm_call`, `http_request`, `conditional_branch` and `approval_gate`.
5. Click **Run workflow**.
6. The UI subscribes to `step_runs` and updates without a page refresh.
7. The LLM returns `APPROVE`, so the conditional branch reaches the approval gate.
8. The run changes to `paused`.
9. Approve it as the Org A owner/editor.
10. Sign in as the Org B viewer.
11. Org A workflows are absent from the workflow list.
12. Trying to run or approve an Org A UUID directly is rejected by Hasura or the Action handler.

## Webhook trigger

The `triggerWorkflowWebhook` Hasura Action is configured as a public Action and forwards the caller headers to the handler. The handler requires `x-webhook-secret`, so an external system can start a workflow without pretending to be an application user.

Call the Hasura Action like this:

```bash
curl -X POST "https://YOUR_GRAPHQL_HOST/v1/graphql" \
  -H "content-type: application/json" \
  -H "x-webhook-secret: YOUR_WEBHOOK_SECRET" \
  -d '{"query":"mutation($id:uuid!,$payload:jsonb){triggerWorkflowWebhook(workflow_id:$id,payload:$payload){run_id status}}","variables":{"id":"WORKFLOW_UUID","payload":{"source":"external"}}}'
```

The Action handler resolves an owner for the workflow's organization and starts the same runner used by the manual Action.

## Other triggers

- **Manual:** `triggerWorkflowRun` Action.
- **Webhook:** `triggerWorkflowWebhook` Action.
- **Scheduled:** Hasura Cron Trigger calls `run-scheduled-workflows` every minute. A `scheduled` workflow trigger uses `config.interval_minutes`.
- **Database event:** inserts into `watched_events` are sent through a Hasura Event Trigger to `database-event-trigger`. A workflow trigger with `type: database_event` and matching `config.event_type` starts the workflow.
- **Notify:** inserting a `notifications` row fires `notify_event`, which is handled by `notify-handler`. Add Slack/email credentials there if a real delivery channel is required for the walkthrough.

## Security notes

The browser never sends the admin secret.

The Action handlers use the authenticated Hasura session variable `x-hasura-user-id` and query `org_members` before doing privileged work. This is important because Actions are business logic and approval is a mid-run decision.

The Hasura permissions use relationships such as:

```text
workflow -> organization -> members -> user_id
```

so a user only sees rows belonging to an organization where that user is a member.

Sensitive workflow steps are checked in Hasura when inserted. `db_write` and `notify` require an owner. Webhook triggers also require an owner.

The approval Action separately checks that the approver is an owner or editor in the same organization as the paused run.

## Quota

The runner checks `calls_used < calls_allowed` before starting. After a run finishes successfully or fails, it increments `calls_used`. The monthly cron resets the counter at the start of a new month.

For a production version, the quota reservation and completion update should be moved into one transactional database function to handle high concurrency. For this assignment the model stays intentionally small and the Action performs the enforcement before execution.

## Deploying

### Nhost

Push the `functions/` folder and apply the migration/metadata to the Nhost project. Set the function environment variables in Nhost.

### Vercel

Import the repository into Vercel and add:

```text
NEXT_PUBLIC_NHOST_SUBDOMAIN
NEXT_PUBLIC_NHOST_REGION
```

Build command:

```text
npm run build
```

The Vercel URL is the frontend URL to submit with the GitHub repository.

## Final submission checklist

- [ ] GitHub repository pushed
- [ ] Nhost database migration applied
- [ ] Hasura metadata imported
- [ ] Two organizations created
- [ ] Users assigned owner/editor/viewer roles
- [ ] Groq key configured or stub explicitly disclosed
- [ ] Workflow runs manually
- [ ] Webhook trigger runs the workflow
- [ ] Approval pauses and resumes a run
- [ ] Live `step_runs` subscription works
- [ ] Org B cannot read, run or approve Org A's workflow
- [ ] Vercel URL added to submission
- [ ] Short final walkthrough recorded
