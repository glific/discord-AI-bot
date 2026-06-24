# Discord AI Bot

A comprehensive Discord bot for Glific support with AI-powered responses, ticket management, and analytics tracking.

## 🚀 Features

- **AI-Powered Support**: Automated responses to support questions using OpenAI Assistant
- **Ticket Management**: Complete support ticket lifecycle with closure tracking
- **Rating System**: User feedback collection with thumbs up/down reactions and star ratings
- **Google Sheets Integration**: Automatic logging of tickets, feedback for analytics
- **Metrics & Analytics**: Support performance tracking and reporting

## 📋 Prerequisites

- Node.js (v16 or higher)
- Discord Bot Token
    - Create a new bot in Discord Developer Portal and enabled `Message Content` intent.
    - Install the bot in a test server using Discord Provided Link (You need to be a server admin)
    - After installing limit bot to test channel in Server Settings > Integrations > Bots > Manage
- OpenAI API Key (For first AI Response)
    - You also need to create a new prompt in OpenAI Platform for the assistant response and save id into `OPENAI_PROMPT_ID`
- Google Cloud Service Account (For Google Sheets Integration)
    - Create a new service account and download the JSON key file.
    - Add the service account email to the Google Sheet and grant it `Editor` access.

## 🧪 Testing Locally

### 1. Set up environment variables

```bash
cp .env.example .env
```

Fill in the required values in `.env`:

| Variable | Where to find it |
|---|---|
| `BOT_TOKEN` | [Discord Developer Portal](https://discord.com/developers/applications) → Your App → Bot → Token |
| `GUILD_ID` | Discord → Server Settings → Widget → Server ID (enable Developer Mode first) |
| `CHANNEL_ID` | Right-click the forum channel in Discord → Copy Channel ID |
| `OPENAI_API_KEY` | [OpenAI Platform](https://platform.openai.com/api-keys) |
| `OPENAI_PROMPT_ID` | OpenAI Platform → Assistants → your assistant ID |
| `GCP_CLIENT_EMAIL` | Google Cloud → IAM → Service Accounts → your service account email |
| `GCP_PRIVATE_KEY` | Google Cloud → Service Account → Keys → Add Key (JSON) — copy the `private_key` field |
| `SPREADSHEET_ID` | From the Google Sheet URL: `docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit` |
| `GITHUB_TOKEN` | GitHub → Settings → Developer settings → Personal access tokens (needs `repo` scope) |
| `GITHUB_REPO_OWNER` | GitHub username or org name |
| `GITHUB_REPO_NAME` | Repository name |

`LOG_FLARE_SOURCE` and `LOG_FLARE_API` are optional — the bot runs fine without them.
`GITHUB_*` is optional — the bot runs fine without them.

### 2. Install dependencies

```bash
yarn install
```

### 3. Run in dev mode (hot reload)

```bash
yarn dev
```

The bot will connect to Discord and log `Bot is ready!` when it starts. Slash commands are registered automatically on startup.

### 4. Test a ticket flow

1. Open the configured forum channel in Discord
2. Post a new thread — the bot should reply automatically with an AI response and feedback buttons
3. Use `/close-ticket` inside the thread to close it
4. Check the Google Sheet — the row should populate with timestamps, the conversation transcript, and (after a few seconds) an AI-assigned **Issue Category**

### Troubleshooting

- **Bot doesn't respond to new threads**: confirm `CHANNEL_ID` matches the forum channel, not a text channel
- **Sheet not updating**: verify the service account has **Editor** access to the spreadsheet
- **`Issue Category` column empty**: ensure the `Conversation` and `Issue Category` column headers exist in the "Tickets" sheet tab

## 🤖 Bot Commands

### Slash Commands

- `/askglific <question>` - Ask a question to the AI assistant
- `/post <link>` - Share a social media post with the team
- `/close-ticket [description] [closed-on]` - Close a support ticket
- `/support-metrics <days>` - Get support metrics for specified time period

### Automatic Features

- **Thread Creation**: Automatically responds to new support threads with AI-generated answers
- **Feedback Collection**: Adds reaction buttons for rating AI responses
- **Ticket Closure**: Collects ratings when tickets are closed

## 📊 Analytics & Reporting

The bot automatically tracks:

- Response times
- Closure times
- User satisfaction ratings
- AI response effectiveness
- Support volume metrics

All data is stored in Google Sheets for easy analysis and reporting.
