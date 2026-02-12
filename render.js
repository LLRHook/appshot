const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE = path.resolve(__dirname, "template.html");

const FRAME_DEFS = [
  {
    id: "01_landing",
    headline: "Split Bills With Friends",
    layout: "text-left",
    gradient_from: "D4A574",
    gradient_to: "328983",
    gradient_angle: 135,
    crop_x: 50,
    crop_y: 35,
  },
  {
    id: "02_add_people",
    headline: "Add Your Crew",
    layout: "text-above",
    gradient_from: "D9B38C",
    gradient_to: "1F6B65",
    gradient_angle: 135,
    crop_x: 50,
    crop_y: 35,
  },
  {
    id: "03_bill_entry",
    headline: "Snap a Pic or Type It In",
    layout: "split",
    gradient_from: "C4836A",
    gradient_to: "2A7A74",
    gradient_angle: 135,
    crop_x: 50,
    crop_y: 35,
  },
  {
    id: "04_assign",
    headline: "Who Had What?",
    layout: "text-right",
    gradient_from: "C9A86C",
    gradient_to: "4C5B6B",
    gradient_angle: 135,
    crop_x: 50,
    crop_y: 35,
  },
  {
    id: "05_summary",
    headline: "See Who Owes What",
    layout: "text-above",
    gradient_from: "B8885C",
    gradient_to: "1A5C56",
    gradient_angle: 135,
    crop_x: 50,
    crop_y: 35,
  },
  {
    id: "06_tabs",
    headline: "Keep a Running Tab",
    layout: "text-left",
    gradient_from: "A87D4A",
    gradient_to: "2D8A83",
    gradient_angle: 135,
    crop_x: 50,
    crop_y: 35,
  },
];

const DEVICES = [
  { device: "iphone", device_dir: "iphone_6_9", width: 1320, height: 2868 },
  { device: "ipad",   device_dir: "ipad_13",     width: 2064, height: 2752 },
];

// Build full FRAMES list: each frame def x each device
const FRAMES = [];
for (const dev of DEVICES) {
  for (const def of FRAME_DEFS) {
    FRAMES.push({ ...def, ...dev });
  }
}

async function render() {
  const browser = await puppeteer.launch({ headless: true });

  for (const frame of FRAMES) {
    const inputPath = path.join(ROOT, "raw", frame.device_dir, `${frame.id}.png`);
    const outputDir = path.join(ROOT, "final", frame.device_dir);
    const outputPath = path.join(outputDir, `${frame.id}.png`);

    if (!fs.existsSync(inputPath)) {
      console.error(`SKIP: ${inputPath} not found`);
      continue;
    }

    fs.mkdirSync(outputDir, { recursive: true });

    const page = await browser.newPage();
    await page.setViewport({
      width: frame.width,
      height: frame.height,
      deviceScaleFactor: 1,
    });

    const fileUrl = `file://${TEMPLATE}`;
    const screenshotSrc = `file://${inputPath}`;
    const params = new URLSearchParams({
      headline: frame.headline,
      src: screenshotSrc,
      layout: frame.layout,
      device: frame.device,
      gradient_from: frame.gradient_from,
      gradient_to: frame.gradient_to,
      gradient_angle: String(frame.gradient_angle),
      crop_x: String(frame.crop_x),
      crop_y: String(frame.crop_y),
    });

    await page.goto(`${fileUrl}?${params.toString()}`, {
      waitUntil: "networkidle0",
    });

    // Wait for the main screenshot image to fully load
    await page.waitForFunction(() => {
      const img = document.getElementById("screenshot");
      if (!img || !img.complete || img.naturalWidth === 0) return false;
      // For split layout, also wait for crop image
      const cropImg = document.getElementById("crop-screenshot");
      if (cropImg && cropImg.src && cropImg.src !== window.location.href) {
        return cropImg.complete && cropImg.naturalWidth > 0;
      }
      return true;
    });

    await page.screenshot({ path: outputPath, type: "png" });
    await page.close();

    const stats = fs.statSync(outputPath);
    console.log(`OK: ${frame.device_dir}/${frame.id}.png (${Math.round(stats.size / 1024)} KB)`);
  }

  await browser.close();
  console.log("\nDone. All frames rendered.");
}

render().catch((err) => {
  console.error("Render failed:", err);
  process.exit(1);
});
