# ⚡ ShareMax — iOS 13 High Speed Local Wi-Fi File Sharing

**ShareMax** is a local offline web application designed to share files, photos, videos, and text notes between **iPhone (iOS)**, **Android**, and **Windows PC** over a **Phone Hotspot / Local Wi-Fi** with **0 KB Mobile Data Usage** (100% No internet charges).

---

## 🌟 Key Features

1. **📱 0 KB Mobile Data Charges**:
   - Works 100% offline over local Wi-Fi / Phone Hotspot. Mobile Data can remain **turned OFF**!
2. **🍎 Clean iOS 13 Design System**:
   - Signature Apple glassmorphism background blurs (`backdrop-filter`).
   - iOS AirDrop style animated radar rings.
   - iOS 13 Segmented Navigation Tabs (Files, Clipboard, Connection Guide).
   - Light / Dark Mode toggle.
3. **🚀 High Speed Wi-Fi Transfers**:
   - High speed transfer rate (up to 300+ MB/s over local Wi-Fi).
   - Progress bar with real-time transfer speed (MB/s) and remaining time.
4. **📷 Instant QR Code Scan**:
   - Auto-generates a QR code on screen. Simply open iPhone Camera or Android Camera to scan and join instantly!
5. **📁 File Previewer & Manager**:
   - Inline photo slideshow viewer, video player (MP4, WEBM, MOV), audio player (MP3, WAV), document previewer.
   - Category filtering (Photos, Videos, Audio, Documents, Others).
6. **📋 Instant Text & Clipboard Sharing**:
   - Copy links, Wi-Fi passwords, text snippets, and notes between iPhone, Android, and Windows with 1 click.
7. **🛠️ Zero Dependencies**:
   - Pure HTML, Vanilla CSS, and JavaScript.
   - Comes with built-in zero-dependency PowerShell server (`server.ps1`) and Node.js server (`server.js`).

---

## 🚀 How to Run ShareMax on Windows

1. **Turn on Mobile Hotspot** on your phone (iPhone or Android).
2. Connect your Windows PC to the Phone Hotspot (Internet data can be turned off!).
3. Double-click **`start_sharemax.bat`** in this folder (`f:\M\sharemax`).
4. The server will start and display your local hotspot URL (e.g., `http://172.20.10.14:8080`).
5. Scan the QR code on screen using your iPhone/Android camera to open ShareMax in your mobile browser!

---

## 💻 Technical Architecture

```
f:\M\sharemax\
├── index.html            # iOS 13 UI Web Interface
├── style.css             # Apple SF Pro Design System & Glassmorphism
├── app.js                # Core JS app logic, drag-drop, uploads & previewer
├── lib/
│   └── qrcode.min.js     # Standalone offline QR Code Generator
├── server.ps1            # Zero-dependency PowerShell .NET TcpListener Server
├── start_sharemax.bat    # 1-Click Windows batch launcher
├── server.js             # Optional Node.js alternative backend
└── shared_files/         # Storage folder for uploaded files
```

---

## 👨‍💻 Developer & Contact Info

- **Developer**: Manuja Hashan
- **Contact Email**: `34batchcivilengineering@gmail.com`

