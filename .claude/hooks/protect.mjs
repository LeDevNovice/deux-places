// Claude Code PreToolUse hook (also usable through DeepSeek Harness' hooks-claude-code bridge).
// Blocks edits to human-owned files and commands that bypass or weaken the gates.
// Exit code 2 = refuse the tool call; the message on stderr goes back to the agent.
let input = "";
for await (const chunk of process.stdin) input += chunk;
const { tool_name: tool, tool_input: args = {} } = JSON.parse(input || "{}");

const OWNED = [/(^|\/)docs\/specs\//, /(^|\/)docs\/rules\.md$/, /(^|\/)docs\/adr\//, /(^|\/)AGENTS\.md$/,
  /(^|\/)CLAUDE\.md$/, /(^|\/)\.agents\//, /(^|\/)\.claude\//, /(^|\/)\.githooks\//, /(^|\/)scripts\/agent\//,
  /(^|\/)tsconfig\.base\.json$/];
const FORBIDDEN_COMMANDS = [
  [/--no-verify\b|git\s+commit\b[^|;&]*\s-n\b/, "bypassing git hooks"],
  [/git\s+push\s+.*(--force|-f\b)/, "force push"],
  [/git\s+(reset\s+--hard|rebase|filter-branch|commit\s+--amend)/, "rewriting history"],
  [/\bDP_(HUMAN|HUMAN_GATE|PLAN_EDIT|ALLOW_TEST_CHANGE)=/, "human-only override variable"],
  [/core\.hooksPath/, "changing the hooks path"],
  [/wrangler\s+(deploy|secret|delete)|wrangler\s+d1\s/, "deploys and secrets are human actions"],
];

const refuse = (why) => {
  console.error(`Refused by .claude/hooks/protect.mjs: ${why}. Stop and report to the human instead (AGENTS.md › Boundaries).`);
  process.exit(2);
};

if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool)) {
  const path = String(args.file_path ?? args.notebook_path ?? "");
  if (OWNED.some((re) => re.test(path))) refuse(`${path} is a human-owned file`);
}
if (tool === "Bash") {
  const command = String(args.command ?? "");
  for (const [re, why] of FORBIDDEN_COMMANDS) if (re.test(command)) refuse(why);
}
process.exit(0);
