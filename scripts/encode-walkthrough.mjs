import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
const names = [
  "00-admin",
  "01-company",
  "02-carrier-mobile",
  "03-company-confirm",
  "04-carrier-job-banking",
];
const labels = [
  "Admin & finance access",
  "Business posts freight",
  "Carrier on mobile",
  "Business confirms & billing",
  "Carrier jobs & banking",
];
await mkdir("public/walkthrough", { recursive: true });
function run(args) {
  const r = spawnSync("ffmpeg", ["-y", ...args, "-loglevel", "error"], {
    stdio: "inherit",
  });
  if (r.error || r.status !== 0) throw Error("Video export failed");
}
const filter =
  names
    .map(
      (_, i) =>
        `[${i}:v]scale=1280:900:force_original_aspect_ratio=decrease,pad=1280:900:(ow-iw)/2:(oh-ih)/2:color=0x101d32,setsar=1,fps=24[v${i}]`,
    )
    .join(";") +
  ";" +
  names.map((_, i) => `[v${i}]`).join("") +
  `concat=n=${names.length}:v=1:a=0[out]`;
const codec = [
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
];
run([
  ...names.flatMap((name) => ["-i", `docs/walkthrough/raw/${name}.webm`]),
  "-filter_complex",
  filter,
  "-map",
  "[out]",
  ...codec,
  "public/walkthrough/shypit-good-case.mp4",
]);
let start = 0;
const chapters = names.map((name, index) => {
  const r = spawnSync(
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
  const duration = Number(r.stdout.trim());
  if (r.status !== 0 || !Number.isFinite(duration) || duration <= 0)
    throw Error("Chapter duration unavailable");
  const chapter = {
    title: labels[index],
    start: Math.round(start * 100) / 100,
  };
  start += duration;
  return chapter;
});
await writeFile(
  "public/walkthrough/chapters.json",
  JSON.stringify(
    { duration: Math.round(start * 100) / 100, chapters },
    null,
    2,
  ) + "\n",
);
run([
  "-i",
  "docs/walkthrough/raw/02-carrier-mobile.webm",
  "-i",
  "docs/walkthrough/raw/04-carrier-job-banking.webm",
  "-filter_complex",
  "[0:v]fps=24,setsar=1[v0];[1:v]fps=24,setsar=1[v1];[v0][v1]concat=n=2:v=1:a=0[out]",
  "-map",
  "[out]",
  ...codec,
  "public/walkthrough/shypit-carrier-mobile.mp4",
]);
run([
  "-ss",
  "9",
  "-i",
  "public/walkthrough/shypit-good-case.mp4",
  "-frames:v",
  "1",
  "-q:v",
  "3",
  "public/walkthrough/workflow-poster.jpg",
]);
console.log(
  `Encoded ${Math.round(start)} seconds across ${names.length} chapters, plus the portrait carrier flow.`,
);
