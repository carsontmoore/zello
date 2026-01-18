require('dotenv').config();
const { ElevenLabsClient } = require("elevenlabs");

// Compute codec header
function buildCodecHeader() {
  const sampleRate = 16000;          // 0x3E80
  const framesPerPacket = 1;         // 0x01
  const frameSizeMs = 20;            // 0x14

  const buf = Buffer.alloc(4);
  buf.writeUInt16LE(sampleRate, 0);  // bytes 0–1
  buf.writeUInt8(framesPerPacket, 2);
  buf.writeUInt8(frameSizeMs, 3);
  return buf.toString('base64');     // put this into codec_header
}

const codecHeaderBase64 = buildCodecHeader();
console.log(codecHeaderBase64);

// Connect and logon to Zello
const WebSocket = require('ws');
const OpusScript = require('opusscript');

const serverUrl = 'wss://zellowork.io/ws/demoaccount2025'; // or zello.io as appropriate
const username = process.env.ZELLO_USERNAME;
const password = process.env.ZELLO_PASSWORD;
const channel = 'Endor Moon';


console.log('Connecting to:', serverUrl);
console.log('Username:', username);
console.log('Password:', password ? `***${password.length} chars***` : 'MISSING');
const ws = new WebSocket(serverUrl);

let seq = 1;
let streamId = null;
let pcmBuffer = null;
let channelOnline = false;
let streamStarted = false;

ws.on('open', async () => {
  // 1. Send logon
  const logon = {
    command: 'logon',
    seq: seq++,
    username: username,
    password: password,
    channels: [channel]
  };
  ws.send(JSON.stringify(logon));

  // 2. In parallel, prepare TTS PCM 
  try {
    pcmBuffer = await createTtsPcm('You don\'t know the power of the dark side');
    console.log('TTS PCM ready, length:', pcmBuffer.length);
    maybeStartStream(); // Check if channel is already online
  } catch (err) {
    console.error('TTS error:', err);
  }
});


// Handle server messages
ws.on('message', (data, isBinary) => {
  if (isBinary) {
    console.log('RX binary:', data.length, 'bytes');
    return;
  }

  const msg = JSON.parse(data.toString());
  console.log('RX', msg);

  if (msg.command === 'on_channel_status' &&
      msg.channel === channel &&
      msg.status === 'online') {
    // Channel ready: start stream (PCM may already be ready)
    console.log("\x1b[92m\u2714\x1b[0m Channel online, starting stream...");
    channelOnline = true;
    maybeStartStream();
  }

  if (msg.success && msg.stream_id && !streamId) {
    streamId = msg.stream_id;
    console.log('\x1b[92m\u2714\x1b[0m Got stream_id', streamId);
    console.log("\x1b[92m\u2714\x1b[0m PCM buffer ready, sending Opus packets...");
    sendOpusPackets(); // uses pcmBuffer
  }
});

function maybeStartStream() {
  if (channelOnline && pcmBuffer && !streamStarted) {
    console.log('✅ Both ready, starting stream...');
    streamStarted = true;
    startTtsStream();
  }
}


// Start Opus Audio Stream
function startTtsStream() {
  const startStream = {
    command: 'start_stream',
    seq: seq++,
    channel,
    type: 'audio',
    codec: 'opus',
    codec_header: codecHeaderBase64,
    packet_duration: 20
  };
  ws.send(JSON.stringify(startStream));
}

// Encode PCM to Opus and send binary packets


// async function createTtsPcm(text) {
//   // 1) Call your TTS provider here.
//   // 2) Get back audio data.
//   // 3) Convert it to 16-bit PCM mono at 16000 Hz and return as Buffer.

//   // Pseudo-structure (you fill in with your provider specifics):
//   //
//   // const resp = await fetch('<tts-endpoint>', { ... });
//   // const audioBuf = await resp.arrayBuffer();
//   // let raw = Buffer.from(audioBuf);
//   //
//   // If the provider already gives you raw PCM s16le 16kHz mono:
//   //   return raw;
//   //
//   // If they give WAV:
//   //   - strip the WAV header to get PCM
//   //   - ensure sampleRate=16000, channels=1
//   //
//   // If they give MP3/OGG:
//   //   - run through ffmpeg to decode into PCM s16le 16kHz mono
//   //
//   // For now, just throw until you wire up a real provider:
//   throw new Error('createTtsPcm(text) not implemented yet');
// }

// Elevenlabs TTS implementation
async function createTtsPcm(text) {
  const client = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY // Set this in .env or hardcode for testing
  });

  const audio = await client.textToSpeech.convert(
    "G3zrXA9moYrFCgwBAvxJ", // "Darth Oxley"
    {
      text: text,
      model_Id: "eleven_monolingual_v1",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.5, // More dramatic
        
      },
    // outputFormat: {
    //   format: "pcm_16000",  // Exactly matches your Opus encoder: 16kHz PCM mono
    //   sampleRate: 16000,
    //   bitDepth: 16
    // },
      output_format: "pcm_16000",
    }
  );
  const chunks = [];
  for await (const chunk of audio) {
    chunks.push(chunk);
  }
  const pcmBuffer = Buffer.concat(chunks);

  console.log(`Generated ${pcmBuffer.length} bytes of Vader PCM from ElevenLabs`);
  return pcmBuffer;
}



const encoder = new OpusScript(16000, 1, OpusScript.Application.AUDIO);

function sendOpusPackets() {
  const frameSizeMs = 20;
  const sampleRate = 16000;
  const samplesPerFrame = (sampleRate * frameSizeMs) / 1000; // 320
  const bytesPerSample = 2;
  const frameBytes = samplesPerFrame * bytesPerSample;       // 640 bytes

  let packetId = 0;
  let offset = 0;

  console.log("Starting to encode ${pcmBuffer.length} bytes of PCM");
  console.log(`Frame size: ${frameBytes} bytes, total frames: ${Math.floor(pcmBuffer.length / frameBytes)}`);
  
  while (offset + frameBytes <= pcmBuffer.length) {
    const framePcm = pcmBuffer.slice(offset, offset + frameBytes);
    offset += frameBytes;

    // Convert frame PCM to Int16Array for opusscript
    // const samples = new Int16Array(samplesPerFrame);
    // for (let i = 0; i < samplesPerFrame; i++) {
    //   samples[i] = framePcm.readInt16LE(i * 2);
    // }

    const encoded = encoder.encode(framePcm, samplesPerFrame);
    
    if (!encoded || encoded.length === 0) {
      console.error('Encode failed at packet ${packetId}');
      continue
    }

    // Build Zello binary packet
    const header = Buffer.alloc(1 + 4 + 4); // type + stream_id + packet_id
    header.writeUInt8(0x01, 0);            // type = 1 (audio)[web:39]
    header.writeUInt32BE(streamId, 1);     // stream_id in network byte order[web:39]
    header.writeUInt32BE(packetId++, 5);   // packet_id; Zello ignores for uploads[web:39]

    const packet = Buffer.concat([header, Buffer.from(encoded)]);

    if (packetId < 3 || packetId % 50 === 0) {
      console.log(`Sending packet ${packetId}: ${encoded.length} bytes Opus`);
    }

    // Send as a binary WebSocket frame
    ws.send(packet, { binary: true });
    packetId++;
  }

  console.log('Sent ${packetId} total packets');

  // After sending all frames, stop the stream
  stopTtsStream();
}

function stopTtsStream() {
  console.log('Stopping stream...');
  const stopStream = {
    command: 'stop_stream',
    seq: seq++,
    channel,
    stream_id: streamId
  };
  ws.send(JSON.stringify(stopStream));
}
