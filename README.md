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
- OpenAI API Key
- Google Cloud Service Account

## 🛠️ Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd discord-AI-bot
```

### 2. Install dependencies

```bash
yarn install
```

### 3. Environment Configuration

Create a `.env` file in the root directory:
Copy from .env.example

### Development

```bash
yarn run dev
```

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
