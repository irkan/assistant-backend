# Gemini Voice Gateway

This project is a WebSocket-based gateway for real-time, two-way voice conversations with Google's Gemini large language models

This server acts as a backend that connects to the Google GenAI service, managing the audio streaming and session for a connected client (e.g., a web browser).

## Features

-   Real-time, bidirectional audio streaming between a client and Gemini.
-   Session management for Gemini interactions.
-   Error handling and status updates.
-   Easy to configure and run.

## Prerequisites

-   Node.js (v18 or later recommended)
-   A Google Gemini API key. You can get one from [Google AI Studio](https://aistudio.google.com/app/apikey).

## Installation

1.  Clone this repository:
    ```bash
    git clone <repository-url>
    cd gemini-voice-gateway
    ```

2.  Install the dependencies:
    ```bash
    npm install
    ```

## Configuration

1.  Create a `.env` file in the root of the project:
    ```bash
    cp env.example .env
    ```

2.  Configure the environment variables in your `.env` file:

    ```bash
    # Server Configuration
    SERVER_PORT=3001

    # API Configuration
    ADMINPANEL_BACKEND_BASE_URL=http://localhost:3000

    # Gemini AI Configuration
    GEMINI_API_KEY=your_gemini_api_key_here
    GEMINI_MODEL=gemini-2.5-flash-preview-native-audio-dialog
    GEMINI_TEMPERATURE=1
    GEMINI_TRIGGER_TOKENS=25600
    GEMINI_TARGET_TOKENS=12800
    GEMINI_VOICE_NAME=Orus

    # Recordings Configuration
    RECORDINGS_DIRECTORY=recordings
    ```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SERVER_PORT` | WebSocket server port | `3001` |
| `ADMINPANEL_BACKEND_BASE_URL` | Base URL for agent API | `http://localhost:3000` |
| `GEMINI_API_KEY` | Your Gemini API key | Required |
| `GEMINI_MODEL` | Gemini model to use | `gemini-2.5-flash-preview-native-audio-dialog` |
| `GEMINI_TEMPERATURE` | AI temperature setting | `1` |
| `GEMINI_TRIGGER_TOKENS` | Context window trigger tokens | `25600` |
| `GEMINI_TARGET_TOKENS` | Context window target tokens | `12800` |
| `GEMINI_VOICE_NAME` | Voice name for speech | `Orus` |
| `RECORDINGS_DIRECTORY` | Directory for audio recordings | `recordings` |

## Usage

### Running the Server

To start the WebSocket server, run:

```bash
npm start
```

The server will start on port 3001 by default.

### Development

For development, you can use `nodemon` to automatically restart the server on file changes:

```bash
npm run dev
```

### Building for Production

To compile the TypeScript code to JavaScript, run:

```bash
npm run build
```

This will create a `dist` directory with the compiled code.

## How It Works

1.  A client establishes a WebSocket connection to this server.
2.  The server initiates a `live` session with the Google Gemini API using the `gemini-2.5-flash-preview-native-audio-dialog` model.
3.  The client sends raw audio data (16-bit PCM at 16kHz) to the server.
4.  The server Base64-encodes the audio and forwards it to the Gemini session.
5.  Gemini processes the audio and responds with its own audio and/or text data.
6.  The server forwards Gemini's responses back to the client over the WebSocket connection.
7.  The session is closed when the client disconnects.

## WebSocket API

The server and client communicate using a simple JSON-based protocol for status and control messages, and binary WebSocket frames for audio data.

### Client to Server

-   **Audio Data**: Raw audio as a binary `Buffer`. The server expects 16-bit linear PCM audio at a sampling rate of 16,000 Hz.

### Server to Client

The server sends JSON objects with a `type` and `data` field.

-   **`type: 'status'`**: Provides updates on the Gemini session state.
    -   `data`: "Gemini session opened"
    -   `data`: "Gemini session closed: <reason>"
-   **`type: 'gemini'`**: Forwards the message object received from the Gemini API. This can contain text, audio, or other data.
-   **`type: 'error'`**: Reports an error from the Gemini session.
    -   `data`: The error message.


