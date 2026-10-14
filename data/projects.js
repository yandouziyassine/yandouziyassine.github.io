/*
 * ─────────────────────────────────────────────────────────────────────────────
 *  ALL SITE CONTENT LIVES HERE.  To add a project: copy one object in
 *  `featured` (big card) or `projects` (grid card) and edit it. Nothing else
 *  needs to change — the page renders whatever is in this file.
 *
 *  Fields:
 *    title, kicker   — name and a one-line label
 *    metric          — the headline number + what it measures (shown like an instrument reading)
 *    summary         — 1–3 sentences, plain language
 *    tags            — used by the filter chips (any new tag creates a new chip)
 *    stack           — tools / languages
 *    image           — path under images/ (optional)
 *    links           — [{ label, href }]  (GitHub, live demo, write-up…)
 *    depth           — 1 demo · 2 measured · 3 in-depth analysis (CV library only)
 * ─────────────────────────────────────────────────────────────────────────────
 */

window.SITE = {
  name: "Yassine Yandouzi",
  role: "Computer engineering student",
  focus: ["Computer Vision", "Machine Learning", "AI Cybersecurity"],
  machine: "Intel Core Ultra 7 258V (8 cores) · Arc 140V iGPU · AI Boost NPU · 32 GB RAM · no NVIDIA GPU",
  tagline:
    "I build vision and ML systems end to end, and I measure them: every project here reports a real number, " +
    "including what didn't work.",
  github: "https://github.com/yandouziyassine",
};

const CVLIB = "https://github.com/yandouziyassine/COMPUTER-VISION-PROJECT-LIBRARY";
const cv = (folder) => `${CVLIB}/tree/main/${folder}`;

window.FEATURED = [
  {
    title: "Computer Vision Project Library",
    kicker: "18 projects · one benchmark each · trained on a laptop CPU",
    metric: { value: "18", unit: "measured projects" },
    summary:
      "From classical OpenCV to fine-tuned detectors, segmentation, 3D and foundation models. A CVPR paper " +
      "reimplemented from scratch, a detector deployed 17× faster on an NPU, and the debugging stories behind each number.",
    tags: ["Computer Vision", "ML"],
    stack: ["PyTorch", "YOLO11", "OpenVINO", "CLIP", "SAM", "OpenCV"],
    image: "images/cv-13.png",
    links: [{ label: "Repository", href: CVLIB }, { label: "Browse the projects ↓", href: "#library" }],
  },
  {
    title: "Slipstream",
    kicker: "Smart order execution engine · C++20 + Python over gRPC",
    metric: { value: "1", unit: "writer thread · zero locks on the hot path" },
    summary:
      "Slices large orders over time (TWAP, VWAP, POV, Almgren-Chriss), routes each slice across Kraken and Coinbase " +
      "by all-in price, and checks every fill against hard risk limits in C++. Deterministic clock for exact replays. Paper trading only.",
    tags: ["Systems", "Security"],
    stack: ["C++20", "gRPC", "Protocol Buffers", "Python", "GoogleTest", "ASan/UBSan"],
    image: "images/slipstream-cover.svg",
    diagram: [
      "Kraken WS ──► feed ─┐",
      "                    ├─► engine loop ─► risk gate ─► fills",
      "Coinbase WS ─► feed ┘   books · schedule · router",
    ],
    links: [{ label: "Repository", href: "https://github.com/yandouziyassine/slipstream" }],
  },
  {
    title: "JoBaI",
    kicker: "AI job-application & CV-tailoring SaaS",
    metric: { value: "0–100", unit: "ATS score per tailored CV" },
    summary:
      "Tailors a résumé and cover letter to each job, then grades it against the ATS with the missing keywords. " +
      "Security-first architecture: OAuth 2.1 (PKCE), token-derived resource paths (IDOR-safe), default-deny rules, " +
      "signature-verified billing webhooks. Also a remote MCP server for AI agents.",
    tags: ["Web", "ML", "Security"],
    stack: ["Next.js", "TypeScript", "Firebase", "DeepSeek", "Stripe", "MCP"],
    image: "images/jobai-landing.png",
    links: [{ label: "Repository", href: "https://github.com/yandouziyassine/jobai" }],
  },
];

/* The Computer Vision Library, one card per project. `area` drives the filter chips. */
window.PROJECTS = [
  { n: "02", title: "Solar Panel Defects", area: "Classification", depth: 2, image: "images/cv-02.png",
    metric: { value: "82.9%", unit: "test accuracy, 6 classes" },
    summary: "EfficientNet fine-tuned on CPU; Grad-CAM revealed the model partly looked at the roof, not the dust.",
    links: [{ label: "Code", href: cv("02-solar-defect-classifier") }] },
  { n: "03", title: "Receipt Scanner + OCR", area: "Classical CV", depth: 3, image: "images/cv-03.jpg",
    metric: { value: "11×", unit: "faster OCR after switching backend" },
    summary: "Page detection and perspective warp in pure OpenCV, measured on synthetic phone photos with known corners.",
    links: [{ label: "Code", href: cv("03-document-scanner-ocr") }] },
  { n: "06", title: "License Plate Recognition", area: "Detection", depth: 3, image: "images/cv-06.jpg",
    metric: { value: "0 → 90%", unit: "plates read exactly, after one diagnosis" },
    summary: "YOLO11n fine-tuned on CPU (mAP50 0.983) + OCR; a padding fix and plate-grammar rules took reading from 0% to 90%.",
    links: [{ label: "Code", href: cv("06-license-plate-recognition") }] },
  { n: "07", title: "PPE Safety Monitor", area: "Detection", depth: 2, image: "images/cv-07.jpg",
    metric: { value: "90.8%", unit: "of violations flagged" },
    summary: "Hard-hat detector with alert-level metrics and a threshold chosen for safety, not for mAP.",
    links: [{ label: "Code", href: cv("07-ppe-safety-monitor") }] },
  { n: "08", title: "Traffic Analytics", area: "Video", depth: 2, image: "images/cv-08.gif",
    metric: { value: "km/h", unit: "speeds via homography + tracking" },
    summary: "Detection, ByteTrack tracking, line counting and bird's-eye speed estimation on a 4K highway video.",
    links: [{ label: "Code", href: cv("08-traffic-analytics") }] },
  { n: "09", title: "Retail Shelf Monitor", area: "Detection", depth: 2, image: "images/cv-09.jpg",
    metric: { value: "0.838", unit: "mAP50 on shelves of 100–700 products" },
    summary: "Dense small-object detection trained on just 219 images; counting error 13%.",
    links: [{ label: "Code", href: cv("09-retail-shelf-monitor") }] },
  { n: "10", title: "Face Verification", area: "Security", depth: 3, image: "images/cv-10.png",
    metric: { value: "99.35%", unit: "LFW, official 10-fold protocol" },
    summary: "Alignment + embeddings + TAR@FAR, with a consent-based attendance tool and an explicit ethics & limits section.",
    links: [{ label: "Code", href: cv("10-face-recognition") }] },
  { n: "11", title: "Polyp Segmentation", area: "Segmentation", depth: 2, image: "images/cv-11.jpg",
    metric: { value: "0.897", unit: "Dice on colonoscopy images" },
    summary: "U-Net with a Dice + BCE loss for small lesions; the worst failure turned out to be a data artifact.",
    links: [{ label: "Code", href: cv("11-medical-segmentation") }] },
  { n: "12", title: "Satellite Land-Cover", area: "Classification", depth: 2, image: "images/cv-12.jpg",
    metric: { value: "98% vs 47%", unit: "fine-tuned vs zero-shot CLIP" },
    summary: "Why zero-shot fails on satellite tiles: a clear lesson in domain shift.",
    links: [{ label: "Code", href: cv("12-satellite-land-cover") }] },
  { n: "13", title: "PatchCore, from scratch", area: "Anomaly detection", depth: 3, image: "images/cv-13.png",
    metric: { value: "1.000", unit: "image AUROC, matching the CVPR paper" },
    summary: "Reimplemented an industrial anomaly-detection paper in ~150 lines; finds defects without ever seeing one.",
    links: [{ label: "Code", href: cv("13-anomaly-detection-patchcore") }] },
  { n: "14", title: "Monocular Depth → 3D", area: "3D", depth: 1, image: "images/cv-14.gif",
    metric: { value: "1 photo", unit: "→ point cloud → new viewpoints" },
    summary: "Depth Anything V2, pinhole back-projection and z-buffered rendering of new camera angles.",
    links: [{ label: "Code", href: cv("14-monocular-depth-3d") }] },
  { n: "15", title: "Fall Detection", area: "Video", depth: 3, image: "images/cv-15.gif",
    metric: { value: "~97%", unit: "of falls caught in ~0.7 s" },
    summary: "Tells a fall from lying down on purpose using pose dynamics; cross-validation grouped by video.",
    links: [{ label: "Code", href: cv("15-fall-detection") }] },
  { n: "16", title: "Text-to-Image Search", area: "Foundation models", depth: 2, image: "images/cv-16.jpg",
    metric: { value: "75.2%", unit: "Recall@10 on COCO 5k" },
    summary: "CLIP embeddings + FAISS: search photos by typing a description, with a web UI.",
    links: [{ label: "Code", href: cv("16-text-to-image-search") }] },
  { n: "17", title: "Zero-Shot Auto-Labeling", area: "Foundation models", depth: 3, image: "images/cv-17.jpg",
    metric: { value: "0.558 vs 0.473", unit: "zero-shot vs supervised mAP" },
    summary: "Grounding DINO + SAM label images from a text prompt and beat a COCO-trained YOLO, 118× slower.",
    links: [{ label: "Code", href: cv("17-auto-labeling") }] },
  { n: "18", title: "Image & Video Q&A", area: "Foundation models", depth: 3, image: "images/cv-18.jpg",
    metric: { value: "+9 pts", unit: "VQA accuracy from prompt wording alone" },
    summary: "A local vision-language model on CPU (VQAv2 67%) and where it fails against a specialized pipeline.",
    links: [{ label: "Code", href: cv("18-video-qa-assistant") }] },
  { n: "19", title: "Edge Deployment Benchmark", area: "Deployment", depth: 3, image: "images/cv-19.png",
    metric: { value: "17×", unit: "faster on iGPU/NPU; INT8 −0.1 mAP" },
    summary: "PyTorch vs ONNX vs OpenVINO on CPU, iGPU and NPU, plus the hybrid-CPU threading trap I found along the way.",
    links: [{ label: "Code", href: cv("19-edge-deployment-benchmark") }] },
  { n: "20", title: "Football Analytics", area: "Video", depth: 2, image: "images/cv-20.jpg",
    metric: { value: "0.98", unit: "player AP50; teams split by jersey color" },
    summary: "Detection, unsupervised team assignment and ball possession from broadcast frames.",
    links: [{ label: "Code", href: cv("20-football-analytics") }] },
  { n: "01", title: "Virtual Painter", area: "Classical CV", depth: 1, image: null,
    metric: { value: "live", unit: "draw in the air with hand gestures" },
    summary: "MediaPipe hand tracking, gesture state machine and a FastAPI live stream.",
    links: [{ label: "Code", href: cv("01-virtual-painter") }] },
];

window.SKILLS = [
  { group: "Computer vision & ML",
    items: ["Detection (YOLO fine-tuning)", "Segmentation (U-Net, SAM)", "Tracking (ByteTrack)", "Pose estimation",
            "Anomaly detection", "Foundation models (CLIP, Grounding DINO, VLMs)", "PyTorch · OpenCV · TensorFlow",
            "Evaluation design"] },
  { group: "AI cybersecurity",
    items: ["MCP servers · OAuth 2.1 (PKCE + DCR)", "IDOR-safe API design", "Signature-verified webhooks",
            "nmap · Wireshark", "MITRE ATT&CK", "Sanitizers (ASan/UBSan)", "Dependency auditing (pip-audit)",
            "Responsible face recognition"] },
  { group: "Deployment & performance",
    items: ["OpenVINO · ONNX Runtime", "INT8 quantization (NNCF)", "CPU / iGPU / NPU profiling", "Docker · Docker Compose",
            "GitHub Actions · CircleCI", "AWS · Google Cloud · Azure", "Vercel · Firebase · Linux"] },
  { group: "Programming",
    items: ["Python", "C · C++20", "Java", "JavaScript · TypeScript", "SQL", "HTML/CSS", "Assembly", "MATLAB"] },
  { group: "Frameworks & data",
    items: ["React · Next.js · Tailwind CSS", "Node.js · NestJS", "FastAPI · Flask · Django", "Spring Boot",
            "gRPC / Protocol Buffers", "Pandas · NumPy · scikit-learn", "PostgreSQL · MongoDB · Supabase · Redis",
            "Power BI"] },
  { group: "Hardware",
    items: ["Intel NPU & Arc iGPU (OpenVINO)", "Raspberry Pi", "FPGA (Quartus II)", "Computer architecture",
            "Networking (CCNA track)", "Signals & systems"] },
  { group: "Languages",
    items: ["French: fluent", "English: fluent", "Arabic: native"] },
];
