"use strict";

const path = require("path");
const fs = require("fs");
const os = require("os");

// We need to set up the config before requiring the module
const CONFIG_PATH = path.join(__dirname, "..", "scripts", "config.yaml");

describe("slack-monitor", () => {
  let slackMonitor;

  beforeAll(() => {
    // Ensure config.yaml exists for loadConfig
    expect(fs.existsSync(CONFIG_PATH)).toBe(true);
    slackMonitor = require("../scripts/slack-monitor");
  });

  describe("loadConfig", () => {
    test("loads and validates configuration", () => {
      const config = slackMonitor.loadConfig();
      expect(config.slack.channels).toBeInstanceOf(Array);
      expect(config.slack.channels.length).toBeGreaterThan(0);
      expect(config.slack.keywords).toBeInstanceOf(Array);
      expect(config.slack.keywords.length).toBeGreaterThan(0);
      expect(config.slack.lookback_days).toBe(7);
      expect(config.report.output_dir).toBeDefined();
      expect(config.report.title_prefix).toBeDefined();
    });
  });

  describe("findKeywordMatches", () => {
    test("finds keyword matches in messages", () => {
      const messages = [
        { text: "We found a bug in production", user: "U1", ts: "1700100000.000" },
        { text: "Deploy was successful", user: "U2", ts: "1700100100.000" },
        { text: "No issues here", user: "U3", ts: "1700100200.000" },
      ];
      const keywords = ["bug", "deploy"];
      const matches = slackMonitor.findKeywordMatches(messages, keywords, "general");
      expect(matches).toHaveLength(2);
      expect(matches[0].keyword).toBe("bug");
      expect(matches[0].channel).toBe("general");
      expect(matches[1].keyword).toBe("deploy");
    });

    test("is case-insensitive", () => {
      const messages = [
        { text: "BUG found in Deploy", user: "U1", ts: "1700100000.000" },
      ];
      const keywords = ["bug", "deploy"];
      const matches = slackMonitor.findKeywordMatches(messages, keywords, "eng");
      expect(matches).toHaveLength(2);
    });

    test("handles messages without text", () => {
      const messages = [
        { user: "U1", ts: "1700100000.000" },
        { text: "", user: "U2", ts: "1700100100.000" },
        { text: "bug report", user: "U3", ts: "1700100200.000" },
      ];
      const keywords = ["bug"];
      const matches = slackMonitor.findKeywordMatches(messages, keywords, "general");
      expect(matches).toHaveLength(1);
    });

    test("truncates long messages", () => {
      const longText = "bug " + "x".repeat(300);
      const messages = [
        { text: longText, user: "U1", ts: "1700100000.000" },
      ];
      const keywords = ["bug"];
      const matches = slackMonitor.findKeywordMatches(messages, keywords, "general");
      expect(matches[0].text.length).toBeLessThanOrEqual(201);
    });
  });

  describe("generateDemoData", () => {
    test("generates demo data with matches", () => {
      const config = slackMonitor.loadConfig();
      const result = slackMonitor.generateDemoData(config);
      expect(result.matches).toBeInstanceOf(Array);
      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.totalMessages).toBeGreaterThan(0);
    });

    test("demo matches have required fields", () => {
      const config = slackMonitor.loadConfig();
      const result = slackMonitor.generateDemoData(config);
      for (const m of result.matches) {
        expect(m).toHaveProperty("channel");
        expect(m).toHaveProperty("keyword");
        expect(m).toHaveProperty("text");
        expect(m).toHaveProperty("user");
        expect(m).toHaveProperty("ts");
      }
    });

    test("demo channels match config", () => {
      const config = slackMonitor.loadConfig();
      const result = slackMonitor.generateDemoData(config);
      const channelSet = new Set(result.matches.map((m) => m.channel));
      for (const ch of channelSet) {
        expect(config.slack.channels).toContain(ch);
      }
    });
  });
});
