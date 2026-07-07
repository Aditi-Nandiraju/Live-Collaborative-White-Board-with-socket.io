# Drafting Table — Real-Time Collaborative Whiteboard

A multi-user whiteboard built with **Node.js + Express + Socket.IO** on the backend and
vanilla HTML5 Canvas on the frontend. Anyone who opens the same "board name" sees every
stroke, cursor movement, undo, and clear happen live, with no page refresh.

## Features

- Real-time drawing sync across unlimited simultaneous users
- Named "boards" (rooms) — share a board name with someone to draw together
- Live remote cursors labeled with each person's name/color
- Color palette + adjustable brush weight
- Undo (removes your own last stroke) and clear (wipes the whole board for everyone)
- Late joiners automatically receive the full current drawing (in-memory canvas state)
- Live "N here" user count and join/leave toasts
- Responsive layout, works on touch devices (tablet/phone) as well as mouse

## How it works

- `server.js` runs an Express static server + a Socket.IO server. Each "board" is an
  in-memory room that stores an array of strokes (`{id, color, size, points[]}`).
- When you draw, the client emits `draw-start` → `draw-move` (repeated) → `draw-end`.
  The server appends points to that stroke's record and re-broadcasts to everyone else
  in the room, so a new tab/user joining mid-drawing can be caught up via `canvas-state`.
- Cursor position is throttled by the browser's natural pointermove rate and broadcast
  as `cursor-move`, letting you see collaborators' pens moving in real time.
- State is in-memory only (no database) — perfect for demos; add persistence (Redis/Mongo)
  if you want boards to survive a server restart.

## Run it locally

Requires Node.js 18+.

```bash
npm install
npm start
```

Then open **http://localhost:3000** in two different browser windows (or a normal
window + an incognito window, so they don't share cookies), type the *same* board name
in both, and start drawing — you'll see both cursors and strokes live in each window.

## Project structure

```
whiteboard/
├── server.js          # Express + Socket.IO server, room/stroke state
├── package.json
├── public/
│   ├── index.html      # Entry screen + board screen markup
│   ├── style.css       # Drafting-table visual theme
│   └── client.js       # Canvas drawing, pointer events, socket wiring
└── README.md
```

---

## 1. Push this to GitHub

From this project folder:

```bash
git init
git add .
git commit -m "Real-time collaborative whiteboard with Socket.IO"
git branch -M main
gh repo create realtime-whiteboard --public --source=. --remote=origin --push
```

(No `gh` CLI? Create an empty repo on github.com first, then:)

```bash
git remote add origin https://github.com/<your-username>/realtime-whiteboard.git
git push -u origin main
```

---

## 2. Deploy it live

Render.com
1. Push the repo to GitHub (above).
2. On [render.com](https://render.com) → **New +** → **Web Service** → connect the repo.
3. Build command: `npm install` — Start command: `npm start`.
4. Leave the default Node environment; Render auto-detects the `PORT` env var, which
   `server.js` already reads via `process.env.PORT`.
5. Deploy. You'll get a URL like `https://realtime-whiteboard.onrender.com`.


---

## Notes / possible extensions

- Swap the in-memory `rooms` object for Redis if you need multiple server instances
  behind a load balancer (Socket.IO's Redis adapter handles cross-instance broadcast).
- Add shapes (rectangle/circle/text) by extending the stroke schema with a `type` field.
- Add authentication if boards should be private rather than "anyone with the name."
# Live-Collaborative-White-Board-with-socket.io
