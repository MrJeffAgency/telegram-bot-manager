# Telegram Bot Manager

Manage up to **7 Telegram bots** from inside Acode. The plugin owner is **MrJeffAgency**.

- Command palette -> **Telegram Bots: Open**
- Choose a bot type when adding each bot, then enter its Telegram bot token from @BotFather.
- **Telegram commands / replies** keeps the original feature: edit commands, descriptions, and auto-reply text; **Save to Telegram** publishes the command menu (`setMyCommands`).
- **Google AI (Gemini)** needs the Telegram bot token and a Google AI API key. It uses the Gemini 2.5 Flash model and answers ordinary text messages.
- **AI API URL** needs the Telegram bot token and an HTTP(S) URL for an OpenAI-compatible Chat Completions endpoint. It sends `model: gpt-4o-mini` and does not request a separate API key.
- **Start** runs the bot using long polling while Acode is open. AI bots answer ordinary text; slash commands can still use configured command replies.
- Reply placeholders for command replies: `{first_name}`, `{username}`.

Telegram tokens and the Google AI key are stored locally on your device. Keep them private. The custom API URL mode sends requests directly to the URL you enter; use a trusted HTTPS endpoint. The API URL must support the OpenAI-compatible `POST /chat/completions` request and return a `choices[0].message.content` response (or a compatible text response).

## Settings

Plugin settings include auto-start, a default reply for unknown commands, and seven Telegram token slots (Bot token 1-7). Add or configure AI-provider credentials from **Telegram Bots: Open**.

## AI API URL
Paste a URL ending in `?message=` (or containing `{message}`) and the message is added as a GET request, e.g. `https://example.com/api/chat?message=`. Any other URL gets a JSON POST.

## Open source
Source code: https://github.com/MrJeffAgency/telegram-bot-manager

`main.js` is plain, readable JavaScript (no build step, no minification, no obfuscation). License: MIT.

## Network and privacy (what this plugin connects to)
The plugin only makes requests you trigger by adding and running a bot:
- `https://api.telegram.org` - Telegram Bot API, using the bot tokens you enter.
- `https://generativelanguage.googleapis.com` - Google AI (Gemini), only if you add a Google AI bot with your own API key.
- The AI API URL you enter yourself, only if you add an AI API URL bot. Messages sent to that bot are forwarded to that URL.

Data handling:
- Bot tokens, API keys, URLs and commands are stored locally on your device (Acode's local storage). They are not sent anywhere except to the services above.
- No analytics, no tracking, no remote code loading, no `eval`, no telemetry.
- Bots only run while Acode is open.

## Security notes
- Anyone with a bot token controls that bot. Keep tokens private and revoke them in @BotFather if exposed.
- Only add AI API URLs you trust, because user messages are sent to them.
