# Zello TTS Debugging Recap

Notes from building a Node.js script that connects to a Zello channel via WebSocket and sends text-to-speech voice messages using ElevenLabs.

## Issues & Fixes

### 1. Server URL Typo

**Symptom:** `invalid credentials` error despite correct username/password.

**Cause:** Typo in the WebSocket URL - `demoaccount25` instead of `demoaccount2025`.

**Fix:**
```javascript
// Wrong
const serverUrl = 'wss://zellowork.io/ws/demoaccount25';

// Correct
const serverUrl = 'wss://zellowork.io/ws/demoaccount2025';
```

---

### 2. Special Characters in `.env` File

**Symptom:** `invalid credentials` error. Password loaded as 8 characters instead of 10.

**Cause:** The `#` character in the password was being interpreted as a comment delimiter by dotenv.

**Fix:** Wrap values containing special characters in quotes:
```bash
# Wrong - everything after # is treated as a comment
ZELLO_PASSWORD=abc#12defg

# Correct
ZELLO_PASSWORD="abc#12defg"
```

---

### 3. ElevenLabs SDK API Change

**Symptom:** `TypeError: Cannot destructure property 'enable_logging' of 'request' as it is undefined`

**Cause:** The ElevenLabs SDK (v1.59.0) changed its method signature. `voiceId` is now a positional argument, and parameter names use snake_case.

**Fix:**
```javascript
// Old (broken)
const audio = await client.textToSpeech.convert({
  text: text,
  voiceId: "pNInz6obpgDQGcFmaJgB",
  modelId: "eleven_monolingual_v1",
  outputFormat: "pcm_16000",
});

// New (working)
const audio = await client.textToSpeech.convert(
  "pNInz6obpgDQGcFmaJgB",  // voiceId as first positional arg
  {
    text: text,
    model_id: "eleven_monolingual_v1",      // snake_case
    output_format: "pcm_16000",              // snake_case
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
    }
  }
);

// Also: response is now an async iterable stream
const chunks = [];
for await (const chunk of audio) {
  chunks.push(chunk);
}
const pcmBuffer = Buffer.concat(chunks);
```

---

### 4. Race Condition - PCM Buffer Not Ready

**Symptom:** `PCM buffer not ready yet` error. Stream started before TTS completed.

**Cause:** The `on_channel_status` event fired before the ElevenLabs API returned the audio data. The code attempted to send packets with an empty buffer.

**Fix:** Implement a gate that waits for both conditions:
```javascript
let channelOnline = false;
let pcmBuffer = null;
let streamStarted = false;

function maybeStartStream() {
  if (channelOnline && pcmBuffer && !streamStarted) {
    streamStarted = true;
    startTtsStream();
  }
}

// Call maybeStartStream() from both:
// 1. The on_channel_status handler (when channel comes online)
// 2. After TTS completes (when pcmBuffer is populated)
```

---

### 5. Opus Encoder Input Format

**Symptom:** `Error: Encode error: Bad argument` from opusscript.

**Cause:** The encoder was being passed an `Int16Array`, but opusscript's `encode()` method expects a `Buffer` with the sample count as the second argument.

**Fix:**
```javascript
// Wrong
const samples = new Int16Array(samplesPerFrame);
for (let i = 0; i < samplesPerFrame; i++) {
  samples[i] = framePcm.readInt16LE(i * 2);
}
const encoded = Buffer.from(encoder.encode(samples));

// Correct - pass Buffer directly with sample count
const encoded = encoder.encode(framePcm, samplesPerFrame);
```

---

## Final Working Flow

1. Connect to Zello WebSocket
2. Send logon command with credentials
3. Begin fetching TTS audio from ElevenLabs (async)
4. Wait for `on_channel_status` confirming channel is online
5. Once both channel is online AND PCM buffer is ready, start the audio stream
6. Encode PCM frames to Opus and send as binary WebSocket packets
7. Send `stop_stream` command when complete

## Dependencies

- `ws` - WebSocket client
- `elevenlabs` - TTS API client (v1.59.0+)
- `opusscript` - Opus audio encoding
- `dotenv` - Environment variable management