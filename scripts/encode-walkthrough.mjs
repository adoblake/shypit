import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
await mkdir("public/walkthrough", { recursive: true });
const filter =
  [0, 1, 2, 3]
    .map(
      (i) =>
        `[${i}:v]scale=1280:900:force_original_aspect_ratio=decrease,pad=1280:900:(ow-iw)/2:(oh-ih)/2:color=0x101d32,setsar=1,fps=24[v${i}]`,
    )
    .join(";") + ";[v0][v1][v2][v3]concat=n=4:v=1:a=0[out]";
const args = [
  "-y",
  ...[
    "00-admin",
    "01-company",
    "02-carrier-mobile",
    "03-company-delivery",
  ].flatMap((name) => ["-i", `docs/walkthrough/raw/${name}.webm`]),
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

const names = [
  "00-admin",
  "01-company",
  "02-carrier-mobile",
  "03-company-delivery",
];
const labels = [
  "Admin controls",
  "Company booking",
  "Carrier on mobile",
  "Delivery review",
];
let start = 0;
const chapters = names.map((name, index) => {
  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      `docs/walkthrough/raw/${name}.webm`,
    ],
    { encoding: "utf8" },
  );
  const duration = Number(probe.stdout.trim());
  if (probe.status !== 0 || !Number.isFinite(duration) || duration <= 0)
    throw Error("Unable to measure recorded chapter");
  const chapter = {
    title: labels[index],
    start: Math.round(start * 100) / 100,
  };
  start += duration;
  return chapter;
});
await writeFile(
  "public/walkthrough/chapters.json",
  JSON.stringify({ duration: start, chapters }, null, 2) + "\n",
);
console.log("Encoded " + Math.round(start) + " seconds across four chapters.");

const mobile = spawnSync(
  "ffmpeg",
  [
    "-y",
    "-i",
    "docs/walkthrough/raw/02-carrier-mobile.webm",
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
    "public/walkthrough/shypit-carrier-mobile.mp4",
    "-loglevel",
    "error",
  ],
  { stdio: "inherit" },
);
if (mobile.error || mobile.status !== 0)
  throw Error("Native mobile chapter encoding failed");
const poster = spawnSync(
  "ffmpeg",
  [
    "-y",
    "-ss",
    "9",
    "-i",
    "public/walkthrough/shypit-good-case.mp4",
    "-frames:v",
    "1",
    "-q:v",
    "3",
    "public/walkthrough/workflow-poster.jpg",
    "-loglevel",
    "error",
  ],
  { stdio: "inherit" },
);
if (poster.error || poster.status !== 0)
  throw Error("Workflow poster export failed");
