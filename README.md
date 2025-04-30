# Drawasaurus AI Chatbot

![Drawasaurus AI Chatbot](https://img.shields.io/badge/Version-3.3-blue.svg)
![License](https://img.shields.io/badge/License-MIT-green.svg)

A powerful and customizable AI chatbot for [Drawasaurus](https://www.drawasaurus.org/) that simulates human conversation with multiple persona options.

## 📋 Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## ✨ Features

- **Multiple Bot Personas**: Choose from a list of different personas with unique personalities or add your own
- **Natural Human-like Responses**: Simulates realistic human-like typing patterns and conversation styles
- **Customizable Response Length**: Control how verbose the bot's responses are
- **Control Panel UI**: User-friendly interface to manage all bot settings
- **Message History**: Navigate through previously sent messages
- **Auto-send Toggle**: Choose whether messages are sent automatically or just populated in the input field and send manually on pressing ENTER key
- **Human Typing Simulation**: Realistic typing delays based on message length
- **Automatic Name Detection**: Detects and blocks its own name in the game to prevent infinite loops

## 🚀 Installation

### Prerequisites

- [Tampermonkey](https://www.tampermonkey.net/) or similar userscript manager
- A web browser (Chrome, Firefox, Edge, etc.)
-  A valid **Groq API key** (required for generating AI responses)

> **Note**: You must obtain your own Groq API key

### Get Your Groq API Key

1. Visit [https://console.groq.com/keys](https://console.groq.com/keys)
2. Log in or create an account
3. Go to the **API Keys** section
4. Click **Create API Key**, name it, and copy the key
5. In the script, find this line:
   ```js
   const GROQ_API_KEY = '<YOUR_API_KEY_HERE>';
6. Replace <YOUR_API_KEY_HERE> with the key you copied (keep it in quotes)

### Steps to Install

1. **Install Tampermonkey**:
   - Visit [Tampermonkey's website](https://www.tampermonkey.net/) and install the extension for your browser

2. **Install the Script**:
   - Click on the Tampermonkey icon in your browser
   - Select "Create a new script"
   - Delete any default code and paste the entire script content from main.js (ensure you've included the API key inside the script)
   - Press Ctrl+S or click on File > Save to save the script

3. **Verify Installation**:
   - Navigate to any Drawasaurus room (e.g., https://www.drawasaurus.org/room/The+Loud+Room)
   - You should see the bot control panel on the left side of the screen

## 🎮 Usage

1. **Join a Drawasaurus Room**:
   - Go to [Drawasaurus](https://www.drawasaurus.org/) and join or create a room

2. **Enable the Bot**:
   - Toggle the "Bot Status" switch in the control panel to enable the bot
   - The status indicator will turn green when active

3. **Choose a Persona**:
   - Select your preferred persona from the dropdown menu
   - Each persona has a unique personality and conversation style

4. **Adjust Settings**:
   - Set response length (Brief, Short, Medium, Long)
   - Toggle auto-send responses on/off
   - Enable/disable human typing simulation

5. **Interact with the Bot**:
   - The bot will automatically respond to messages in the chat
   - Use the up/down arrow keys to navigate through your message history

## ⚙️ Configuration

### Control Panel

The control panel provides easy access to all bot settings:

| Setting | Description |
|---------|-------------|
| **Bot Status** | Enable/disable the bot |
| **Auto-send** | When enabled, messages are automatically sent. When disabled, they're only populated in the input field |
| **Human Typing** | Simulates realistic typing speed based on message length |
| **Bot Persona** | Choose the bot's personality |
| **Response Length** | Control how verbose the bot's responses are |

### Advanced Settings

For advanced users who want to modify the script:

- **Blocked Names**: Edit the `BLOCKED_NAMES` array to add names that should be ignored
- **Rate Limiting**: Adjust `RATE_LIMIT_MS` to control message frequency
- **Typing Speed**: Modify `TYPING_SPEED_WPM` to change the simulated typing speed

## 🔍 Troubleshooting

### Common Issues

- **Bot Not Responding**: Make sure the bot status is enabled (green indicator)
- **API Errors**: Check your internet connection or try refreshing the page
- **Infinite Loops**: Ensure your current username is added to the blocked names list
- **UI Not Loading**: Refresh the page and try again

### Error Handling

The script includes comprehensive error handling:
- API call failures will automatically retry
- Initialization errors will trigger a reinitialize function
- Rate limiting prevents overloading the chat with too many messages

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## ⚠️ Disclaimer

This script is for educational purposes only. Use responsibly and in accordance with Drawasaurus's terms of service. The developer is not responsible for any misuse of this script.
