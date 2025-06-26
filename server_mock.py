import asyncio
import base64
import json
import os
import random
import time

import numpy as np
import torch
import websockets
from pydub import AudioSegment

# --- Configuration ---
PORT = 3001
INPUT_RATE = 16000
OUTPUT_RATE = 24000
VAD_AGGRESSIVENESS = 3  # Kept for reference, but Silero has its own tuning.
MOCK_AUDIO_DIR = 'mock_recording/'

# Silero VAD works with chunk sizes of 512, 1024, or 1536 samples for 16kHz audio.
# The ONNX model specifically requires 512 samples for 16kHz.
VAD_CHUNK_SAMPLES = 512
VAD_CHUNK_BYTES = VAD_CHUNK_SAMPLES * 2  # 16-bit audio = 2 bytes per sample
# Probability threshold for considering a chunk as speech.
VAD_SPEECH_THRESHOLD = 0.5

# --- Silero VAD Model Loading ---
print("Loading Silero VAD model...")
# Using `torch.hub.load` to get the Silero VAD model.
# The model is downloaded automatically on the first run.
# Using onnx=True for better performance, as recommended by Silero.
model, _ = torch.hub.load(repo_or_dir='snakers4/silero-vad',
                          model='silero_vad',
                          force_reload=False,
                          onnx=True)
print("Silero VAD model loaded.")


def is_speech(chunk: bytes, vad_model) -> bool:
    """
    Checks if a raw audio byte chunk contains speech using the Silero VAD model.
    """
    if len(chunk) != VAD_CHUNK_BYTES:
        return False
    # Convert the 16-bit PCM bytes to a float32 tensor, as required by the model.
    audio_int16 = np.frombuffer(chunk, np.int16)
    audio_float32 = audio_int16.astype(np.float32) / 32768.0
    tensor = torch.from_numpy(audio_float32)
    # Get the speech probability from the model.
    speech_prob = vad_model(tensor, INPUT_RATE).item()
    return speech_prob > VAD_SPEECH_THRESHOLD


async def send_mock_audio(websocket):
    """
    Selects a random WAV file, resamples it, and streams it to the client.
    Handles cancellation gracefully and uses a monotonic clock for smooth streaming.
    """
    try:
        filepath = get_random_audio_filepath()
        print(f"Streaming audio from: {filepath}")

        # Load and prepare audio using pydub
        audio = AudioSegment.from_wav(filepath)
        audio = audio.set_frame_rate(OUTPUT_RATE)
        audio = audio.set_channels(1)
        audio = audio.set_sample_width(2)  # 16-bit

        # Chunk and send
        chunk_size_ms = 32
        chunk_duration_sec = chunk_size_ms / 1000.0
        chunk_size_samples = int(OUTPUT_RATE * (chunk_size_ms / 1000.0))
        chunk_size_bytes = chunk_size_samples * 2  # 16-bit = 2 bytes

        raw_audio_data = audio.raw_data
        start_time = time.monotonic()
        chunks_sent = 0

        for i in range(0, len(raw_audio_data), chunk_size_bytes):
            chunk = raw_audio_data[i:i + chunk_size_bytes]
            if not chunk:
                break

            base64_chunk = base64.b64encode(chunk).decode('utf-8')

            message = {
                "serverContent": {
                    "modelTurn": {
                        "parts": [{
                            "inlineData": {
                                "data": base64_chunk,
                                "mimeType": f"audio/pcm;rate={OUTPUT_RATE}"
                            }
                        }]
                    }
                }
            }
            try:
                await websocket.send(json.dumps({"type": "gemini", "data": message}))
            except websockets.exceptions.ConnectionClosed:
                print("Connection closed during send, stopping audio stream.")
                break

            chunks_sent += 1

            # Self-correcting sleep to maintain a steady rhythm
            next_send_time = start_time + chunks_sent * chunk_duration_sec
            sleep_for = next_send_time - time.monotonic()

            if sleep_for > 0:
                await asyncio.sleep(sleep_for)

        print("Finished streaming mock audio.")

    except asyncio.CancelledError:
        print("Audio streaming task was cancelled.")
    except Exception as e:
        print(f"Error in send_mock_audio: {e}")


async def handler(websocket):
    """
    Handles incoming WebSocket connections, performs VAD, and triggers response.
    Waits for the user to be silent before responding.
    """
    print(f"Client connected from {websocket.remote_address}")
    audio_buffer = bytearray()
    playback_task = None

    state = "LISTENING"  # LISTENING, WAITING_FOR_SILENCE, RESPONDING
    last_speech_time = 0
    SILENCE_THRESHOLD_S = 0.5  # 500ms

    vad_model = model  # Use the globally loaded model

    try:
        while True:
            # State 1: WAITING_FOR_SILENCE check
            if state == "WAITING_FOR_SILENCE" and time.monotonic() - last_speech_time > SILENCE_THRESHOLD_S:
                print("End of speech detected, starting response.")
                state = "RESPONDING"
                audio_buffer.clear()
                playback_task = asyncio.create_task(send_mock_audio(websocket))

            # State 2: Check if server has finished RESPONDING
            if state == "RESPONDING" and playback_task and playback_task.done():
                print("Playback finished. Returning to listening state.")
                state = "LISTENING"
                playback_task = None

            # Non-blocking receive with a short timeout
            try:
                message = await asyncio.wait_for(websocket.recv(), timeout=0.05)
                if isinstance(message, bytes):
                    audio_buffer.extend(message)
            except asyncio.TimeoutError:
                continue

            # Process any audio data we have in the buffer
            while len(audio_buffer) >= VAD_CHUNK_BYTES:
                frame = audio_buffer[:VAD_CHUNK_BYTES]
                del audio_buffer[:VAD_CHUNK_BYTES]

                try:
                    if not is_speech(frame, vad_model):
                        continue

                    # --- If we get here, it means we detected speech ---
                    last_speech_time = time.monotonic()

                    # If server is speaking, new speech should interrupt it.
                    if state == "RESPONDING" and playback_task and not playback_task.done():
                        print("Interrupting current playback due to sustained user speech.")
                        playback_task.cancel()
                        try:
                            await playback_task
                        except asyncio.CancelledError:
                            pass
                        state = "WAITING_FOR_SILENCE"

                    # This is the start of a new utterance from the user.
                    if state == "LISTENING":
                        state = "WAITING_FOR_SILENCE"
                        print("Sustained voice detected. Sending interrupt, waiting for end of speech.")
                        interrupt_message = {
                            "type": "gemini",
                            "data": {"serverContent": {"interrupted": True}}
                        }
                        await websocket.send(json.dumps(interrupt_message))

                except Exception as e:
                    print(f"VAD error: {e}")

    except websockets.exceptions.ConnectionClosed as e:
        print(f"Connection closed: {e.reason} (code: {e.code})")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
    finally:
        # Clean up any running task when the client disconnects
        if playback_task and not playback_task.done():
            playback_task.cancel()
        print(f"Client {websocket.remote_address} disconnected.")


# --- Main Server ---

def get_random_audio_filepath():
    """Selects a random .wav file from the mock audio directory."""
    wav_files = [f for f in os.listdir(MOCK_AUDIO_DIR) if f.endswith('.wav')]
    if not wav_files:
        raise FileNotFoundError(f"No .wav files found in {MOCK_AUDIO_DIR}")
    return os.path.join(MOCK_AUDIO_DIR, random.choice(wav_files))


async def main():
    # Check if mock audio directory exists
    if not os.path.isdir(MOCK_AUDIO_DIR):
        print(f"Error: Mock audio directory '{MOCK_AUDIO_DIR}' not found.")
        print("Please create it and add some .wav files.")
        return

    async with websockets.serve(handler, "0.0.0.0", PORT):
        print(f"WebSocket server started on ws://0.0.0.0:{PORT}")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer shutting down.") 