# 🔧 Fixma

All-in-one Figma plugin for **analyzing**, **fixing** and **organizing** your design files.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Figma Plugin](https://img.shields.io/badge/Figma-Plugin-ff69b4.svg)](https://www.figma.com/community)

---

## Screenshots

| Export | Components | Variants |
|--------|------------|----------|
| ![Export](https://github.com/user-attachments/assets/ea55a166-889e-4a28-9886-8b8b0623097d) | ![Components](https://github.com/user-attachments/assets/8718c4c1-f252-4a50-abb7-d7aad14f48d1) | ![Variants](https://github.com/user-attachments/assets/0c534667-29d1-4c05-8c35-caac63061f60) |

| Analyze | Layout |
|---------|--------|
| ![Analyze](https://github.com/user-attachments/assets/4ae409a2-dbd3-4f87-a9e6-f22ebd745659) | ![Layout](https://github.com/user-attachments/assets/dc3034ea-9efa-4c36-900a-a62e6c5161e5) |

---

## Features

- **📦 Export** — Page JSON export compatible with the Figma REST API format
- **🧩 Components** — Detect structurally similar frames and convert them into master components + instances
- **🔀 Variants** — Combine selected objects into a Component Set with one click
- **🔍 Analyze** — Naming issues, missing safe areas, empty frames, zero-size objects — detect and auto-fix
- **📐 Layout** — Constraint & sizing intent analysis with one-click auto-fix

---

## Getting Started

### Requirements

- Node.js 14+
- Figma Desktop

### Installation

```bash
git clone https://github.com/bilal-arikan/fixma.git
cd fixma
npm install
npm run build
```

### Load in Figma

1. Open Figma Desktop
2. **Plugins → Development → Import plugin from manifest...**
3. Select the `manifest.json` file

---

## Commands

```bash
npm run build      # Build plugin
npm run watch      # Watch & rebuild on changes
npm run dev        # Build + watch
```

---

## Tech Stack

- **TypeScript** + Figma Plugin API
- **esbuild** — fast bundler
- **HTML/CSS** — inline UI

---

## Author

**Bilal Arikan**

---

## License

[MIT](LICENSE) — Open source, contributions welcome!
