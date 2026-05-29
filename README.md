# 📸 Local Screenshot Organizer (AI-Powered)

A privacy-focused, desktop application that automatically monitors, analyzes, and categorizes your screenshots using local AI. 

## 🚀 Features
- **Multi-Dimensional AI Classification**: Uses OCR, UI analysis, Visual AI, and Semantic similarity.
- **Smart Study Groups**: Automatically clusters educational content into subjects using Sentence Transformers.
- **Batch & Cool Processing**: Optimized for local hardware with cooling breaks to protect your laptop.
- **Privacy First**: 100% Offline. Your screenshots never leave your machine.
- **Duplicate Detection**: Find visually similar captures using Perceptual Hashing (pHash).

## 🛠️ Tech Stack
- **Frontend**: React, Vite, Tailwind CSS, Framer Motion.
- **Backend**: Electron, Node.js, SQLite.
- **AI Engines**: 
  - **Tesseract.js** (OCR)
  - **TensorFlow.js** (Visual Classification)
  - **Sentence Transformers** (Semantic Similarity - Python)

## 📦 Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/screenshot-organizer.git
   cd screenshot-organizer
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   cd renderer && npm install
   ```

3. **Set up Python Environment**:
   ```bash
   pip install sentence-transformers
   ```

4. **Run the Application**:
   ```bash
   npm run dev
   ```

## 📁 Folder Structure
- `/electron`: Logic for AI analyzers and file system watching.
- `/python`: Semantic similarity engine.
- `/renderer`: React-based user interface.
- `/data`: Local SQLite metadata storage.

## ⚖️ License
MIT
