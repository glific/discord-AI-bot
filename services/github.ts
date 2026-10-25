import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { ThreadChannel } from "discord.js";
import setLogs from "./logs";
import { summarizeThreadForGithub } from "./openai";

const ISSUE_LINK_RE = /https?:\/\/github\.com\/[^\s)]+\/issues\/\d+/i;
const SUPPORT_LABEL = "support";
const SUPPORT_PRIORITY = "P0";

const createOctokit = (): Octokit | null => {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.split("\\n").join("\n");
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;

  if (appId && privateKey && installationId) {
    return new Octokit({
      authStrategy: createAppAuth,
      auth: { appId, privateKey, installationId },
    });
  }

  const token = process.env.GITHUB_TOKEN;
  return token ? new Octokit({ auth: token }) : null;
};

type ProjectFields = {
  organization: {
    projectV2: {
      id: string;
      priority: { id: string; options: { id: string; name: string }[] } | null;
      iteration: {
        id: string;
        configuration: {
          iterations: { id: string; startDate: string; duration: number }[];
        };
      } | null;
    } | null;
  };
};

const findSupportEpicNodeId = async (
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<string | null> => {
  const { search } = await octokit.graphql<{
    search: { nodes: { id: string }[] };
  }>(
    `query($q: String!) {
      search(query: $q, type: ISSUE, first: 1) { nodes { ... on Issue { id } } }
    }`,
    {
      q: `repo:${owner}/${repo} is:issue is:open type:Epic label:${SUPPORT_LABEL} sort:created-desc`,
    },
  );
  return search.nodes[0]?.id ?? null;
};

const findCurrentIterationId = (
  iterations: { id: string; startDate: string; duration: number }[],
): string | null => {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const current = iterations.find((it) => {
    const start = Date.parse(`${it.startDate}T00:00:00Z`);
    return now >= start && now < start + it.duration * day;
  });
  return current?.id ?? null;
};

const addToProjectAsCurrentP0 = async (
  octokit: Octokit,
  owner: string,
  projectNumber: number,
  issueNodeId: string,
): Promise<void> => {
  const { organization } = await octokit.graphql<ProjectFields>(
    `query($owner: String!, $number: Int!) {
      organization(login: $owner) {
        projectV2(number: $number) {
          id
          priority: field(name: "Priority") {
            ... on ProjectV2SingleSelectField { id options { id name } }
          }
          iteration: field(name: "Iteration") {
            ... on ProjectV2IterationField {
              id
              configuration { iterations { id startDate duration } }
            }
          }
        }
      }
    }`,
    { owner, number: projectNumber },
  );
  const project = organization.projectV2;
  if (!project) throw new Error(`Project ${owner}/${projectNumber} not found`);

  const { addProjectV2ItemById } = await octokit.graphql<{
    addProjectV2ItemById: { item: { id: string } };
  }>(
    `mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) { item { id } }
    }`,
    { projectId: project.id, contentId: issueNodeId },
  );
  const itemId = addProjectV2ItemById.item.id;

  const setField = (fieldId: string, value: Record<string, string>) =>
    octokit.graphql(
      `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
        updateProjectV2ItemFieldValue(input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: $value }) {
          projectV2Item { id }
        }
      }`,
      { projectId: project.id, itemId, fieldId, value },
    );

  const p0 = project.priority?.options.find((o) => o.name === SUPPORT_PRIORITY);
  if (project.priority && p0) {
    await setField(project.priority.id, { singleSelectOptionId: p0.id });
  }

  const iterationId = project.iteration
    ? findCurrentIterationId(project.iteration.configuration.iterations)
    : null;
  if (project.iteration && iterationId) {
    await setField(project.iteration.id, { iterationId });
  }
};

const attachToBoard = async (
  octokit: Octokit,
  owner: string,
  repo: string,
  issue: { id: number; node_id: string; number: number },
  threadId: string,
): Promise<void> => {
  try {
    const epicNodeId = await findSupportEpicNodeId(octokit, owner, repo);
    if (epicNodeId) {
      await octokit.graphql(
        `mutation($parent: ID!, $child: ID!) {
          addSubIssue(input: { issueId: $parent, subIssueId: $child }) { issue { id } }
        }`,
        { parent: epicNodeId, child: issue.node_id },
      );
    } else {
      setLogs({ message: "No open support epic found — issue left without parent", threadId });
    }
  } catch (error) {
    setLogs({ message: "Error attaching issue to support epic", error, threadId });
  }

  const projectNumber = Number(process.env.GITHUB_PROJECT_NUMBER);
  if (!projectNumber) return;
  try {
    await addToProjectAsCurrentP0(octokit, owner, projectNumber, issue.node_id);
  } catch (error) {
    setLogs({ message: "Error adding issue to project", error, threadId });
  }
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
`;

export const createGitHubIssueFromThread = async (
  thread: ThreadChannel,
): Promise<void> => {
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  const octokit = createOctokit();

  if (!owner || !repo || !octokit) {
    setLogs({
      message:
        "GitHub env vars missing (GITHUB_REPO_OWNER / GITHUB_REPO_NAME and GITHUB_APP_* or GITHUB_TOKEN) — skipping issue creation",
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

    const { data: issue } = await octokit.issues.create({
      owner,
      repo,
      title: thread.name || "Discord support ticket",
      body: buildIssueBody({
        threadUrl,
        author,
        title: thread.name,
        firstMessage,
        summary,
      }),
      labels: [SUPPORT_LABEL],
    });

    setLogs({
      message: `Created GitHub issue ${issue.html_url}`,
      issueUrl: issue.html_url,
      threadId: thread.id,
    });

    await attachToBoard(octokit, owner, repo, issue, thread.id);

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
