---
name: "elevenlabs-reception"
description: "[AUDIO] Provision and manage Reception workspaces as a reseller."
---

# reception

> **PREREQUISITE:** Read `../elevenlabs-shared/SKILL.md` for auth, global flags, and output formatting. If missing, run `elevenlabs generate-skills` to create it.

```bash
elevenlabs reception <method> [flags]
```

## API Resources


### assets

 - `create` — Create Asset
 - `delete` — Delete Asset
 - `get` — Get Asset
 - `list` — Get All Assets
 - `update` — Update Asset

### billing

 - `get_invoice` — Get Reseller Invoice
 - `list_invoices` — List Reseller Invoices
 - `list_upcoming_payments` — List Reseller Upcoming Payments

### business-profile

 - `get` — Get Business Profile
 - `update` — Update Business Profile

### holidays

 - `create` — Create Holiday
 - `delete` — Delete Holiday
 - `get` — Get Holiday
 - `list` — Get All Holidays
 - `update` — Update Holiday

### knowledge-sources

 - `add_url` — Add Url Source
 - `delete` — Delete Knowledge Source
 - `get` — Get Knowledge Source
 - `list` — List Knowledge Sources
 - `upload` — Upload Knowledge Source

### locations

 - `create` — Create Location
 - `delete` — Delete Location
 - `get` — Get Location
 - `list` — List Locations
 - `update` — Update Location

### phone-numbers

 - `create` — Assign Phone Number
 - `delete` — Release Phone Number
 - `list` — List Phone Numbers
 - `update` — Move Phone Number

### products

 - `create` — Create Product
 - `delete` — Delete Product
 - `get` — Get Product
 - `list` — Get All Products
 - `update` — Update Product

#### stock

 - `adjust` — Adjust Product Stock
 - `set` — Update Product Stock

### receptionists

 - `activate` — Activate Receptionist
 - `list` — List Receptionists
 - `update` — Update Receptionist

#### procedures

 - `create` — Add Procedure
 - `delete` — Delete Procedure
 - `list` — List Procedures
 - `update` — Update Procedure

#### rules

 - `create` — Add Rule
 - `delete` — Delete Rule
 - `update` — Update Rule

#### transfer-rules

 - `create` — Add Transfer Rule
 - `delete` — Delete Transfer Rule
 - `update` — Update Transfer Rule

### services

 - `confirm_update` — Confirm Service Update
 - `create` — Create Service
 - `delete` — Delete Service
 - `get` — Get Service
 - `list` — Get All Services
 - `update` — Update Service

### staff

 - `create` — Create Staff Member
 - `delete` — Delete Staff Member
 - `get` — Get Staff Member
 - `list` — Get All Staff
 - `update` — Update Staff Member

### subscriptions

 - `assign` — Assign Reseller Tier
 - `cancel_pending_downgrade` — Cancel Reseller Pending Downgrade
 - `change` — Change Reseller Tier
 - `restore` — Restore Reseller Subscription
 - `unassign` — Unassign Reseller Tier

### team


#### invites

 - `cancel` — Cancel Team Invite
 - `create` — Invite Team Member
 - `list` — Get Pending Team Invites

#### members

 - `list` — Get Team Members
 - `remove` — Remove Team Member
 - `update_role` — Update Team Member Role

### tiers

 - `list` — List Reseller Tiers

### workspaces

 - `complete_onboarding` — Complete Reseller Workspace Onboarding
 - `create` — Create Reseller Workspace
 - `list` — List Reseller Workspaces
## Discovering Commands

**Agents: always prefer `--schema` over `--help`** — `--schema` returns JSON; `--help` returns human prose.

```bash
# Machine-readable surface (use this)
elevenlabs reception --schema
elevenlabs reception <method> --schema

# Human-readable help (for humans)
elevenlabs reception --help
```


## Nothing here fits?

`--schema` and `--help` list only what exists. If the user's request cannot be done
with any command, report the gap — it is how missing commands get built:

```bash
elevenlabs feedback missing-capability "<what you needed>"
```
