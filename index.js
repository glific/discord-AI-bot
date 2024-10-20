import dotenv from "dotenv";
import DiscordJS, { ActionRowBuilder, ApplicationCommandOptionType, ChannelType, GatewayIntentBits, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, } from "discord.js";
import axios from "axios";
import express from "express";
import { GoogleAuth } from "google-auth-library";
import { google } from "googleapis";
import bodyParser from "body-parser";
import OpenAI from "openai";
import { sleep } from "openai/core";
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
const categoryPrompt = `You are an intelligent AI assistant built by Glific team to help Glific"s team analyze the incoming  queries on Glific"s NGO-support channel on discord. Glific is a chatbot platform and the discord channel for NGOs using the chatbot to share their issues and seek support. You will get NGO query as input, your main purpose is to analyze the query and categorize or tag  the query raised in top 3 most relevant categories and also share your thinking for choosing the most relevant tag in the Reason attribute

Generate the output in following JSON format and don't add any other words apart from the output in the following format

{
"Most relevant tag": "Tag 1",
"2nd most relevant tag": " Tag 2",
"3rd most relevant tag": "Tag 3",
"Reason": " Reason for selecting the tags"
}

Here are a few examples for few NGO queries
Example 1:
{
"Most relevant tag": "Knowledge",
"2nd most relevant tag":"Whatsapp Manager",
"3rd most relevant tag":"",
"Reason":""
}
Example 2: 
{
"Most relevant tag": "Fb verification",
"2nd most relevant tag":"1-1 support",
"3rd most relevant tag":"",
"Reason":"",
}
Example 3: 
{
"Most relevant tag": "Bug",
"2nd most relevant tag":"Profiles",
"3rd most relevant tag":"Not urgent",
"Reason":""
}
`;
const writeDataToSheets = async (question, answer, category, author) => {
    const auth = new GoogleAuth({
        scopes: "https://www.googleapis.com/auth/spreadsheets",
        credentials: {
            client_email: process.env.GCP_CLIENT_EMAIL,
            private_key: process.env.GCP_PRIVATE_KEY?.split("\\n").join("\n"),
        },
    });
    let tag1 = "";
    let tag2 = "";
    let tag3 = "";
    let reason = "";
    try {
        const values = JSON.parse(category);
        tag1 = values["Most relevant tag"];
        tag2 = values["2nd most relevant tag"];
        tag3 = values["3rd most relevant tag"];
        reason = values["Reason"];
    }
    catch (error) { }
    const service = google.sheets({ version: "v4", auth });
    let values = [
        [new Date(), author, question, tag1, tag2, tag3, reason, category, answer],
    ];
    const requestBody = {
        values,
    };
    try {
        const result = await service.spreadsheets.values.append({
            spreadsheetId: process.env.SPREADSHEET_ID || "",
            range: "A:J",
            valueInputOption: "RAW",
            requestBody,
        });
        console.log("%d cells updated.", result.data.updates?.updatedCells);
        return result;
    }
    catch (err) {
        // TODO (Developer) - Handle exception
        throw err;
    }
};
app.post("/chat", async (req, res) => {
    const user_input = req.body.user_input;
    res(getAnswerFromOpenAIAssistant(user_input, ""));
});
const getAnswerFromJugalbandi = async (message, prompt) => {
    const apiUrl = process.env.API_URL;
    const params = {
        uuid_number: process.env.GLIFIC_DOC_UUID || "",
        query_string: encodeURIComponent(message),
        prompt: encodeURIComponent(prompt),
    };
    // Convert the params object into a query string
    const queryParams = new URLSearchParams(params).toString();
    try {
        const result = await axios.get(`${apiUrl}?${queryParams}`, {
            timeout: 120000,
        });
        return result.data.answer;
    }
    catch (e) {
        return "Sorry, I am not able to answer this question due to timeout in API. Please try again later.";
    }
};
const getAnswerFromOpenAIAssistant = async (message, prompt) => {
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        organization: process.env.OPENAI_ORGID,
        // project: process.env.OPENAI_PROJECTID,
    });
    const assistant = await openai.beta.assistants.retrieve(process.env.OPENAI_ASSISTANT_ID || "");
    const thread = await openai.beta.threads.create();
    await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: message,
    });
    try {
        let run = await openai.beta.threads.runs.createAndPoll(thread.id, {
            assistant_id: assistant.id,
        });
        while (run.status !== "completed") {
            if ([
                "requires_action",
                "cancelling",
                "cancelled",
                "failed",
                "incomplete",
                "expired",
            ].includes(run.status)) {
                return "Sorry, I am not able to answer this question due to timeout in API. Please try again later.";
            }
            await sleep(1000);
        }
        const messages = await openai.beta.threads.messages.list(run.thread_id);
        for (const message of messages.data.reverse()) {
            if (message.role === "assistant") {
                return message.content[0].text.value;
            }
        }
        return "Sorry, I am not able to answer this question due to timeout in API. Please try again later.";
    }
    catch (e) {
        return "Sorry, I am not able to answer this question due to timeout in API. Please try again later";
    }
};
const client = new DiscordJS.Client({
    intents: ["Guilds", "GuildMessages", GatewayIntentBits.MessageContent],
});
async function registerCommand() {
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
            console.log(`Registered command: ${command.name}`);
            const command2 = await guild.commands.create({
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
            console.log(`Registered command: ${command.name}`);
        }
    }
    catch (error) {
        console.error("Error registering command:", error);
    }
}
function processStringArray(arr, chunkSize = 10, separator = "\n") {
    const result = [];
    const links = arr.map((ar) => {
        const daysDifference = Math.floor(ar.timeSpanned / (1000 * 60 * 60 * 24));
        const hoursDifference = Math.floor((ar.timeSpanned % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        return `https://discord.com/channels/${process.env.CHANNEL_ID}/${ar.id} => Interaction time: ${daysDifference} days and ${hoursDifference} hours`;
    });
    for (let i = 0; i < links.length; i += chunkSize) {
        const chunk = links.slice(i, i + chunkSize);
        const appendedString = chunk.join(separator);
        result.push(appendedString);
    }
    return result;
}
let noOfDays = "0";
// Event that triggers when a user interacts with a registered command
client.on("interactionCreate", async (interaction) => {
    if (interaction.isStringSelectMenu()) {
        let today = new Date();
        // Create a new date object representing 30 days prior
        let xDaysAgo = new Date(today.getTime()); // Copy the current date
        xDaysAgo.setDate(xDaysAgo.getDate() - parseInt(noOfDays));
        const targetTagId = interaction.values[0];
        const ngoSupportForum = (await client.channels.fetch(process.env.CHANNEL_ID || ""));
        console.log(ngoSupportForum);
        const threads = await Promise.all([
            ngoSupportForum.threads.fetchActive(),
            ngoSupportForum.threads.fetchArchived({ fetchAll: true }),
        ]);
        let collections = new Map();
        threads.forEach((thread) => {
            collections = new Map([...collections, ...thread.threads]);
        });
        const allIDs = [];
        if (targetTagId === "None") {
            for (let [key, value] of collections) {
                if (value.createdTimestamp &&
                    value.appliedTags.length === 0 &&
                    value.createdTimestamp > xDaysAgo.getTime()) {
                    allIDs.push({ id: key, timeSpanned: 0 });
                }
            }
            await interaction.reply(`${allIDs.length} threads have not been tagged in ${noOfDays} days`);
        }
        else {
            await interaction.reply(`Searching...`);
            for (let [key, value] of collections) {
                if (value.createdTimestamp &&
                    value.appliedTags.includes(targetTagId) &&
                    value.createdTimestamp > xDaysAgo.getTime()) {
                    const messages = await value.messages.fetch({ limit: 1 });
                    let lastMessage;
                    for (let [id, message] of messages) {
                        lastMessage = message;
                    }
                    const timeSpanned = (lastMessage?.createdTimestamp || 0) - value.createdTimestamp;
                    allIDs.push({ id: key, timeSpanned: timeSpanned });
                }
            }
            await interaction.channel?.send(`You have ${allIDs.length} threads with this tag within ${noOfDays} days`);
        }
        const finalResult = processStringArray(allIDs);
        finalResult.forEach(async (result) => {
            await interaction.channel?.send(result);
        });
    }
    if (!interaction.isCommand())
        return;
    if (interaction.commandName === "support-metrics") {
        // Join the arguments to form the user's question
        noOfDays = interaction.options.get("days")?.value?.toString() || "0";
        const ngoSupportForum = (await client.channels.fetch(process.env.CHANNEL_ID || ""));
        const availableTags = await ngoSupportForum.availableTags;
        const option = [
            new StringSelectMenuOptionBuilder().setLabel("None").setValue("None"),
        ];
        availableTags.forEach((tag) => {
            option.push(new StringSelectMenuOptionBuilder().setLabel(tag.name).setValue(tag.id));
        });
        const select = new StringSelectMenuBuilder()
            .setCustomId("starter")
            .setPlaceholder("Select a tag to look for")
            .addOptions(option);
        const row = new ActionRowBuilder().addComponents(select);
        const reply = await interaction.reply({
            content: "Choose your tag!",
            components: [row],
        });
    }
    // Handle the askGPT command
    if (interaction.commandName === "askglific") {
        // Join the arguments to form the user's question
        const question = interaction.options.get("question")?.value?.toString();
        if (question) {
            interaction.reply({
                content: `Your question **${question}** is getting processed...`,
                ephemeral: false,
            });
            const answer = await getAnswerFromOpenAIAssistant(question, "");
            await interaction.followUp(answer);
        }
        else {
            interaction.reply("Unable to answer the query");
        }
    }
    if (interaction.commandName === "post") {
        // Join the arguments to form the user's question
        const linkOfPost = interaction.options.get("link")?.value?.toString();
        const role = interaction.guild &&
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
        }
        else {
            interaction.reply("Unable to answer the query");
        }
    }
});
client.on("ready", async () => {
    registerCommand();
});
client.login(process.env.BOT_TOKEN);
client.on("threadCreate", async (thread) => {
    if (thread.parent?.type === ChannelType.GuildForum &&
        thread.parentId === process.env.CHANNEL_ID) {
        const firstMessage = await thread.fetchStarterMessage();
        const message = firstMessage?.content || "";
        const author = firstMessage?.author.username || "";
        thread.sendTyping();
        thread.send("Please note that from the 19th to 27th October, our team will be engaged in an in-person sprint. During this time, responses may be slower than usual. We appreciate your patience and will get back to you as soon as possible. Thank you!");
        const answer = await getAnswerFromOpenAIAssistant(message, "");
        const role = thread.guild.roles.cache.find((role) => role.name === "Glific Support");
        thread.send(answer);
        thread.send(role?.toString() +
            " team please check if this needs any further attention.");
        const category = await getAnswerFromOpenAIAssistant(message, categoryPrompt);
        await writeDataToSheets(message, answer, category, author);
    }
});
