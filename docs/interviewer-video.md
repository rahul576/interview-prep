# Interviewer video loops (V1.11)

Ananya's interviewer is two short video loops made from her portrait (`www/img/interviewers/ananya.jpg`)
with **LivePortrait** (KwaiVGI, MIT licence), an open model that transfers facial motion from a
"driving" video of a real person onto a still photo. The loops are made once and shipped with the app,
so nothing runs at interview time and it works offline.

| Loop | File | Source |
| --- | --- | --- |
| Listening | `ananya-listen.mp4` / `.webm` | 0.0–4.4 s of the portrait driven by LivePortrait's `d9.mp4` (calm, blinks, closed mouth), played forward then backward |
| Talking | `ananya-talk.mp4` / `.webm` | 5.9–12.3 s of the portrait driven by `d13.mp4` (natural speech mouth shapes), played forward then backward |

Forward-then-backward makes each loop seamless. MP4 is H.264 (Safari, Chrome, Edge); WebM is VP9
for browsers without H.264.

## Making loops for another interviewer
1. Open a LivePortrait demo (for example the official Hugging Face Space) or run it locally.
2. Source portrait: the interviewer's JPG. Driving video: a square, front-facing clip of a person
   talking (for the talking loop) and one of a person quietly listening (for the listening loop).
3. Pick segments without big laughs or odd expressions, then:

```sh
mk(){ ffmpeg -y -ss $2 -t $3 -i $1 -filter_complex "[0:v]split[a][b];[b]reverse,trim=start_frame=1,setpts=PTS-STARTPTS[r];[a]setpts=PTS-STARTPTS[f];[f][r]concat=n=2:v=1,format=yuv420p" -an -c:v libx264 -profile:v main -preset slow -crf 21 -movflags +faststart $4; }
mk generated-listen.mp4 0 4.4 NAME-listen.mp4
mk generated-talk.mp4 5.9 6.4 NAME-talk.mp4
for f in NAME-listen NAME-talk; do ffmpeg -y -i $f.mp4 -c:v libvpx-vp9 -crf 34 -b:v 0 -an $f.webm; done
```

4. Put the files in `www/img/interviewers/`, add them to `www/sw.js`, and add
   `clips: { listen: 'img/interviewers/NAME-listen', talk: 'img/interviewers/NAME-talk' }` to the
   interviewer in `www/js/data/meta.js`.
