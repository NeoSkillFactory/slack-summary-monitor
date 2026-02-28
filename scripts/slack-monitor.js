#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { WebClient } = require("@slack/web-api");
const { generateReport } = require("./report-generator");

const CONFIG_PATH = path.join(__dirname, "config.yaml");
const PROJECT_ROOT = path.join(__dirname, "..");

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`Config not found at ${CONFIG_PATH}. Run "init" first.`);
    process.exit(1);
  }
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  const config = yaml.load(raw);

  if (
    !config.slack ||
    !Array.isArray(config.slack.channels) ||
    config.slack.channels.length === 0
  ) {
    console.error("Config error: slack.channels must be a non-empty array.");
    process.exit(1);
  }
  if (
    !Array.isArray(config.slack.keywords) ||
    config.slack.keywords.length === 0
  ) {
    console.error("Config error: slack.keywords must be a non-empty array.");
    process.exit(1);
  }

  config.slack.lookback_days = config.slack.lookback_days || 7;
  config.report = config.report || {};
  config.report.output_dir = config.report.output_dir || "./output";
  config.report.title_prefix =
    config.report.title_prefix || "Weekly Slack Summary";
  config.report.max_examples_per_keyword =
    config.report.max_examples_per_keyword || 5;

  return config;
}

// ── Init command ─────────────────────────────────────────────────────────────

function initConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    console.log(`Config already exists at ${CONFIG_PATH}`);
    return;
  }
  const examplePath = path.join(PROJECT_ROOT, "assets", "example-config.yaml");
  if (fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, CONFIG_PATH);
    console.log(`Config created at ${CONFIG_PATH} (from example).`);
  } else {
    const defaultConfig = {
      slack: {
        channels: ["general"],
        keywords: ["bug", "deploy", "incident"],
        lookback_days: 7,
      },
      report: {
        output_dir: "./output",
        title_prefix: "Weekly Slack Summary",
        max_examples_per_keyword: 5,
      },
    };
    fs.writeFileSync(CONFIG_PATH, yaml.dump(defaultConfig), "utf-8");
    console.log(`Default config created at ${CONFIG_PATH}.`);
  }
}

// ── Slack API helpers ────────────────────────────────────────────────────────

async function resolveChannelIds(client, channelNames) {
  const mapping = {};
  let cursor;
  do {
    const res = await client.conversations.list({
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 200,
      cursor,
    });
    if (!res.ok) throw new Error(`conversations.list failed: ${res.error}`);
    for (const ch of res.channels) {
      if (channelNames.includes(ch.name)) {
        mapping[ch.name] = ch.id;
      }
    }
    cursor = res.response_metadata && res.response_metadata.next_cursor;
  } while (cursor);

  return mapping;
}

async function fetchMessages(client, channelId, oldest) {
  const messages = [];
  let cursor;
  do {
    const res = await client.conversations.history({
      channel: channelId,
      oldest: String(oldest),
      limit: 200,
      cursor,
    });
    if (!res.ok) throw new Error(`conversations.history failed: ${res.error}`);
    messages.push(...res.messages);
    cursor = res.response_metadata && res.response_metadata.next_cursor;
  } while (cursor);
  return messages;
}

function findKeywordMatches(messages, keywords, channelName) {
  const matches = [];
  for (const msg of messages) {
    if (!msg.text) continue;
    const lower = msg.text.toLowerCase();
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        matches.push({
          channel: channelName,
          keyword: kw.toLowerCase(),
          text:
            msg.text.length > 200 ? msg.text.slice(0, 200) + "…" : msg.text,
          user: msg.user || "unknown",
          ts: msg.ts,
        });
      }
    }
  }
  return matches;
}

// ── Demo data ────────────────────────────────────────────────────────────────

function generateDemoData(config) {
  const now = Date.now() / 1000;
  const daySeconds = 86400;
  const channels = config.slack.channels;
  const keywords = config.slack.keywords;

  const sampleMessages = [
    "We found a bug in the authentication module that needs fixing ASAP",
    "Deploy to staging was successful, moving to production next",
    "Incident reported: database connection pool exhausted",
    "New release v2.3.1 is ready for QA review",
    "Outage detected on the payment service — investigating now",
    "This is a blocker for the upcoming sprint, needs priority",
    "Bug fix merged, ready for deploy",
    "Release notes have been updated for the latest version",
    "Minor incident with the CDN, resolved within 5 minutes",
    "Deploy pipeline failed due to flaky test — rerunning",
    "Blocker removed after discussion with the platform team",
    "Outage postmortem scheduled for Friday",
    "Found a bug in the search indexer, creating a ticket",
    "Hotfix deploy completed successfully",
    "No incidents this week — great job team!",
    "Planning the next release cycle, feedback welcome",
    "The checkout flow has a bug on mobile devices",
    "Preparing for the deploy window tomorrow morning",
    "Sprint retrospective: 2 blockers identified",
    "Release candidate is passing all integration tests",
  ];

  const users = ["U_alice", "U_bob", "U_carol", "U_dave", "U_eve"];
  const matches = [];
  let totalMessages = 0;

  for (const ch of channels) {
    const msgCount = 20 + Math.floor(Math.random() * 30);
    totalMessages += msgCount;
    for (let i = 0; i < msgCount; i++) {
      const text =
        sampleMessages[Math.floor(Math.random() * sampleMessages.length)];
      const lower = text.toLowerCase();
      for (const kw of keywords) {
        if (lower.includes(kw.toLowerCase())) {
          const ts = now - Math.random() * config.slack.lookback_days * daySeconds;
          matches.push({
            channel: ch,
            keyword: kw.toLowerCase(),
            text,
            user: users[Math.floor(Math.random() * users.length)],
            ts: String(ts),
          });
        }
      }
    }
  }

  return { matches, totalMessages };
}

// ── Run command ──────────────────────────────────────────────────────────────

async function run(demoMode) {
  const config = loadConfig();

  let allMatches = [];
  let totalMessages = 0;

  if (demoMode) {
    console.log("Running in demo mode with synthetic data…");
    const demo = generateDemoData(config);
    allMatches = demo.matches;
    totalMessages = demo.totalMessages;
  } else {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) {
      console.error(
        "Error: SLACK_BOT_TOKEN environment variable is not set.\n" +
          "Hint: Run with --demo for a demonstration without a real token."
      );
      process.exit(1);
    }

    const client = new WebClient(token);

    console.log("Resolving channel IDs…");
    const channelMap = await resolveChannelIds(client, config.slack.channels);
    const resolved = Object.keys(channelMap);
    const missing = config.slack.channels.filter((c) => !channelMap[c]);
    if (missing.length > 0) {
      console.warn(`Warning: channels not found: ${missing.join(", ")}`);
    }
    if (resolved.length === 0) {
      console.error("Error: No configured channels found in the workspace.");
      process.exit(1);
    }

    const oldest =
      Date.now() / 1000 - config.slack.lookback_days * 86400;

    for (const chName of resolved) {
      console.log(`Fetching messages from #${chName}…`);
      try {
        const messages = await fetchMessages(client, channelMap[chName], oldest);
        totalMessages += messages.length;
        const matches = findKeywordMatches(
          messages,
          config.slack.keywords,
          chName
        );
        allMatches.push(...matches);
        console.log(
          `  #${chName}: ${messages.length} messages, ${matches.length} keyword matches`
        );
      } catch (err) {
        console.error(`  Error fetching #${chName}: ${err.message}`);
      }
    }
  }

  console.log(
    `\nTotal: ${totalMessages} messages scanned, ${allMatches.length} keyword matches found.`
  );

  const outputDir = path.resolve(PROJECT_ROOT, config.report.output_dir);
  const reportPath = generateReport({
    matches: allMatches,
    channels: config.slack.channels,
    totalMessages,
    lookbackDays: config.slack.lookback_days,
    titlePrefix: config.report.title_prefix,
    maxExamples: config.report.max_examples_per_keyword,
    outputDir,
  });

  console.log(`Report saved to: ${reportPath}`);
}

// ── CLI ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "run";

  switch (command) {
    case "init":
      initConfig();
      break;
    case "run": {
      const demoMode = args.includes("--demo");
      await run(demoMode);
      break;
    }
    default:
      console.error(
        `Unknown command: ${command}\nUsage: slack-monitor.js <init|run> [--demo]`
      );
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  loadConfig,
  initConfig,
  resolveChannelIds,
  fetchMessages,
  findKeywordMatches,
  generateDemoData,
};
