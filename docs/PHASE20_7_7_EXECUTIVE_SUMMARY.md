# Phase 20.7.7 — Executive Summary

## Problem

Media-only DMs appeared in-thread but inbox showed **“No messages”**.

## Cause

Preview pipeline used only `message.text`, treating empty body as empty conversation.

## Fix

Shared attachment-aware last-message formatter on backend and frontend; wired into inbox DTO, merge, normalize, dock, Messages, sockets, and delete/edit stored previews.

## Result

Inbox and Messaging Dock show **Image / Video / PDF document / …** for media-only latest messages. **No messages** only when truly empty.
