import { Octokit } from "@octokit/rest";
import { ThreadChannel } from "discord.js";
import setLogs from "./logs";
import { summarizeThreadForGithub } from "./openai";
import { getForumTags } from "../constants";

const ISSUE_LINK_RE = /https?:\/\/github\.com\/[^\s)]+\/issues\/\d+/i;
const PRIORITY_TAG_RE = /^Priority\s+([0-4])$/i;

const getPriorityLabel = (thread: ThreadChannel): string | null => {
  const tags = getForumTags(thread.client);
  for (const id of thread.appliedTags) {
    const name = tags.find((t) => t.id === id)?.name ?? "";
    const match = name.match(PRIORITY_TAG_RE);
    if (match) return `P${match[1]}`;
  }
  return null;
};

const buildTranscript = async (thread: ThreadChannel): Promise<string> => {
  const messages = await thread.messages.fetch({ limit: 100 });
  return Array.from(messages.values())
    .reverse()
    .filter((m) => m.content?.trim())
    .map(
      (m) =>
        `**${m.author.username}${m.author.bot ? " (bot)" : ""}:** ${m.content}`,
    )
    .join("\n\n");
};

const buildIssueBody = (params: {
  threadUrl: string;
  author: string;
  title: string;
  firstMessage: string;
  transcript: string;
  summary: string;
}) =>
  `## Summary
${params.summary}

## Source
- **Discord thread:** ${params.threadUrl}
- **Reported by:** ${params.author}
- **Title:** ${params.title}

## Original message
${params.firstMessage || "_(no starter message content)_"}

<details>
<summary>Full thread transcript</summary>

${params.transcript}

</details>
`;

export const createGitHubIssueFromThread = async (
  thread: ThreadChannel,
): Promise<void> => {
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  const token = process.env.GITHUB_TOKEN;

  if (!owner || !repo || !token) {
    setLogs({
      message:
        "GitHub env vars missing (GITHUB_REPO_OWNER / GITHUB_REPO_NAME / GITHUB_TOKEN) — skipping issue creation",
      threadId: thread.id,
    });
    return;
  }

  try {
    const recent = await thread.messages.fetch({ limit: 50 });
    const alreadyPosted = recent.find(
      (m) => m.author.bot && ISSUE_LINK_RE.test(m.content || ""),
    );
    if (alreadyPosted) return;

    const starter = await thread.fetchStarterMessage().catch(() => null);
    const firstMessage = starter?.content ?? "";
    const author = starter?.author.username ?? thread.ownerId ?? "unknown";

    const transcript = await buildTranscript(thread);
    const summary = await summarizeThreadForGithub(
      `Title: ${thread.name}\n\n${transcript}`,
    );

    const threadUrl = `https://discord.com/channels/${process.env.GUILD_ID}/${thread.id}`;
    const octokit = new Octokit({ auth: token });

    const priorityLabel = getPriorityLabel(thread);
    const labels = ["support", ...(priorityLabel ? [priorityLabel] : [])];

    const { data: issue } = await octokit.issues.create({
      owner,
      repo,
      title: thread.name || "Discord support ticket",
      body: buildIssueBody({
        threadUrl,
        author,
        title: thread.name,
        firstMessage,
        transcript,
        summary,
      }),
      labels,
    });

    await thread.send(
      `🛠️ A GitHub issue has been created for this ticket: ${issue.html_url}`,
    );
  } catch (error) {
    console.error("Error creating GitHub issue:", error);
    setLogs({
      message: "Error creating GitHub issue",
      error,
      threadId: thread.id,
    });
    try {
      await thread.send(
        "⚠️ Failed to create a GitHub issue automatically. Please create one manually.",
      );
    } catch {
      // best-effort notification only
    }
  }
};
