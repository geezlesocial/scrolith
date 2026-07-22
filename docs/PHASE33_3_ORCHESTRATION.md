# Phase 33.3 — Tool Orchestration

## Allowed internal tools

- search_suggest  
- recommend  
- notification_priority_suggest  
- feed_score_suggest  
- memory_read  
- analytics_snapshot (admin)  

## Forbidden

send_message, publish_post, apply_job, transfer_funds, ban_user, delete_content  

## Policy

`toolOrchestrationEnabled` flag + consent. No external URL fetch.
