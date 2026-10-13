# Aircast — Gesture Remote & Air Canvas

A webcam app with two modes:

- **Draw** — point your index finger to paint a glowing trail in the air. Pinch to change color, make a fist to erase, open your palm to clear the canvas.
- **Remote** — control music/video playback with gestures: fist = play/pause, swipe left/right = previous/next track, peace sign = volume up, pinch = volume down, open palm = stop.

No dataset or training involved. The browser loads Google's pretrained **MediaPipe Hand Landmarker** from a CDN, reads 21 landmarks from the user's webcam, and interprets finger positions locally. Camera frames never pass through Flask.

---

## 1. Install Python

You need Python 3.10 or newer. Python only serves the page; hand tracking runs in the browser.

1. Go to https://www.python.org/downloads/
2. Download **Python 3.11**
3. Run the installer — **tick the box that says "Add Python to PATH"** before clicking Install

## 2. Open this folder in VS Code

1. Install VS Code from https://code.visualstudio.com/ if you don't have it
2. Open VS Code → File → Open Folder → select the `gesture-remote-app` folder
3. Install the "Python" extension if VS Code prompts you to (small popup bottom-right)

## 3. Open a terminal inside VS Code

Menu bar → **Terminal → New Terminal**. A black panel opens at the bottom — that's where you'll type the next commands.

## 4. Create a virtual environment (keeps this project's packages separate)

Type this and press Enter:

```
python -m venv venv
```

Then activate it:

- **Windows:** `venv\Scripts\activate`
- **Mac/Linux:** `source venv/bin/activate`

You'll know it worked if you see `(venv)` appear at the start of the terminal line.

## 5. Install the required packages

```
pip install -r requirements.txt
```

This downloads Flask, the small web server used to serve the page.

## 6. Run the app

```
python app.py
```

You should see a message like `Running on http://127.0.0.1:5000`.

## 7. Open it in your browser

Go to **http://127.0.0.1:5000** in Chrome or Edge. You should see your webcam feed. Hold your hand up so it's clearly visible and start with **Draw mode** — point your index finger and move it around.

To stop the app, click back in the VS Code terminal and press `Ctrl + C`.

---

## Troubleshooting

- **Camera access needed:** allow camera access for `127.0.0.1` in the browser, then click **Enable camera**. Another app may already be using the webcam.
- **Hand model does not load:** the first launch needs internet access to download the MediaPipe WASM runtime and hand-landmarker model from their CDNs.
- **Remote mode:** the built-in player keeps playback and volume actions inside the page. It does not send operating-system media keys or process camera frames on the server.
- **Gestures feel jumpy:** make sure your hand is well-lit and fully inside the frame; MediaPipe tracks best with the whole hand visible.

## Project structure

```
gesture-remote-app/
├── app.py              — Flask page server only
├── requirements.txt    — Python package to install
├── templates/
│   └── index.html      — Page structure
├── static/
│   ├── style.css        — Visual design (dark studio theme, glow effects)
│   └── script.js        — Browser camera, MediaPipe landmarks, gestures, drawing, and player
└── README.md
```
