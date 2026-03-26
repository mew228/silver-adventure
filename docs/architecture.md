# Bridgekeeper Architecture

## System Goal

Bridgekeeper exists to let a restricted local AI agent trigger useful actions in external applications without directly possessing sensitive credentials.

## Design Principles

### 1. Keep the model away from raw credentials

The local agent should never hold refresh tokens or broad third-party API secrets.

### 2. Convert access into capabilities

The planning agent asks for specific approved actions instead of unrestricted API access.

### 3. Preserve user control

Every high-sensitivity workflow should support consent, revocation, and clear audit trails.

### 4. Support asynchronous authorization

Some tasks require delayed approval or re-consent. The bridge should handle that without blocking the local runtime indefinitely.

### 5. Minimize returned data

The bridge should transform upstream API responses into the minimum structured result required by the local agent.

## Main Components

### Local restricted agent

Responsibilities:

- interpret user goals,
- decompose tasks,
- request external capabilities,
- present final outputs.

Non-responsibilities:

- storing OAuth tokens,
- refreshing access tokens,
- implementing provider-specific auth flows.

### Bridgekeeper action gateway

Responsibilities:

- map agent intents to capabilities,
- enforce authorization and policy checks,
- call external services through delegated access,
- maintain audit records,
- orchestrate approval flows.

### Auth0 Token Vault layer

Responsibilities:

- manage token storage,
- handle OAuth exchanges,
- support delegated access,
- support reauthorization and step-up flows,
- reduce token exposure to the rest of the system.

## Example Request Lifecycle

1. User asks the local agent to act across multiple services.
2. The local agent creates a plan and identifies required capabilities.
3. The local agent sends a request to Bridgekeeper with task context.
4. Bridgekeeper checks whether valid delegated access exists.
5. If access is missing or insufficient, Bridgekeeper triggers the appropriate Auth0 flow.
6. After authorization, Bridgekeeper executes scoped API operations.
7. Bridgekeeper stores logs and returns a minimized result object.
8. The local agent summarizes or continues the workflow.

## Security Model

### Threat: Local compromise

If the local environment is compromised, the attacker should not automatically obtain long-lived third-party tokens.

### Threat: Over-broad tool use

The local agent may over-request access. Capability checks and approval gates reduce this risk.

### Threat: Unnecessary data exposure

The bridge should filter or summarize responses so the model only receives what it needs.

### Threat: Sensitive action abuse

Step-up authentication and explicit approval flows should protect high-risk actions.

## Suggested Capability Schema

Each capability request can include:

- `user_id`
- `agent_id`
- `capability_name`
- `target_service`
- `justification`
- `requested_scope`
- `risk_level`
- `requires_approval`

## Suggested Audit Log Fields

Each audit record can include:

- `timestamp`
- `user_id`
- `session_id`
- `agent_id`
- `capability_name`
- `provider`
- `scopes_used`
- `action_summary`
- `status`
- `approval_reference`

## MVP Recommendation

For a short hackathon timeline, implement only three connectors and one polished workflow:

- Gmail for reading messages,
- Notion for writing summaries,
- Jira for creating follow-up tasks.

That is enough to demonstrate cross-app orchestration, delegated auth, and user-visible value.
