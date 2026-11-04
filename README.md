# AI MP3 Tag Editor

A Windows desktop app for reviewing and editing local MP3 ID3 metadata with help from Google Gemini.

## Features in this MVP

- Choose a local folder (recursive scan) or select individual MP3 files.
- Read existing ID3 metadata and basic file information.
- Ask Gemini to suggest title, artist, album, album artist, genre, year, track, composer and comment.
- Review and edit suggestions before writing them to the MP3.
- Create a byte-for-byte backup before every tag write; restore the original file from the backup.
- Store the Gemini API key encrypted using Electron `safeStorage` on Windows.

## Requirements

- Windows 10/11 x64
- Node.js 20+
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)

## Development

```bash
npm install
npm run dev
```

## Build Windows installer

```bash
npm install
npm run dist
```

Installer output is written to `release/`.

## Privacy and audio handling

MP3 files are read from the local disk by the Electron main process. If **Analyze audio** is enabled, the selected MP3 is sent to the Google Gemini API for analysis. If disabled, only the filename and existing tags are sent. The MVP sends audio inline and currently limits audio analysis to files up to 14 MB. Larger files can still be processed using filename and existing tags.

The API key is encrypted and stored in the current Windows user's Electron app data. Do not commit API keys to the repository.

## Current limitations

- Album artwork lookup/embedding is not implemented yet.
- Inline audio analysis only; the Gemini Files API upload flow for larger audio is a follow-up.
- Gemini suggestions are estimates, not a guaranteed music fingerprint match. Verify suggestions before saving.
- Batch analysis runs sequentially to avoid uncontrolled API concurrency.

## Gemini API

Audio input uses Google's Interactions API with `audio/mp3` inline data. See the [official audio understanding guide](https://ai.google.dev/gemini-api/docs/audio).
