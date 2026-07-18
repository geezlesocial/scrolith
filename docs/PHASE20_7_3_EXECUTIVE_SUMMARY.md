# Phase 20.7.3 — Executive Summary

## Result

**COMPLETE — ROUTING FIXED, TOOLS REMAIN DISABLED**

## Problem

After response recovery (20.7.2), Scrolitha answered with wrong tools and internal boilerplate:

- “Find jobs for me” → employer retention action  
- “Hi” → file upload action  
- Responses included Role/Scope/Route and policy text  

## Cause

Broken skill matching (short-token substrings) + no greeting-first routing + fallback formatter that injected internal context.

## Fix

Intent-first router, safe skill match, user-facing response boundary, golden tests (12/12).

## Deploy

Backend image `p2073-895741d2` (PR #90). Frontend unchanged (p2074). Optional tools stay off.
