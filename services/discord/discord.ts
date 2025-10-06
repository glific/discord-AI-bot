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
import { closeTicketLogic } from "./commands/close";

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

            const supportMetrics = await guild.commands.create({
                name: "support-metrics",
                description: "Share support metrics",
                options: [
                    {
                        name: "days",
                        description: "Number of days to fetch metrics for",
                        type: ApplicationCommandOptionType.String,
                        required: true,
                    },
                ],
            });
            console.log(
                `Registered commands: ${command.name}, ${closeTicketCommand.name}, ${postCommand.name}, ${supportMetrics.name}`,
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
        const userId = firstMessage?.author.id ?? "";
        const createdAt = firstMessage?.createdTimestamp;

        thread.sendTyping();

        const answer = await getAnswerFromOpenAIAssistant(message);
        const role = thread.guild.roles.cache.find(
            (role) => role.name === "Glific Support",
        );

        // Create feedback buttons for AI response
        const feedbackButtons =
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`query_resolved_${threadId}`)
                    .setEmoji("✅")
                    .setLabel("Query Resolved")
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`need_support_${threadId}`)
                    .setEmoji("🆘")
                    .setLabel("Need Support")
                    .setStyle(ButtonStyle.Secondary),
            );

        // Send AI response with feedback buttons
        await thread.send({
            content: `${answer}\n\n**Was this helpful in resolving your query? Or do you need further support?**`,
            components: [feedbackButtons],
        });

        let values = [
            [
                threadId,
                dayjs(createdAt).format("YYYY-MM-DD HH:mm"),
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
    newThread: ThreadChannel,
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

        const createdTimestamp = newThread.createdTimestamp;
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
                "First Response": dayjs().format("YYYY-MM-DD HH:mm"),
                "Response time": dayjs()
                    .diff(createdTimestamp, "minute")
                    .toString(),
            };
        }

        await updateSheets(threadId, values, []);
    }
};

export const handleAIFeedback = async (interaction: ButtonInteraction) => {
    const customId = interaction.customId;
    const thread = interaction.channel as ThreadChannel;
    const threadId = customId.split("_").slice(-1)[0];
    const queryResolved = customId.startsWith("query_resolved_");
    const needSupport = customId.startsWith("need_support_");

    await interaction.reply({
        content: `Recording your feedback...`,
        ephemeral: true,
    });

    try {
        const writeValues = [
            [
                threadId, //thread_id
                dayjs(thread.createdTimestamp).format("YYYY-MM-DD HH:mm"), // Date
                interaction.user.username,
                "", // Title
                "", // Tags
                "", // First Response
                "", // Response time
                "", // Closed at
                "", // Closure Time
                "", // Description
                "", // Post
                "", // AI response,
                `${(queryResolved && "Yes") || (needSupport && "No") || "No response"}`, // AI Feedback,
                "", // Rating
            ],
        ];

        if (threadId) {
            await updateSheets(
                threadId,
                {
                    "AI Feedback": `${
                        (queryResolved && "Yes") ||
                        (needSupport && "No") ||
                        "No response"
                    }`,
                },
                writeValues,
            );
        }

        if (queryResolved) {
            await interaction.editReply({
                content: `Thanks for your feedback! Query marked as resolved ✅`,
            });

            await thread.send(
                `Great, thanks <@${interaction.user.id}>! I'll close this ticket now.\nIf anything changes, just reply here to reopen.`,
            );

            // close the ticket when query is resolved
            await closeTicketLogic(
                thread,
                "Closed via AI feedback - Query resolved",
                dayjs().format("YYYY-MM-DD HH:mm"),
                interaction.user.id,
            );
        } else if (needSupport) {
            const role = thread.guild.roles.cache.find(
                (role) => role.name === "Glific Support",
            );
            await thread.send(
                `Thanks for letting us know! ${role?.toString()} has been notified and will assist you shortly.`,
            );
        }

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
