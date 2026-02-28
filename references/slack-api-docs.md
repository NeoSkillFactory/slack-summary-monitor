# Slack API Reference for slack-summary-monitor

## Authentication

All API calls require a Bot Token (`xoxb-...`). Set it as the `SLACK_BOT_TOKEN` environment variable.

Required OAuth scopes:
- `channels:history` — read messages from public channels
- `channels:read` — list public channels
- `groups:history` — read messages from private channels (optional)
- `groups:read` — list private channels (optional)

## Endpoints Used

### conversations.list

Lists all channels in a Slack workspace.

```
GET https://slack.com/api/conversations.list
Headers: Authorization: Bearer xoxb-...
Params:
  types: public_channel,private_channel
  limit: 200
  exclude_archived: true
```

Response:
```json
{
  "ok": true,
  "channels": [
    { "id": "C01ABCDEF", "name": "general", "is_channel": true }
  ]
}
```

### conversations.history

Fetches message history for a channel.

```
GET https://slack.com/api/conversations.history
Headers: Authorization: Bearer xoxb-...
Params:
  channel: C01ABCDEF
  oldest: 1700000000  (Unix timestamp)
  latest: 1700604800
  limit: 200
```

Response:
```json
{
  "ok": true,
  "messages": [
    {
      "type": "message",
      "user": "U01ABCDEF",
      "text": "We found a bug in the deploy pipeline",
      "ts": "1700100000.000100"
    }
  ],
  "has_more": false
}
```

### Pagination

When `has_more` is `true`, pass `response_metadata.next_cursor` as the `cursor` parameter to fetch the next page.

## Rate Limits

- Tier 3 methods (conversations.history): ~50 requests per minute
- Tier 2 methods (conversations.list): ~20 requests per minute
- On `429` response, respect the `Retry-After` header.

## Error Handling

Common error codes:
- `not_authed` — Missing or invalid token
- `channel_not_found` — Invalid channel ID
- `invalid_auth` — Token has been revoked
- `ratelimited` — Too many requests; back off and retry
