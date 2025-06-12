import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  Client,
  ForumChannel,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
  ThreadChannel,
} from "discord.js";
import { processStringArray } from "../../../constants";

export const supportMetrics = async (
  noOfDays: string,
  interaction: ChatInputCommandInteraction,
  client: Client
) => {
  noOfDays = interaction.options.get("days")?.value?.toString() || "0";

  const ngoSupportForum = (await client.channels.fetch(
    process.env.CHANNEL_ID || ""
  )) as ForumChannel;

  const availableTags = await ngoSupportForum.availableTags;

  const option: StringSelectMenuOptionBuilder[] = [
    new StringSelectMenuOptionBuilder().setLabel("None").setValue("None"),
  ];
  availableTags.forEach((tag) => {
    option.push(
      new StringSelectMenuOptionBuilder().setLabel(tag.name).setValue(tag.id)
    );
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId("starter")
    .setPlaceholder("Select a tag to look for")
    .addOptions(option);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    select
  );

  const reply = await interaction.reply({
    content: "Choose your tag!",
    components: [row],
  });
};

export const selectString = async (
  noOfDays: string,
  interaction: StringSelectMenuInteraction,
  client: Client
) => {
  let today = new Date();

  // Create a new date object representing 30 days prior
  let xDaysAgo = new Date(today.getTime()); // Copy the current date
  xDaysAgo.setDate(xDaysAgo.getDate() - parseInt(noOfDays));
  const targetTagId = interaction.values[0];

  const ngoSupportForum = (await client.channels.fetch(
    process.env.CHANNEL_ID || ""
  )) as ForumChannel;

  const threads = await Promise.all([
    ngoSupportForum.threads.fetchActive(),
    ngoSupportForum.threads.fetchArchived({ fetchAll: true }),
  ]);

  let collections = new Map<string, ThreadChannel>();

  threads.forEach((thread) => {
    collections = new Map([...collections, ...thread.threads]);
  });
  const allIDs: Array<{ id: string; timeSpanned: number }> = [];
  if (targetTagId === "None") {
    for (let [key, value] of collections) {
      if (
        value.createdTimestamp &&
        value.appliedTags.length === 0 &&
        value.createdTimestamp > xDaysAgo.getTime()
      ) {
        allIDs.push({ id: key, timeSpanned: 0 });
      }
    }
    await interaction.reply(
      `${allIDs.length} threads have not been tagged in ${noOfDays} days`
    );
  } else {
    await interaction.reply(`Searching...`);
    for (let [key, value] of collections) {
      if (
        value.createdTimestamp &&
        value.appliedTags.includes(targetTagId) &&
        value.createdTimestamp > xDaysAgo.getTime()
      ) {
        const messages = await value.messages.fetch({ limit: 1 });
        let lastMessage;

        for (let [id, message] of messages) {
          lastMessage = message;
        }

        const timeSpanned =
          (lastMessage?.createdTimestamp || 0) - value.createdTimestamp;
        allIDs.push({ id: key, timeSpanned: timeSpanned });
      }
    }
    await interaction.channel?.send(
      `You have ${allIDs.length} threads with this tag within ${noOfDays} days`
    );
  }

  const finalResult = processStringArray(allIDs);

  finalResult.forEach(async (result) => {
    await interaction.channel?.send(result);
  });
};
