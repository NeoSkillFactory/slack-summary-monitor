---
name: slack-summary-monitor
description: Automatically monitors Slack channels for keywords and generates weekly summary reports with actionable insights.
version: 1.0.0
author: openclaw
tags:
  - slack
  - monitoring
  - reports
  - automation
---

# SLACK-SUMMARY-MONITOR

Automates monitoring of Slack channels for keywords and generates weekly actionable summaries.

## Core Capabilities

- Monitor multiple Slack channels for specific keywords
- Generate weekly summary reports with actionable insights
- Provide clean CLI interface for direct use
- Integrate with agent workflows
- Handle errors gracefully and exit non-zero on failure

## Out of Scope

- Real-time message processing (focus on weekly summaries)
- Advanced sentiment analysis
- Integration with non-Slack platforms
- Custom report formatting beyond standard templates
- User authentication management

## Trigger Scenarios

- "I need a weekly summary of discussions in our Slack channels"
- "Monitor our team Slack for mentions of 'bug' and create a weekly report"
- "Generate insights from our Slack channel discussions weekly"
- "Create a weekly report of keyword mentions in our Slack workspace"

## Required Resources

- `scripts/` — Main implementation files for monitoring and reporting logic
- `references/` — Slack API documentation, examples, and integration patterns
- `assets/` — Report templates and configuration files for customization

## Acceptance Criteria

- Skill triggers correctly when users ask about Slack monitoring
- Scripts run end-to-end without errors on a real-world example
- Output is immediately useful without manual editing
- Successfully monitors multiple Slack channels for specified keywords
- Generates weekly reports with actionable insights
- Handles Slack API errors gracefully
- Provides clear CLI interface for configuration and execution
