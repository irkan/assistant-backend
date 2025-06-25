import 'dotenv/config';
import { WebSocketServer, WebSocket } from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import { Writer, Reader } from 'wav';
import { SpeechDetector } from "speech-detector";
import { ReadableStream, ReadableStreamDefaultController } from 'stream/web';

const PORT = 3001;

const wss = new WebSocketServer({ port: PORT });

console.log(`Mock WebSocket server started on port ${PORT}`);

// Threshold for detecting user speech for interruption. This may need tuning.
const VAD_THRESHOLD = 0.2;

wss.on('connection', async (ws) => {
  console.log('Client connected to mock server');

  let audioStreamController: ReadableStreamDefaultController<Float32Array>;
  const audioStream = new ReadableStream<Float32Array>({
    start(controller) {
      audioStreamController = controller;
    }
  });

  let isPlaying = false;
  let interrupted = false;

  const startPlayback = () => {
    if (isPlaying) return;
    console.log('Starting playback...');
    isPlaying = true;
    interrupted = false;

    const mockAudioPath = path.join(__dirname, '..', 'mock_recording', 'mock_playback_24kHz.wav');
    const fileStream = fs.createReadStream(mockAudioPath);
    const reader = new Reader();

    let sampleRate = 24000; // Default sample rate, will be updated by 'format' event
    let intervalId: NodeJS.Timeout | null = null;

    reader.on('format', (format) => {
      console.log('Playback audio format from file:', format);
      sampleRate = format.sampleRate;
      
      const chunkSize = Math.floor(sampleRate * 2 * 0.04); // 40ms chunks for 16-bit mono audio

      intervalId = setInterval(() => {
        if (interrupted) {
          if (intervalId) clearInterval(intervalId);
          fileStream.destroy();
          console.log('Playback interrupted.');
          return;
        }

        const chunk = reader.read(chunkSize);
        if (chunk) {
          const message = {
            serverContent: {
              modelTurn: {
                parts: [
                  {
                    inlineData: {
                      data: chunk.toString('base64'),
                      mimeType: `audio/pcm;rate=${sampleRate}`
                    }
                  }
                ]
              }
            }
          };
          ws.send(JSON.stringify({ type: 'gemini', data: message }));
        }
      }, 40);
    });

    reader.on('end', () => {
      console.log('Playback finished.');
      if (intervalId) clearInterval(intervalId);
      isPlaying = false;
    });

    fileStream.on('close', () => {
      console.log('Playback file stream closed.');
      if (intervalId) clearInterval(intervalId);
      isPlaying = false;
    });

    fileStream.pipe(reader);
  };

  // This loop detects when the user has finished speaking an utterance.
  (async () => {
    try {
      const speechDetector = await SpeechDetector.create(undefined, 0.3, 0.1, 5, 2);
      const speechSegments = await speechDetector.process(audioStream);

      for await (const segment of speechSegments) {
        console.log(`User speech segment detected, length: ${segment.length}. Starting mock response.`);
        if (isPlaying) {
            interrupted = true;
        }
        // Wait for any ongoing (but now interrupted) playback to stop
        setTimeout(() => {
            startPlayback();
        }, 100); // Small delay to ensure client processes interruption
      }
    } catch (e: any) {
      if (e.message.includes('closed')) {
        console.log('Audio stream closed for speech detection.');
      } else {
        console.error('Error in speech segment processing:', e);
      }
    }
  })();

  ws.on('message', async (message) => {
    if (message instanceof Buffer) {
      const int16Array = new Int16Array(message.buffer, message.byteOffset, message.byteLength / 2);
      const float32Array = new Float32Array(int16Array.length);
      
      let sumOfSquares = 0.0;
      for (let i = 0; i < int16Array.length; i++) {
        const sample = int16Array[i] / 32768.0;
        float32Array[i] = sample;
        sumOfSquares += sample * sample;
      }
      
      // Simple VAD for interruption
      const rms = Math.sqrt(sumOfSquares / int16Array.length);
      if (rms > VAD_THRESHOLD && isPlaying && !interrupted) {
        console.log(`Interruption detected! RMS: ${rms.toFixed(2)}`);
        interrupted = true;
        ws.send(JSON.stringify({ type: 'gemini', data: { serverContent: { interrupted: true } } }));
      }

      if (audioStreamController) {
        audioStreamController.enqueue(float32Array);
      }
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    if (audioStreamController) {
      audioStreamController.close();
    }
    interrupted = true;
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    interrupted = true;
    if (audioStreamController) {
        audioStreamController.close();
      }
  });
}); 