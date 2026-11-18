# CEDA Innovation Portal API Guide

## Interactive docs

- Swagger UI: `/docs/` or `/api/docs/swagger/`
- ReDoc: `/api/docs/redoc/`
- OpenAPI schema: `/api/schema/`

## Authentication

The API uses JWT bearer authentication and also establishes a browser session on successful password or social login.

1. Register: `POST /api/auth/register/`
2. Login: `POST /api/auth/login/`
3. Refresh token: `POST /api/auth/refresh/`
4. Logout / blacklist refresh token: `POST /api/auth/logout/`
5. Send the access token in requests:

```http
Authorization: Bearer <access_token>
```

Browser apps may also rely on the authenticated session cookie when sending requests with credentials included.

### Login response shape

`POST /api/auth/login/` returns:

```json
{
  "access": "<jwt-access-token>",
  "refresh": "<jwt-refresh-token>",
  "user": {
    "id": "11111111-1111-1111-1111-111111111111",
    "email": "innovator@example.com",
    "first_name": "Neo",
    "last_name": "Kebadile",
    "phone_number": "+26771234567",
    "email_verified": true,
    "primary_auth_method": "password",
    "is_staff": false,
    "is_superuser": false,
    "is_admin": false,
    "roles": ["innovator"],
    "profile": {
      "id": "22222222-2222-2222-2222-222222222222",
      "national_id": "",
      "gender": "",
      "date_of_birth": null,
      "region": "",
      "bio": "",
      "sector_interests": [],
      "skills": [],
      "certifications": [],
      "portfolio_url": "",
      "linkedin_url": "",
      "past_participation_summary": ""
    }
  }
}
```

### Refresh response shape

`POST /api/auth/refresh/` returns the same top-level auth structure:

```json
{
  "access": "<new-jwt-access-token>",
  "refresh": "<rotated-jwt-refresh-token>",
  "user": {
    "id": "11111111-1111-1111-1111-111111111111",
    "email": "innovator@example.com",
    "first_name": "Neo",
    "last_name": "Kebadile",
    "phone_number": "+26771234567",
    "email_verified": true,
    "primary_auth_method": "password",
    "is_staff": false,
    "is_superuser": false,
    "is_admin": false,
    "roles": ["innovator"],
    "profile": {
      "id": "22222222-2222-2222-2222-222222222222",
      "national_id": "",
      "gender": "",
      "date_of_birth": null,
      "region": "",
      "bio": "",
      "sector_interests": [],
      "skills": [],
      "certifications": [],
      "portfolio_url": "",
      "linkedin_url": "",
      "past_participation_summary": ""
    }
  }
}
```

## Common response format

Successful responses use:

```json
{
  "success": true,
  "message": "Success",
  "data": {}
}
```

Validation and permission failures use:

```json
{
  "success": false,
  "message": "Request failed.",
  "errors": {}
}
```

The social providers endpoint is the main exception and returns a plain provider payload for frontend compatibility.

## Main API areas

- Auth: `/api/auth/`
- Profile: `/api/profile/`
- Teams: `/api/teams/`
- Programs and program form management: `/api/programs/`
- Drafts: `/api/drafts/`
- Submissions: `/api/submissions/`
- Documents: `/api/documents/`
- Workflow definitions, graph builder, and runtime: `/api/workflow-definitions/`, `/api/workflow-instances/`, `/api/assignment-instances/`
- Legacy ordered-step workflow operations: `/api/workflows/`, `/api/tasks/`
- Assignments and reviewer operations: `/api/assignments/`
- Evaluations: `/api/evaluations/`
- Notifications: `/api/notifications/`
- Operations and analytics: `/api/operations/`, `/api/analytics/`
- Audit: `/api/audit/`
- Support and public content: `/api/support/`
- Tracking: `/api/tracking/` and `/api/track/<reference_number>/`

## Roles

Supported roles include:

- `innovator`
- `innovation_officer`
- `judge`
- `mentor`
- `administrator`
- `management_viewer`

## Submission lifecycle

The current submission lifecycle is draft-first.

1. Create a draft: `POST /api/drafts/`
2. Update draft data: `PUT/PATCH /api/drafts/{id}/`
3. Upload draft documents where needed
4. Final submit the draft: `POST /api/drafts/{id}/submit/`
5. View submission workflow state:
   - `GET /api/submissions/{id}/workflow/`
   - `GET /api/submissions/{id}/workflow/history/`
6. If returned for correction:
   - update data as required
   - `POST /api/submissions/{id}/resubmit/`

Important:

- `POST /api/submissions/` is not the operational path for creating new runtime submissions.
- Runtime submissions are started from finalized drafts.

## Example draft payload

```json
{
  "program": "11111111-1111-1111-1111-111111111111",
  "submission_type": "idea",
  "title": "Smart Fibre Fault Prediction",
  "team": null,
  "metadata": {
    "sector": "Connectivity"
  }
}
```

## Workflow engine overview

The backend currently supports two workflow modes:

1. Legacy ordered-step workflow runtime
2. Graph-based workflow definition and graph runtime

The legacy runtime is still used for existing submission-facing step workflows.
The graph runtime is the new backend foundation for a true workflow generator.

## Program workflow linkage

Workflow definitions are explicitly linked to programs.

- workflow definition create requests require `program`
- workflow definition responses include both `program` and `program_detail`
- workflow definition lists can be filtered with `?program=<program_id>`
- program detail responses expose:
  - `active_workflow_definition`
  - `workflow_definitions`

This is the backend contract the workflow builder and program detail pages should use.

### Workflow definition lifecycle

Workflow definitions support:

- `draft`
- `published`
- `active`
- `inactive`
- `archived`

Key rules:

- only active workflow definitions can start new graph runtime instances
- active definitions are treated as immutable
- editing active or otherwise protected definitions creates a safe versioned copy
- historical runtime instances remain tied to the definition version they started with

## Workflow definition APIs

Workflow definitions:

- `POST /api/workflow-definitions/`
- `GET /api/workflow-definitions/`
- `GET /api/workflow-definitions/{id}/`
- `PATCH /api/workflow-definitions/{id}/`
- `DELETE /api/workflow-definitions/{id}/`
- `POST /api/workflow-definitions/{id}/publish/`
- `POST /api/workflow-definitions/{id}/activate/`
- `POST /api/workflow-definitions/{id}/archive/`
- `POST /api/workflow-definitions/{id}/clone/`
- `POST /api/workflow-definitions/{id}/validate/`

Useful filter:

- `GET /api/workflow-definitions/?program=<program_id>`

These endpoints are officer/admin oriented.

### Example workflow definition create payload

```json
{
  "name": "Innovation Review Graph",
  "code": "innovation-review-graph",
  "description": "Graph workflow for innovation review and approval.",
  "workflow_type": "innovation_portal",
  "scope": "program",
  "program": "33333333-3333-3333-3333-333333333333",
  "metadata_json": {
    "builder": "graph"
  }
}
```

Workflow definition read responses include:

- `program`
- `program_detail`

Where `program_detail` contains basic linked program metadata:

```json
{
  "id": "33333333-3333-3333-3333-333333333333",
  "title": "CEDA Innovation Hackathon 2026",
  "slug": "ceda-innovation-hackathon-2026",
  "status": "published"
}
```

### Example workflow definition clone payload

```json
{
  "name": "Innovation Review Graph v2 Draft",
  "comment": "Prepare next version without touching the active workflow."
}
```

## Graph builder APIs

### Nodes

- `GET /api/workflow-definitions/{id}/nodes/`
- `POST /api/workflow-definitions/{id}/nodes/`
- `GET /api/workflow-nodes/{id}/`
- `PATCH /api/workflow-nodes/{id}/`
- `DELETE /api/workflow-nodes/{id}/`

Supported node types:

- `start`
- `user_task`
- `review_task`
- `approval_task`
- `system_task`
- `decision`
- `wait`
- `notification`
- `end`

Example node create payload:

```json
{
  "name": "Review",
  "code": "review",
  "node_type": "review_task",
  "description": "Officer or judge review node",
  "position_x": 320,
  "position_y": 180,
  "is_initial": false,
  "is_terminal": false,
  "is_active": true,
  "metadata_json": {
    "lane": "review"
  }
}
```

### Transitions

- `GET /api/workflow-definitions/{id}/transitions/`
- `POST /api/workflow-definitions/{id}/transitions/`
- `GET /api/workflow-transitions/{id}/`
- `PATCH /api/workflow-transitions/{id}/`
- `DELETE /api/workflow-transitions/{id}/`

Transitions are graph-based and support:

- explicit `from_node`
- explicit `to_node`
- `action_key`
- `condition_expression`
- `condition_language`
- `priority`
- `is_default`

Example transition create payload:

```json
{
  "from_node": "44444444-4444-4444-4444-444444444444",
  "to_node": "55555555-5555-5555-5555-555555555555",
  "action_key": "approve",
  "condition_expression": {
    "==": [
      {
        "var": "payload.review_outcome"
      },
      "approved"
    ]
  },
  "condition_language": "json_logic",
  "priority": 1,
  "label": "Approve To Final Decision",
  "is_default": false,
  "is_active": true
}
```

### Node actions

- `GET /api/workflow-nodes/{id}/actions/`
- `POST /api/workflow-nodes/{id}/actions/`
- `GET /api/workflow-node-actions/{id}/`
- `PATCH /api/workflow-node-actions/{id}/`
- `DELETE /api/workflow-node-actions/{id}/`

Node actions define the allowed actions at a graph node, for example `approve`.

Example node action create payload:

```json
{
  "key": "approve",
  "label": "Approve",
  "requires_comment": false,
  "requires_attachment": false,
  "is_terminal_action": false,
  "is_active": true
}
```

### Workflow rules

- `GET /api/workflow-definitions/{id}/rules/`
- `POST /api/workflow-definitions/{id}/rules/`
- `GET /api/workflow-rules/{id}/`
- `PUT/PATCH /api/workflow-rules/{id}/`
- `DELETE /api/workflow-rules/{id}/`

Current rule evaluation is intentionally constrained and does not allow arbitrary Python execution.

Example workflow rule create payload:

```json
{
  "workflow_definition": "66666666-6666-6666-6666-666666666666",
  "scope_type": "node",
  "node": "77777777-7777-7777-7777-777777777777",
  "rule_type": "exit_condition",
  "expression_language": "json_logic",
  "expression": {
    "==": [
      {
        "var": "payload.review_ready"
      },
      true
    ]
  },
  "priority": 1,
  "enabled": true,
  "metadata_json": {}
}
```

## Workflow-scoped forms and node form binding

Reusable workflow-scoped forms:

- `GET /api/forms/`
- `POST /api/forms/`
- `GET /api/forms/{id}/`
- `PUT/PATCH /api/forms/{id}/`

Form sections:

- `GET /api/forms/{id}/sections/`
- `POST /api/forms/{id}/sections/`

Form fields:

- `GET /api/form-sections/{id}/fields/`
- `POST /api/form-sections/{id}/fields/`

Node form binding:

- `POST /api/workflow-nodes/{id}/bind-form/`

Node form bindings support:

- `binding_type`
  - `entry`
  - `review`
  - `decision`
  - `feedback`
- `mode`
  - `read_only`
  - `editable`
  - `partial_edit`
- `required_on_entry`
- `required_on_exit`

Current runtime enforcement:

- required-on-exit node forms are enforced by `NodeExitGuard`
- required fields are checked against the workflow data envelope payload before a node may transition

Example form create payload:

```json
{
  "name": "Review Form",
  "code": "review-form",
  "description": "Reusable review form for graph workflow nodes",
  "metadata_json": {}
}
```

Example form section create payload:

```json
{
  "title": "Decision",
  "code": "decision",
  "order": 1,
  "description": "Decision section"
}
```

Example form field create payload:

```json
{
  "key": "review_note",
  "label": "Review Note",
  "field_type": "textarea",
  "required": true,
  "default_value": {},
  "help_text": "Provide a short review note",
  "data_source_type": "static",
  "data_source_config": {},
  "validation_schema": {},
  "ui_schema": {},
  "order": 1
}
```

Example node form binding payload:

```json
{
  "form_definition": "88888888-8888-8888-8888-888888888888",
  "binding_type": "review",
  "mode": "editable",
  "required_on_entry": false,
  "required_on_exit": true,
  "is_active": true,
  "metadata_json": {}
}
```

## Assignment policy and node assignment binding

Assignment policies:

- `GET /api/assignment-policies/`
- `POST /api/assignment-policies/`
- `GET /api/assignment-policies/{id}/`
- `PUT/PATCH /api/assignment-policies/{id}/`
- `DELETE /api/assignment-policies/{id}/`

Node assignment binding:

- `POST /api/workflow-nodes/{id}/bind-assignment-policy/`

Current runtime-supported assignment policy types:

- `specific_user`
- `role_based`

The policy model also includes additional types for future use, but only the two above are currently resolved by graph runtime execution.

Node assignment binding supports:

- `minimum_assignees`
- `maximum_assignees`
- `execution_mode`
  - `sequential`
  - `parallel_all`
  - `parallel_any`
  - `parallel_minimum`
- `minimum_completions_required`

Example assignment policy for direct assignment:

```json
{
  "name": "Specific Judge Policy",
  "code": "specific-judge-policy",
  "policy_type": "specific_user",
  "config_json": {
    "user_ids": [
      "99999999-9999-9999-9999-999999999999"
    ]
  },
  "sla_hours": 72,
  "escalation_policy": {},
  "is_active": true
}
```

Example assignment policy for claimable role-based work:

```json
{
  "name": "Claimable Judge Queue",
  "code": "claimable-judge-queue",
  "policy_type": "role_based",
  "config_json": {
    "role_codes": [
      "judge"
    ],
    "claim_required": true
  },
  "sla_hours": 72,
  "escalation_policy": {},
  "is_active": true
}
```

Example node assignment binding payload:

```json
{
  "assignment_policy": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "minimum_assignees": 1,
  "maximum_assignees": 2,
  "execution_mode": "parallel_minimum",
  "minimum_completions_required": 1,
  "is_active": true,
  "metadata_json": {}
}
```

## Graph workflow runtime APIs

Graph runtime instance control:

- `POST /api/workflow-instances/start/`
- `GET /api/workflow-instances/{id}/`
- `GET /api/workflow-instances/{id}/history/`
- `POST /api/workflow-instances/{id}/actions/`
- `POST /api/workflow-instances/{id}/pause/`
- `POST /api/workflow-instances/{id}/resume/`
- `POST /api/workflow-instances/{id}/cancel/`

Example graph workflow start payload:

```json
{
  "workflow_definition": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  "entity_type": "submission",
  "entity_id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
  "payload_json": {
    "review_note": "Initial runtime payload",
    "review_ready": false
  }
}
```

Runtime detail/history currently expose:

- current node
- node instances
- transition execution logs
- workflow data envelope
- assignment instances

### Runtime enforcement before transition

Before a graph node can transition, `NodeExitGuard` checks:

1. required node-bound forms are satisfied
2. assignment completion thresholds are satisfied
3. current simple exit rules are satisfied

If any check fails, the workflow action is rejected with a validation error under `errors.node_exit_guard`.

### Action execution order

Graph workflow actions currently follow this order:

1. load active `NodeInstance`
2. merge payload into `WorkflowDataEnvelope`
3. run `NodeExitGuard`
4. resolve matching `WorkflowTransition`
5. execute the transition
6. enter the next node or complete the workflow

## Graph assignment runtime APIs

Assignment instance read APIs:

- `GET /api/assignment-instances/`
- `GET /api/assignment-instances/{id}/`

Supported list filters:

- `mine=true`
- `status=<status>`
- `workflow_instance=<uuid>`
- `node_instance=<uuid>`

Assignment runtime actions:

- `POST /api/assignment-instances/{id}/accept/`
- `POST /api/assignment-instances/{id}/claim/`
- `POST /api/assignment-instances/{id}/decline/`
- `POST /api/assignment-instances/{id}/complete/`
- `POST /api/assignment-instances/{id}/cancel/`
- `POST /api/assignment-instances/{id}/reassign/`

Example accept payload:

```json
{}
```

Example claim payload:

```json
{}
```

Example decline payload:

```json
{
  "reason": "Conflict of interest."
}
```

Example complete payload:

```json
{
  "note": "Review completed successfully.",
  "metadata_json": {
    "score": 4,
    "decision": "approve"
  }
}
```

Example cancel payload:

```json
{
  "reason": "Reviewer unavailable."
}
```

Example reassign payload:

```json
{
  "new_assignee": "dddddddd-dddd-dddd-dddd-dddddddddddd",
  "reason": "Current reviewer is unavailable."
}
```

### Supported assignment statuses

- `available`
- `pending`
- `accepted`
- `completed`
- `cancelled`
- `declined`

### Runtime assignment behavior

`accept`

- used for directly assigned work
- available to the current assignee

`claim`

- used for claimable role-based work
- atomic and protected against double-claim
- sets:
  - `assignee_user`
  - `claimed_by`
  - `claimed_at`
  - `accepted_at`
  - `status = accepted`

`decline`

- available to the current assignee
- sets:
  - `status = declined`
  - `declined_at`

`complete`

- available to the current assignee
- sets:
  - `status = completed`
  - `completed_at`
  - `completed_by`

`cancel`

- officer/admin action

`reassign`

- officer/admin action
- preserves audit trail by cancelling the old assignment instance and creating a new one

### Assignment permissions

Normal authenticated users:

- can see their own assignment instances
- can see claimable role-based assignment instances they are eligible to claim
- can accept/claim/decline/complete only where permitted by ownership and eligibility

Officer/admin users:

- can inspect all graph assignment instances
- can cancel and reassign
- can also act with override behavior where the runtime service allows it

### Example blocked node exit error

```json
{
  "success": false,
  "message": "Request failed.",
  "errors": {
    "node_exit_guard": {
      "forms": [
        {
          "binding_type": "review",
          "form_definition_code": "review-form",
          "missing_fields": [
            "review_note"
          ]
        }
      ]
    }
  }
}
```

### Assignment threshold behavior

Node exit enforcement currently treats assignment statuses like this:

- `completed` counts toward completion thresholds
- `accepted` and `pending` do not count as completed
- `cancelled` is excluded
- `declined` is excluded

That means declined assignments do not block exit, and claimable assignments must still be completed before they satisfy threshold checks.

## Legacy ordered-step workflow runtime

The legacy submission-linked workflow runtime still exists and remains active for current production submission flows.

Safe submission runtime endpoints:

- `GET /api/submissions/{id}/workflow/`
- `GET /api/submissions/{id}/workflow/history/`
- `POST /api/submissions/{id}/workflow-action/`
- `POST /api/submissions/{id}/workflow-action/force-advance/`
- `POST /api/submissions/{id}/workflow-action/force-close/`

Legacy task execution endpoints:

- `POST /api/tasks/{id}/claim/`
- `POST /api/tasks/{id}/complete/`
- `POST /api/tasks/{id}/reassign/`

Legacy runtime and graph runtime currently coexist. New graph runtime work does not replace the ordered-step engine yet.

## Workflow validation and versioning notes

- workflow validation runs before publish and activate
- graph validation checks start node presence, terminal nodes, transition integrity, and bound-form integrity
- active definitions are immutable from an operational perspective
- edits to protected definitions create a safe new version

## Tracking

Public tracking:

- `GET /api/track/<reference_number>/`

Internal/owner tracking:

- `GET /api/submissions/{id}/tracking-detail/`

Public tracking is intentionally safe for guests and only returns limited status information.

## Password reset and email verification

- Forgot password: `POST /api/auth/forgot-password/`
- Reset password: `POST /api/auth/reset-password/`
- Verify email: `POST /api/auth/verify-email/`
- Resend verification: `POST /api/auth/resend-verification/`
- Current user: `GET /api/auth/me/`
- MFA setup: `POST /api/auth/mfa/setup/`
- MFA setup confirm: `POST /api/auth/mfa/setup/confirm/`
- MFA challenge verify (login): `POST /api/auth/mfa/verify/`
- MFA challenge resend: `POST /api/auth/mfa/resend/`
- MFA disable start: `POST /api/auth/mfa/disable/start/`
- MFA disable confirm: `POST /api/auth/mfa/disable/`

Frontend pages may read a `token` from the query string and then POST the token in JSON payloads to these endpoints.

## Social auth

Social auth provider discovery and flow:

- `GET /api/auth/social/providers/`
- `POST /api/auth/social/<provider>/start/`
- `POST /api/auth/social/<provider>/complete/`
- `GET /api/auth/social/linked-accounts/`
- `POST /api/auth/social/<provider>/link/`
- `DELETE /api/auth/social/<provider>/link/`

Currently supported provider ids:

- `google`
- `github`
- `microsoft`

`POST /api/auth/social/<provider>/complete/` also returns:

```json
{
  "access": "<jwt-access-token>",
  "refresh": "<jwt-refresh-token>",
  "user": {
    "id": "11111111-1111-1111-1111-111111111111",
    "email": "innovator@example.com",
    "first_name": "Neo",
    "last_name": "Kebadile",
    "phone_number": "",
    "email_verified": true,
    "primary_auth_method": "google",
    "is_staff": false,
    "is_superuser": false,
    "is_admin": false,
    "roles": ["innovator"],
    "profile": {
      "id": "22222222-2222-2222-2222-222222222222",
      "national_id": "",
      "gender": "",
      "date_of_birth": null,
      "region": "",
      "bio": "",
      "sector_interests": [],
      "skills": [],
      "certifications": [],
      "portfolio_url": "",
      "linkedin_url": "",
      "past_participation_summary": ""
    }
  },
  "created": true,
  "linked_existing_account": false,
  "provider": "google"
}
```

## Example graph workflow action payload

```json
{
  "action_key": "approve",
  "comment": "Node requirements satisfied and ready to proceed.",
  "payload_json": {
    "review_note": "Looks good."
  }
}
```

## Example support request payload

```json
{
  "request_type": "technical_support",
  "subject": "Unable to submit my draft",
  "description": "The form saves but submit returns an error.",
  "email": "innovator@example.com",
  "phone_number": "+26771234567"
}
```

## Seed data

Development/demo seed data is available through:

```bash
python manage.py seed_ceda_portal
```

By default the seed command suppresses notification email delivery/output so your terminal is not flooded with console-email messages during development.

If you want to inspect the seeded notification emails, run:

```bash
python manage.py seed_ceda_portal --emit-emails
```

This seed command creates sample programs, forms, workflows, submissions, outcomes, and supporting data. It is suitable for development and staging, not for production environments where sample data is not wanted.

## Notes

- Most endpoints require authentication unless explicitly public.
- Graph workflow builder and graph runtime endpoints are officer/admin oriented unless an endpoint is explicitly assignment-user facing.
- Swagger/ReDoc reflect the live schema generated from serializers and views.
- This guide is intended to match the current backend codebase; when in doubt, prefer the live schema at `/api/schema/`.
