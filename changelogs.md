# Changelog

## 1.1.4
- Added keywords and contributors to the plugin listing.

## 1.1.3
- Security hardening: no more innerHTML (screens are built with a safe DOM parser).
- AI API URL must be HTTPS and asks for confirmation before messages are forwarded to it.

## 1.1.2
- Source code is now open source (MIT license) with a network and privacy section in the readme.

## 1.1.1
- AI API URL bot now accepts GET-style URLs such as https://example.com/api/chat?message= (the user message is added to the URL; {message} also works).
- Reads the answer from many JSON reply shapes (reply, response, answer, text, OpenAI-style choices) or plain text.
