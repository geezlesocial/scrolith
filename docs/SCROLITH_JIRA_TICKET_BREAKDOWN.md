# Scrolith Jira-Style Ticket Breakdown

## 1. Purpose

This document translates the implementation backlog into Jira-style epics, stories, and tasks.

It is intentionally execution-oriented and is most detailed for Wave 1.

## 2. Jira Structure

### Epic format

- `SCRO-EPIC-###`

### Story format

- `SCRO-###`

### Subtask format

- `SCRO-###-T#`

## 3. Wave 1 Epics

## SCRO-EPIC-101: Verification and Trust Layer

Goal:

Ship role-based verification badges, trust scores, and the foundation for proof-backed professional trust.

Stories:

### SCRO-101: Add role-based verification badge model

- Type: Story
- Priority: High
- Dependencies: existing user, role, and KYC systems
- Acceptance:
  - badge state is stored and queryable
  - badge classes are role-aware
  - public surfaces render only approved badge types

Subtasks:

- SCRO-101-T1: design verification badge taxonomy
- SCRO-101-T2: extend database model for verification states
- SCRO-101-T3: expose admin review endpoints
- SCRO-101-T4: render badges on profile and card surfaces
- SCRO-101-T5: add admin review UI
- SCRO-101-T6: add analytics for badge approval and revoke events

### SCRO-102: Build delivery and reliability score

- Type: Story
- Priority: High
- Dependencies: orders, contracts, reviews, disputes, messages
- Acceptance:
  - score recomputes from platform behavior
  - score displays on public profile and commerce surfaces
  - admin can edit score weights

Subtasks:

- SCRO-102-T1: define scoring formula
- SCRO-102-T2: add backend aggregate service
- SCRO-102-T3: add admin scoring controls
- SCRO-102-T4: add profile widget
- SCRO-102-T5: add analytics and audit logs

### SCRO-103: Add verified portfolio proof flow

- Type: Story
- Priority: High
- Dependencies: file uploads, profile, moderation
- Acceptance:
  - users can upload proof items
  - admins can verify or reject items
  - public proof state displays correctly

Subtasks:

- SCRO-103-T1: define proof categories
- SCRO-103-T2: add proof database tables
- SCRO-103-T3: add user upload workflow
- SCRO-103-T4: add admin verification queue
- SCRO-103-T5: add public proof widget

## SCRO-EPIC-102: Live and Action Reliability

Goal:

Make high-frequency actions and live behavior stable enough for growth.

Stories:

### SCRO-104: Add live observability and diagnostics

- Type: Story
- Priority: High
- Dependencies: live stack, socket events, admin live module
- Acceptance:
  - admins can inspect live session health
  - session failure reasons are grouped and visible
  - retry patterns are measurable

Subtasks:

- SCRO-104-T1: instrument host and viewer connection states
- SCRO-104-T2: persist live trace records
- SCRO-104-T3: expose diagnostics API
- SCRO-104-T4: add admin live quality dashboard
- SCRO-104-T5: add alert thresholds

### SCRO-105: Make reactions, comments, and writes retry-safe

- Type: Story
- Priority: High
- Dependencies: reactions, comments, Scroll, posts
- Acceptance:
  - retries do not produce duplicate writes
  - action state remains consistent across refresh

Subtasks:

- SCRO-105-T1: add idempotency token model
- SCRO-105-T2: add backend duplicate-write guard
- SCRO-105-T3: add client retry queue
- SCRO-105-T4: add action error telemetry
- SCRO-105-T5: regression test reaction and comment retries

### SCRO-106: Improve media upload resilience

- Type: Story
- Priority: High
- Dependencies: file uploads, stories, posts, comments, Scroll
- Acceptance:
  - uploads fail gracefully
  - users receive actionable error messages
  - admins can monitor failure categories

Subtasks:

- SCRO-106-T1: add upload validation improvements
- SCRO-106-T2: add retry and resume behavior where supported
- SCRO-106-T3: add upload health reporting
- SCRO-106-T4: add admin upload incident view

## SCRO-EPIC-103: Message to Money Workflow

Goal:

Let messaging start structured work.

Stories:

### SCRO-107: Convert message thread to brief

- Type: Story
- Priority: High
- Dependencies: messages, briefs
- Acceptance:
  - user can create a brief from a chat thread
  - chat context prefills the brief

Subtasks:

- SCRO-107-T1: add "Create brief from chat" action
- SCRO-107-T2: map participants and conversation context
- SCRO-107-T3: build brief confirmation modal
- SCRO-107-T4: add conversation-to-brief linkage

### SCRO-108: Convert brief to proposal

- Type: Story
- Priority: High
- Dependencies: briefs, proposals
- Acceptance:
  - proposal creation preserves brief linkage
  - both parties can view progression history

Subtasks:

- SCRO-108-T1: add "Create proposal from brief" action
- SCRO-108-T2: store brief-proposal relation
- SCRO-108-T3: add proposal timeline status
- SCRO-108-T4: add admin proposal policy settings

## SCRO-EPIC-104: Storefront Foundation

Goal:

Turn profile surfaces into commerce-ready destinations.

Stories:

### SCRO-109: Add storefront tab on profiles

- Type: Story
- Priority: High
- Dependencies: profile system, business page model, commerce model
- Acceptance:
  - eligible profiles show storefront tab
  - visitors can browse featured items

Subtasks:

- SCRO-109-T1: define storefront entity
- SCRO-109-T2: add storefront configuration UI
- SCRO-109-T3: add public storefront tab
- SCRO-109-T4: add admin storefront permissions

## SCRO-EPIC-105: Scroll Public Conversation

Goal:

Make Scroll socially deep and publicly interactive.

Stories:

### SCRO-110: Add public threaded Scroll comments

- Type: Story
- Priority: High
- Dependencies: Scroll comment model
- Acceptance:
  - users can comment and reply publicly on Scroll
  - commenter identity is visible
  - moderation state is enforced

Subtasks:

- SCRO-110-T1: finalize Scroll comment data model
- SCRO-110-T2: add Scroll comments API
- SCRO-110-T3: build comments sheet UI
- SCRO-110-T4: add replies and thread nesting
- SCRO-110-T5: connect moderation actions

## 4. Wave 2 Epic Shells

These are not yet decomposed into full subtasks, but should become the next Jira epics.

### SCRO-EPIC-201: Proposal to contract conversion
### SCRO-EPIC-202: Content tagging and storefront merchandising
### SCRO-EPIC-203: Repost with commentary and share attribution
### SCRO-EPIC-204: Affiliate seller campaign setup
### SCRO-EPIC-205: Scroll service and product tags
### SCRO-EPIC-206: Live pinned offers

## 5. Story Template

Use this template when turning backlog items into active Jira stories:

### Summary

One-sentence feature outcome.

### Problem

What user or operator problem is being solved?

### Scope

- included
- excluded

### Dependencies

List direct technical and product dependencies.

### Acceptance Criteria

- criterion 1
- criterion 2
- criterion 3

### Analytics

What events, counters, and dashboards must exist?

### Admin Controls

What operational controls must ship with the feature?

### QA Matrix

- desktop web
- mobile web
- mobile app
- admin dashboard

## 6. Ticket Hygiene Rules

Every Jira story should have:

- owner
- priority
- linked epic
- analytics requirement
- admin control requirement
- rollback or disable strategy
- device QA requirement

## 7. Final Ticketing Rule

Do not start stories that create new user-facing behavior unless the corresponding admin and analytics work is also ticketed.
