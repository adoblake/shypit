import { spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
await mkdir("public/walkthrough", { recursive: true });
const filter =
  [0, 1, 2]
    .map(
      (i) =>
        `[${i}:v]scale=1280:900:force_original_aspect_ratio=decrease,pad=1280:900:(ow-iw)/2:(oh-ih)/2:color=0x101d32,setsar=1,fps=24[v${i}]`,
    )
    .join(";") + ";[v0][v1][v2]concat=n=3:v=1:a=0[out]";
const args = [
  "-y",
  ...["01-company", "02-carrier-mobile", "03-company-delivery"].flatMap(
    (name) => ["-i", `docs/walkthrough/raw/${name}.webm`],
  ),
  "-filter_complex",
  filter,
  "-map",
  "[out]",
  "-c:v",
  "libx264",
  "-preset",
  "fast",
  "-crf",
  "23",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
  "public/walkthrough/shypit-good-case.mp4",
  "-loglevel",
  "error",
];
const result = spawnSync("ffmpeg", args, { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
