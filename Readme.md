# Zello TTS Bot

A Node.js script that sends text-to-speech voice messages to a Zello channel using the ElevenLabs API.

## Overview

This project connects to a ZelloWork channel via WebSocket and broadcasts TTS audio messages. It converts text to speech using ElevenLabs, encodes the audio to Opus format, and streams it to Zello as a voice message.

## Prerequisites

- Node.js (v18+)
- A ZelloWork account with API access
- An ElevenLabs API key

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/zello-tts.git
cd zello-tts
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the project root:
```bash
ZELLO_USERNAME=your_username
ZELLO_PASSWORD="your_password"
ELEVENLABS_API_KEY=your_api_key
```

> **Note:** If your password contains special characters like `#`, `$`, or spaces, wrap it in double quotes.

## Configuration

Edit `index.js` to configure your Zello instance:

```javascript
const serverUrl = 'wss://zellowork.io/ws/your_account_name';
const channel = 'Your Channel Name';
```

### ElevenLabs Voice Settings

The default configuration uses the "Adam" voice. You can customize the voice and settings in the `createTtsPcm` function:

```javascript
const audio = await client.textToSpeech.convert(
  "pNInz6obpgDQGcFmaJgB",  // Voice ID - find others at elevenlabs.io/voices
  {
    text: text,
    model_id: "eleven_monolingual_v1",
    output_format: "pcm_16000",
    voice_settings: {
      stability: 0.5,        // 0-1: Lower = more expressive
      similarity_boost: 0.75 // 0-1: Higher = closer to original voice
    }
  }
);
```

## Usage

Run the script:
```bash
node index.js
```

To change the message being sent, modify the text in the `ws.on('open')` handler:

```javascript
pcmBuffer = await createTtsPcm('Your message here');
```

### Expected Output

A successful run looks like this:

```
gD4BFA==
Connecting to: wss://zellowork.io/ws/your_account
Username: Your_User
Password: ***10 chars***
RX { success: true, seq: 1 }
RX { command: 'on_channel_status', channel: 'Your Channel', status: 'online', ... }
✔ Channel online
Generated 68360 bytes of PCM from ElevenLabs
TTS PCM ready, length: 68360
✅ Both ready, starting stream...
RX { stream_id: 47983, success: true, seq: 2 }
✔ Got stream_id 47983
✔ PCM buffer ready, sending Opus packets...
📦 Starting to encode 68360 bytes of PCM...
📦 Frame size: 640 bytes, total frames: 106
📤 Sending packet 0: 52 bytes Opus
📤 Sending packet 1: 48 bytes Opus
📤 Sending packet 2: 51 bytes Opus
📤 Sending packet 50: 47 bytes Opus
📤 Sending packet 100: 49 bytes Opus
✅ Sent 106 total packets
🛑 Stopping stream...
```

## How It Works

1. **Connect & Authenticate** - Establishes a WebSocket connection to ZelloWork and logs in with credentials
2. **Join Channel** - Subscribes to the specified channel and waits for `online` status
3. **Generate TTS** - Calls ElevenLabs API to convert text to 16kHz mono PCM audio
4. **Start Stream** - Sends `start_stream` command to Zello with Opus codec parameters
5. **Encode & Send** - Splits PCM into 20ms frames, encodes each to Opus, and sends as binary WebSocket packets
6. **Stop Stream** - Sends `stop_stream` command to finalize the voice message

### Audio Format

| Parameter | Value |
|-----------|-------|
| Sample Rate | 16000 Hz |
| Channels | Mono |
| Bit Depth | 16-bit signed |
| Frame Duration | 20ms |
| Samples per Frame | 320 |
| Codec | Opus |

## Dependencies

| Package | Purpose |
|---------|---------|
| `ws` | WebSocket client for Zello connection |
| `elevenlabs` | ElevenLabs TTS API client |
| `opusscript` | Opus audio encoding |
| `dotenv` | Environment variable management |

## Troubleshooting

### "invalid credentials" error

- Verify your username and password are correct
- Check that the WebSocket URL matches your ZelloWork instance exactly
- If your password contains `#` or other special characters, wrap it in quotes in `.env`

### "PCM buffer not ready yet"

- This is a race condition - the channel came online before TTS completed
- The current code handles this with a `maybeStartStream()` gate function

### "Encode error: Bad argument"

- Ensure you're passing the PCM Buffer directly to the Opus encoder
- The second argument should be the sample count (320 for 20ms at 16kHz)

### No audio heard in Zello

- Confirm you're in the same channel on the Zello app
- Check that the bot user has permission to transmit in the channel
- Verify the stream completed (look for "Sent X total packets" and "Stopping stream")

## Resources

- [Zello Channel API Documentation](https://github.com/zelloptt/zello-channel-api)
- [ElevenLabs API Documentation](https://elevenlabs.io/docs)
- [Opus Codec](https://opus-codec.org/)

## License

MIT