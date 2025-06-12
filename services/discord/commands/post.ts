import { ChatInputCommandInteraction } from "discord.js";

export const post = async (interaction: ChatInputCommandInteraction) => {
  const linkOfPost = interaction.options.get("link")?.value?.toString();
  const role =
    interaction.guild &&
    interaction.guild.roles.cache.find((role) => role.name === "Glific Team");
  const roleName = role ? role.toString() : "team";
  if (linkOfPost) {
    const messagesArray = [
      `${roleName}, just a quick heads up! It would be awesome if you could hop onto LinkedIn and give a like, share, and comment on our latest post. Here's our latest post: ${linkOfPost} It'll help us reach a wider audience. Thanks a bunch! 🚀`,
      `Hey ${roleName}, Show some love on LinkedIn by engaging with our latest post. Every like, share, and comment helps! Here's our latest post: ${linkOfPost}`,
      `Quick favor, ${roleName}! Could you support our LinkedIn efforts by liking, sharing, and commenting on our recent post? Here's our latest post: ${linkOfPost}`,
      `Hi ${roleName}, we could use your help in spreading the word on LinkedIn. Please give our latest post a thumbs up, share, and drop a comment if you can! Here's our latest post: ${linkOfPost}`,
      `${roleName}, let's give our LinkedIn post a little boost! Can you all like, share, and comment to help increase its visibility? Here's our latest post: ${linkOfPost}`,
      `Hey ${roleName}, hoping you can lend a hand in amplifying our LinkedIn presence. Please engage with our recent post by liking, sharing, and commenting! Here's our latest post: ${linkOfPost}`,
      `Quick request, ${roleName}! Could you take a moment to engage with our LinkedIn post? Likes, shares, and comments all appreciated! Here's our latest post: ${linkOfPost}`,
      `Hey there, ${roleName}! Looking to increase our LinkedIn reach. Could you support by liking, sharing, and commenting on our latest post? Here's our latest post: ${linkOfPost}`,
      `${roleName}, let's work together to boost our LinkedIn visibility! Please engage with our recent post by liking, sharing, and commenting. Here's our latest post: ${linkOfPost}`,
      `Hi ${roleName}, aiming to make a bigger impact on LinkedIn. Would you mind giving our recent post some love with likes, shares, and comments? Here's our latest post: ${linkOfPost}`,
    ];
    const random = Math.floor(Math.random() * 11);

    interaction.reply({
      content: messagesArray[random],
      ephemeral: false,
    });
  } else {
    interaction.reply("Unable to answer the query");
  }
};
