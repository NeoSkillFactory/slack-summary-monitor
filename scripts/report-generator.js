#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const TEMPLATE_PATH = path.join(__dirname, "..", "assets", "report-template.md");

/**
 * Generates a markdown report from keyword match data.
 *
 * @param {object} opts
 * @param {object[]} opts.matches - Array of { channel, keyword, text, user, ts }
 * @param {string[]} opts.channels - Channels that were monitored
 * @param {number} opts.totalMessages - Total messages scanned
 * @param {number} opts.lookbackDays - Days covered
 * @param {string} opts.titlePrefix - Report title prefix
 * @param {number} opts.maxExamples - Max example messages per keyword
 * @param {string} opts.outputDir - Directory for the report file
 * @returns {string} Path to the generated report file
 */
function generateReport(opts) {
  const {
    matches,
    channels,
    totalMessages,
    lookbackDays,
    titlePrefix,
    maxExamples,
    outputDir,
  } = opts;

  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - lookbackDays);

  const fmt = (d) => d.toISOString().slice(0, 10);

  // Build keyword frequency map
  const keywordCounts = {};
  const channelCounts = {};
  const keywordExamples = {};

  for (const m of matches) {
    keywordCounts[m.keyword] = (keywordCounts[m.keyword] || 0) + 1;
    channelCounts[m.channel] = (channelCounts[m.channel] || 0) + 1;

    if (!keywordExamples[m.keyword]) keywordExamples[m.keyword] = [];
    if (keywordExamples[m.keyword].length < maxExamples) {
      keywordExamples[m.keyword].push(m);
    }
  }

  // Keyword table
  const sortedKeywords = Object.entries(keywordCounts).sort(
    (a, b) => b[1] - a[1]
  );
  let keywordTable =
    "| Keyword | Mentions | % of Total |\n|---------|----------|------------|\n";
  for (const [kw, count] of sortedKeywords) {
    const pct =
      matches.length > 0 ? ((count / matches.length) * 100).toFixed(1) : "0.0";
    keywordTable += `| ${kw} | ${count} | ${pct}% |\n`;
  }

  // Channel breakdown
  const sortedChannels = Object.entries(channelCounts).sort(
    (a, b) => b[1] - a[1]
  );
  let channelBreakdown = "";
  for (const [ch, count] of sortedChannels) {
    channelBreakdown += `### #${ch}\n- **${count}** keyword matches\n\n`;
  }
  if (!channelBreakdown) {
    channelBreakdown = "No keyword matches found in any channel.\n";
  }

  // Top matches
  let topMatches = "";
  for (const [kw, examples] of Object.entries(keywordExamples)) {
    topMatches += `### "${kw}"\n`;
    for (const ex of examples) {
      const date = new Date(parseFloat(ex.ts) * 1000)
        .toISOString()
        .slice(0, 16)
        .replace("T", " ");
      topMatches += `- **#${ex.channel}** (${date}) — _${ex.user}_: "${ex.text}"\n`;
    }
    topMatches += "\n";
  }
  if (!topMatches) {
    topMatches = "No keyword matches found.\n";
  }

  // Actionable insights
  const insights = deriveInsights(sortedKeywords, sortedChannels, matches);

  // Load template
  let template;
  try {
    template = fs.readFileSync(TEMPLATE_PATH, "utf-8");
  } catch {
    template = "# {{title}}\n\n{{keyword_table}}\n\n{{channel_breakdown}}\n\n{{top_matches}}\n\n{{insights}}";
  }

  const activeChannels = Object.keys(channelCounts).length;
  const report = template
    .replace("{{title}}", `${titlePrefix} — ${fmt(start)} to ${fmt(now)}`)
    .replace("{{start_date}}", fmt(start))
    .replace("{{end_date}}", fmt(now))
    .replace("{{generated_at}}", now.toISOString())
    .replace("{{channels}}", channels.join(", "))
    .replace("{{total_messages}}", String(totalMessages))
    .replace("{{total_matches}}", String(matches.length))
    .replace("{{active_channels}}", String(activeChannels))
    .replace("{{keyword_table}}", keywordTable)
    .replace("{{channel_breakdown}}", channelBreakdown)
    .replace("{{top_matches}}", topMatches)
    .replace("{{insights}}", insights);

  // Write report
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = `slack-summary-${fmt(now)}.md`;
  const reportPath = path.join(outputDir, filename);
  fs.writeFileSync(reportPath, report, "utf-8");

  // Also write raw matches JSON
  const matchesPath = path.join(outputDir, "matches.json");
  fs.writeFileSync(matchesPath, JSON.stringify(matches, null, 2), "utf-8");

  return reportPath;
}

function deriveInsights(sortedKeywords, sortedChannels, matches) {
  const lines = [];

  if (sortedKeywords.length === 0) {
    lines.push(
      "- No keyword matches were found during this period. Consider reviewing your keyword list or expanding the monitored channels."
    );
    return lines.join("\n");
  }

  // Most-mentioned keyword
  const [topKw, topCount] = sortedKeywords[0];
  lines.push(
    `- **"${topKw}"** was the most mentioned keyword with **${topCount}** occurrences. Consider reviewing these discussions for action items.`
  );

  // Busiest channel
  if (sortedChannels.length > 0) {
    const [topCh, chCount] = sortedChannels[0];
    lines.push(
      `- **#${topCh}** had the most keyword activity (**${chCount}** matches). This channel may need closer attention from project managers.`
    );
  }

  // Incident/outage alerts
  const urgentKeywords = ["incident", "outage", "blocker"];
  const urgentMatches = matches.filter((m) =>
    urgentKeywords.includes(m.keyword)
  );
  if (urgentMatches.length > 0) {
    lines.push(
      `- **${urgentMatches.length}** urgent mentions (incident/outage/blocker) detected. Immediate review recommended.`
    );
  }

  // Trend hint
  if (sortedKeywords.length >= 3) {
    const bottom = sortedKeywords[sortedKeywords.length - 1];
    lines.push(
      `- **"${bottom[0]}"** had the fewest mentions (**${bottom[1]}**). Consider whether this keyword is still relevant to track.`
    );
  }

  return lines.join("\n");
}

// CLI entry: node report-generator.js --input matches.json
if (require.main === module) {
  const args = process.argv.slice(2);
  const inputIdx = args.indexOf("--input");
  if (inputIdx === -1 || !args[inputIdx + 1]) {
    console.error("Usage: node report-generator.js --input <matches.json>");
    process.exit(1);
  }

  const inputPath = path.resolve(args[inputIdx + 1]);
  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const yaml = require("js-yaml");
  const configPath = path.join(__dirname, "config.yaml");
  let config;
  try {
    config = yaml.load(fs.readFileSync(configPath, "utf-8"));
  } catch {
    config = {
      slack: { channels: [], keywords: [], lookback_days: 7 },
      report: {
        output_dir: "./output",
        title_prefix: "Weekly Slack Summary",
        max_examples_per_keyword: 5,
      },
    };
  }

  const matches = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const reportPath = generateReport({
    matches,
    channels: config.slack.channels,
    totalMessages: matches.length,
    lookbackDays: config.slack.lookback_days,
    titlePrefix: config.report.title_prefix,
    maxExamples: config.report.max_examples_per_keyword,
    outputDir: path.resolve(path.dirname(configPath), "..", config.report.output_dir),
  });

  console.log(`Report generated: ${reportPath}`);
}

module.exports = { generateReport, deriveInsights };
