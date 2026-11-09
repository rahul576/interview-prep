# Talking-head interviewer (V1.12, lip sync reworked in V1.13)

Ananya speaks with her lips following her actual voice, blinks at a natural rate, and moves her head
calmly like a person on a video call. It is made once, offline, from her portrait and shipped as
three small files, so nothing heavy runs during an interview and it works offline.

| File | What it is |
| --- | --- |
| `ananya-base.mp4` / `.webm` | Her portrait animated by **LivePortrait** (KwaiVGI, MIT licence) with calm head movement, mouth closed and no blinks; 6.1 s played forward then backward (12.2 s seamless loop). |
| `ananya-rig.json` | For each of the 366 base frames, an affine transform from the portrait to the frame (where the face is), found with OpenCV image alignment (ECC) on the brows/eyes/nose area. |
| `ananya-face.webp` | One continuous real mouth-opening movement from her LivePortrait footage (8 frames, 33 ms apart, closed to open, same expression and teeth), and 3 eyelid frames (half, mostly, fully closed), aligned to the portrait, with soft edges. |

At run time (`TalkingHead` in `www/js/ui/avatar.js`) each video frame is drawn to a canvas. The
voice loudness goes through a jaw-like envelope follower (opens with a 35 ms time constant, closes
with 80 ms) and becomes a mouth opening; the two neighbouring frames of the real opening movement
are blended and placed onto the face with that frame's transform.

Why one continuous movement (V1.13): V1.12 picked mouth pictures from different moments of the
footage (different smile, teeth and light) and changed them every frame, which looked like
vibrating lips. Neighbouring frames of one real movement only differ by the motion itself, so
blending them looks like real motion. The smoothing constants were tuned
(`scripts/avatar/tune-voice.py`) on real Kokoro speech for about 4 syllable movements per second with
the same frame-to-frame change as her real footage. The loudness
comes from the natural voice's audio (Kokoro), and a speech-like rhythm is used with the system
voice. Blinks happen every 2.5 to 7 seconds and last about 0.2 s, sometimes as a double blink.

## Making one for another interviewer
1. Generate two LivePortrait videos of the portrait (for example on the LivePortrait Hugging Face
   Space): one driven by a calm, mostly silent clip, one driven by a person talking.
2. `python3 scripts/avatar/analyze.py PORTRAIT.jpg an.json calm.mp4 talking.mp4` measures, per
   frame, the alignment to the portrait, eye openness and mouth openness.
3. Set the eye and mouth boxes for the new face in `scripts/avatar/build.py` (portrait pixels), pick a
   blink-free, mouth-closed range of the calm video as the base, then run
   `python3 scripts/avatar/build.py PORTRAIT.jpg an.json calm.mp4 talking.mp4 OUT/`.
4. Encode `OUT/base.avi` to H.264 MP4 and VP9 WebM, copy the files to `www/img/interviewers/`, add
   them to `www/sw.js` and add `rig: { base, sprite, meta }` to the interviewer in `www/js/data/meta.js`.
