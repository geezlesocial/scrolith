# Messaging Group Member Rollback

Rollback targets:

- Frontend: revert the commit containing `SafeMessageText`, `messageLinks`, and `GroupManagePanel` changes.
- Backend: revert the commit containing resolver endpoints and enhanced member add validation.
- Database: no schema rollback required.
- Android: do not publish a new Android build until production web/backend certification completes.

Rollback triggers:

- Message rendering fails.
- Unsafe URL schemes become clickable.
- Internal Scrolith routes reload or lose auth state.
- External links navigate the Android WebView away from Scrolith.
- Group authorization is bypassed.
- Email information is exposed through suggestions.
- Duplicate memberships are created.
- Messaging or group API error rates materially increase.

