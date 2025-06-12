import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  Client,
  ThreadChannel,
} from "discord.js";
import getAnswerFromOpenAIAssistant from "../openai";
import dayjs from "dayjs";
import { updateSheets, writeToSheets } from "../sheet";
import setLogs from "../logs";
import { resolvedTagId, tagIds } from "../../constants";

export async function registerCommand(client: Client) {
  try {
    // Fetch the guild (server) where the bot is connected
    const guild = client.guilds.cache.get(process.env.GUILD_ID || "");

    if (guild) {
      // Create the command
      const command = await guild.commands.create({
        name: "askglific",
        description: "Ask a question to GPT model",
        options: [
          {
            name: "question",
            description: "The question you want to ask",
            type: ApplicationCommandOptionType.String,
            required: true,
          },
        ],
      });

      const postCommand = await guild.commands.create({
        name: "post",
        description: "Share the post link",
        options: [
          {
            name: "link",
            description: "Share the post link",
            type: ApplicationCommandOptionType.String,
            required: true,
          },
        ],
      });

      const closeTicketCommand = await guild.commands.create({
        name: "close-ticket",
        description: "Close the current support ticket",
        options: [
          {
            name: "description",
            description: "Description of the closure",
            type: ApplicationCommandOptionType.String,
            required: false,
          },
        ],
      });
      console.log(
        `Registered commands: ${command.name}, ${closeTicketCommand.name}, ${postCommand.name}`
      );
    }
  } catch (error) {
    console.error("Error registering command:", error);
    setLogs({
      message: "Error registering command",
      error,
    });
  }
}

export const onThreadCreate = async (thread: ThreadChannel) => {
  if (
    thread.parent?.type === ChannelType.GuildForum &&
    thread.parentId === process.env.CHANNEL_ID
  ) {
    const firstMessage = await thread.fetchStarterMessage();
    const threadId = thread.id;
    const title = thread.name;
    const message = firstMessage?.content ?? "";
    const author = firstMessage?.author.username ?? "";
    const createdAt = firstMessage?.createdAt;

    thread.sendTyping();

    const answer = await getAnswerFromOpenAIAssistant(message);
    const role = thread.guild.roles.cache.find(
      (role) => role.name === "Glific Support"
    );

    // Create feedback buttons for AI response
    const feedbackButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ai_helpful_${threadId}`)
        .setEmoji("👍")
        .setLabel("Helpful")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`ai_not_helpful_${threadId}`)
        .setEmoji("👎")
        .setLabel("Not Helpful")
        .setStyle(ButtonStyle.Secondary)
    );

    // Send AI response with feedback buttons
    await thread.send({
      content: answer,
      components: [feedbackButtons],
    });

    thread.send(
      role?.toString() +
        " team please check if this needs any further attention."
    );

    let values = [
      [
        threadId,
        dayjs(createdAt).format("YYYY-MM-DD HH:MM"),
        author,
        title,
        "", //tags
        "", //First Response
        "", //Response time
        "", //Closed at
        "", //Closure Time,
        "", //Description,
        message,
        answer,
      ],
    ];

    await writeToSheets(values);
  }
};

export const onThreadUpdate = async (
  oldThread: ThreadChannel,
  newThread: ThreadChannel
) => {
  if (
    newThread.parent?.type === ChannelType.GuildForum &&
    newThread.parentId === process.env.CHANNEL_ID
  ) {
    let closureTime = "";
    let closedAt = "";

    const oldTags = oldThread.appliedTags;
    const newTags = newThread.appliedTags;

    const removedTags = oldTags.filter((tag) => !newTags.includes(tag));

    const createdTimestamp = (newThread as any)._createdTimestamp;
    const threadId = newThread.id;
    const appliedTagsIds = newThread.appliedTags;

    const appliedTagsNames = appliedTagsIds
      .map((id) => tagIds.find((tag) => tag.id === id)?.name)
      .filter(Boolean);

    if (removedTags.includes(resolvedTagId)) {
      closureTime = "";
      closedAt = "";
    }

    let values: any = {
      Tags: appliedTagsNames.join(", "),
    };

    if (oldTags.length === 0 && newTags.length > 0) {
      values = {
        ...values,
        "First Response": dayjs().format("YYYY-MM-DD HH:MM"),
        "Response time": dayjs().diff(createdTimestamp, "minute").toString(),
      };
    }

    await updateSheets(threadId, values);
  }
};

export const handleAIFeedback = async (interaction: ButtonInteraction) => {
  const customId = interaction.customId;

  const thread = interaction.channel as ThreadChannel;
  const threadId = customId.split("_").pop();
  const isHelpful = customId.startsWith("ai_helpful_");
  const isNotHelpFul = customId.startsWith("ai_not_helpful_");
  const userName = interaction.user.username;

  await interaction.deferReply({ ephemeral: true });

  try {
    const feedbackValues = [
      threadId,
      dayjs(thread.createdAt).format("YYYY-MM-DD HH:MM"),
      userName,
      `${(isHelpful && "Yes") || (isNotHelpFul && "No") || "No response"}`,
    ];

    if (threadId) {
      await updateSheets(threadId, {
        "AI Feedback": `${
          (isHelpful && "Yes") || (isNotHelpFul && "No") || "No response"
        }`,
      });
    }

    // Acknowledge the feedback
    await interaction.editReply({
      content: `Thank you for your feedback! You marked the AI response as ${
        isHelpful ? "helpful" : "not helpful"
      } 👍`,
    });

    // Update the original message to show feedback received
    await interaction.message.edit({
      content: interaction.message.content,
      components: [], // Remove the buttons
    });
  } catch (error) {
    console.error("Error handling AI feedback:", error);
    setLogs({
      message: "Error handling AI feedback",
      error: error,
      threadId: threadId!,
    });

    await interaction.editReply({
      content:
        "❌ There was an error recording your feedback. Please try again.",
    });
  }
};
