# The recorded cast

Every spoken line in the campaign, voiced offline with [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)
(Apache-2.0) through [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx), into
`public/audio/voice/` — one MP3 per line, and `manifest.json` with each line's length and loudness
envelope (the lips move with it). The game finds a line by `who|text` (see `lineId` in
`src/audio/voice.ts`); a line with no recording falls back to the browser's speech.

1. `python3 tools/voice/extract.py lines.json` — every `say` / `bark` line in `src/story`, plus the
   chase's and the guards' barks.
2. In a virtual environment with `kokoro-onnx` and `soundfile`, with `kokoro-v1.0.onnx` and
   `voices-v1.0.bin` (the `model-files-v1.0` release of kokoro-onnx) in their own directory:
   `python -I tools/voice/gen.py --models <that directory> --lines lines.json --out public/audio/voice`

`gen.py` holds the casting (a voice, a pace and a pitch per character), the radio band for radio and
PA lines, and the loudness levelling. Needs `ffmpeg` with libmp3lame.
