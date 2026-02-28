"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { generateReport, deriveInsights } = require("../scripts/report-generator");

describe("report-generator", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ssm-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const baseOpts = () => ({
    matches: [
      { channel: "general", keyword: "bug", text: "Found a bug", user: "U1", ts: "1700100000.000" },
      { channel: "general", keyword: "bug", text: "Another bug", user: "U2", ts: "1700100100.000" },
      { channel: "engineering", keyword: "deploy", text: "Deploy done", user: "U3", ts: "1700100200.000" },
      { channel: "engineering", keyword: "incident", text: "Incident alert", user: "U1", ts: "1700100300.000" },
    ],
    channels: ["general", "engineering"],
    totalMessages: 100,
    lookbackDays: 7,
    titlePrefix: "Test Summary",
    maxExamples: 3,
    outputDir: tmpDir,
  });

  test("generates a report file", () => {
    const reportPath = generateReport(baseOpts());
    expect(fs.existsSync(reportPath)).toBe(true);
    expect(reportPath.endsWith(".md")).toBe(true);
  });

  test("report contains title and sections", () => {
    const reportPath = generateReport(baseOpts());
    const content = fs.readFileSync(reportPath, "utf-8");
    expect(content).toContain("Test Summary");
    expect(content).toContain("## Overview");
    expect(content).toContain("## Keyword Summary");
    expect(content).toContain("## Channel Breakdown");
    expect(content).toContain("## Top Matches");
    expect(content).toContain("## Actionable Insights");
  });

  test("report contains correct stats", () => {
    const reportPath = generateReport(baseOpts());
    const content = fs.readFileSync(reportPath, "utf-8");
    expect(content).toContain("100"); // total messages
    expect(content).toContain("4");  // total matches
  });

  test("keyword table is sorted by frequency", () => {
    const reportPath = generateReport(baseOpts());
    const content = fs.readFileSync(reportPath, "utf-8");
    const bugIdx = content.indexOf("| bug |");
    const deployIdx = content.indexOf("| deploy |");
    expect(bugIdx).toBeLessThan(deployIdx); // bug (2) before deploy (1)
  });

  test("writes matches.json alongside report", () => {
    generateReport(baseOpts());
    const matchesPath = path.join(tmpDir, "matches.json");
    expect(fs.existsSync(matchesPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(matchesPath, "utf-8"));
    expect(data).toHaveLength(4);
  });

  test("handles empty matches", () => {
    const opts = baseOpts();
    opts.matches = [];
    const reportPath = generateReport(opts);
    const content = fs.readFileSync(reportPath, "utf-8");
    expect(content).toContain("No keyword matches found");
  });
});

describe("deriveInsights", () => {
  test("returns insight about most mentioned keyword", () => {
    const sorted = [["bug", 10], ["deploy", 5]];
    const channels = [["general", 8], ["eng", 7]];
    const matches = [
      { keyword: "bug" }, { keyword: "deploy" },
    ];
    const result = deriveInsights(sorted, channels, matches);
    expect(result).toContain('"bug"');
    expect(result).toContain("most mentioned");
  });

  test("flags urgent keywords", () => {
    const sorted = [["incident", 3]];
    const channels = [["general", 3]];
    const matches = [
      { keyword: "incident" },
      { keyword: "incident" },
      { keyword: "incident" },
    ];
    const result = deriveInsights(sorted, channels, matches);
    expect(result).toContain("urgent");
  });

  test("handles no matches", () => {
    const result = deriveInsights([], [], []);
    expect(result).toContain("No keyword matches");
  });
});
