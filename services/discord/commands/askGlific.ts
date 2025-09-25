import { ChatInputCommandInteraction, Interaction } from "discord.js";
import getAnswerFromOpenAIAssistant from "../../openai";

export const askGlific = async (interaction: ChatInputCommandInteraction) => {
  const question = interaction.options.get("question")?.value?.toString();
  if (question) {
    interaction.reply({
      content: `Your question **${question}** is getting processed...`,
      ephemeral: false,
    });

    const answer = await getAnswerFromOpenAIAssistant(question);
    await interaction.followUp(answer);
  } else {
    interaction.reply("Unable to answer the query");
  }
};
