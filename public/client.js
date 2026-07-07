(() => {
  const COLORS = ['#1c2733', '#d64545', '#2f7ed8', '#2fa86a', '#e8a33d', '#8452d5'];

  const entryScreen = document.getElementById('entry-screen');
  const boardScreen = document.getElementById('board-screen');
  const nameInput = document.getElementById('name-input');
  const roomInput = document.getElementById('room-input');
  const joinBtn = document.getElementById('join-btn');
  const generateBtn = document.getElementById('generate-btn');
  const roomLabel = document.getElementById('room-label');
  const copyCodeBtn = document.getElementById('copy-code-btn');
  const userCountEl = document.getElementById('user-count');
  const swatchesEl = document.getElementById('swatches');
  const sizeRange = document.getElementById('size-range');
  const undoBtn = document.getElementById('undo-btn');
  const clearBtn = document.getElementById('clear-btn');
  const saveBtn = document.getElementById('save-btn');
  const canvas = document.getElementById('board');
  const cursorLayer = document.getElementById('cursor-layer');
  const toastEl = document.getElementById('toast');
  const ctx = canvas.getContext('2d');

  let socket = null;
  let myColor = COLORS[Math.floor(Math.random() * COLORS.length)];
  let myName = 'Guest';
  let currentSize = Number(sizeRange.value);
  let drawing = false;
  let currentStroke = null;
  let localStrokes = []; // full history for redraw-on-resize
  let currentRoom = null;
  const remoteCursors = new Map(); // userId -> element

  // ---------- Entry flow ----------

  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion

  function generateBoardCode() {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return code;
  }

  generateBtn.addEventListener('click', () => {
    roomInput.value = generateBoardCode();
    roomInput.focus();
  });

  joinBtn.addEventListener('click', joinBoard);
  [nameInput, roomInput].forEach((el) =>
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') joinBoard();
    })
  );

  function joinBoard() {
    myName = (nameInput.value || 'Guest').trim().slice(0, 20) || 'Guest';
    const room = (roomInput.value || generateBoardCode()).trim().toUpperCase().slice(0, 30);
    currentRoom = room;

    entryScreen.classList.add('hidden');
    boardScreen.classList.remove('hidden');
    roomLabel.textContent = room;

    setupCanvas();
    buildSwatches();
    connectSocket(room);
  }

  copyCodeBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(currentRoom).then(
      () => showToast('Code copied — share it so others can join'),
      () => showToast(currentRoom)
    );
  });

  // ---------- Swatches ----------

  function buildSwatches() {
    swatchesEl.innerHTML = '';
    COLORS.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'swatch' + (c === myColor ? ' active' : '');
      b.style.background = c;
      b.addEventListener('click', () => {
        myColor = c;
        [...swatchesEl.children].forEach((el) => el.classList.remove('active'));
        b.classList.add('active');
      });
      swatchesEl.appendChild(b);
    });
  }

  sizeRange.addEventListener('input', () => {
    currentSize = Number(sizeRange.value);
  });

  // ---------- Canvas setup & resize-safe redraw ----------

  function setupCanvas() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
  }

  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redrawAll();
  }

  function redrawAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    localStrokes.forEach(drawFullStroke);
  }

  function drawFullStroke(stroke) {
    if (!stroke.points || stroke.points.length === 0) return;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    stroke.points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  }

  function drawSegment(color, size, from, to) {
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  function getPoint(evt) {
    const rect = canvas.getBoundingClientRect();
    const e = evt.touches ? evt.touches[0] : evt;
    return {
      x: (e.clientX - rect.left),
      y: (e.clientY - rect.top),
    };
  }

  // ---------- Local drawing (pointer events cover mouse + touch + pen) ----------

  canvas.addEventListener('pointerdown', (e) => {
    drawing = true;
    const p = getPoint(e);
    const id = `${socket.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    currentStroke = { id, color: myColor, size: currentSize, points: [p] };
    localStrokes.push(currentStroke);
    socket.emit('draw-start', { id, color: myColor, size: currentSize, point: p });
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = getPoint(e);
    socket.emit('cursor-move', { x: p.x, y: p.y, name: myName, color: myColor });

    if (!drawing || !currentStroke) return;
    const prev = currentStroke.points[currentStroke.points.length - 1];
    currentStroke.points.push(p);
    drawSegment(currentStroke.color, currentStroke.size, prev, p);
    socket.emit('draw-move', { id: currentStroke.id, point: p });
  });

  function endStroke() {
    if (!drawing) return;
    drawing = false;
    if (currentStroke) socket.emit('draw-end', { id: currentStroke.id });
    currentStroke = null;
  }

  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointerleave', endStroke);
  canvas.addEventListener('pointercancel', endStroke);

  // ---------- Toolbar actions ----------

  clearBtn.addEventListener('click', () => {
    socket.emit('clear-canvas');
  });

  undoBtn.addEventListener('click', () => {
    socket.emit('undo-last');
  });

  // ---------- Save / restore (localStorage) ----------

  function storageKey(room) {
    return `whiteboard:${room}`;
  }

  saveBtn.addEventListener('click', () => {
    try {
      localStorage.setItem(storageKey(currentRoom), JSON.stringify(localStrokes));
      showToast('Board saved to this browser');
    } catch (err) {
      showToast('Could not save (storage full or unavailable)');
    }
  });

  function loadSavedStrokes(room) {
    try {
      const raw = localStorage.getItem(storageKey(room));
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  // ---------- Toast ----------

  let toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  // ---------- Remote cursors ----------

  function updateRemoteCursor({ userId, x, y, name, color }) {
    let el = remoteCursors.get(userId);
    if (!el) {
      el = document.createElement('div');
      el.className = 'remote-cursor';
      el.innerHTML = `<div class="dot"></div><div class="tag"></div>`;
      cursorLayer.appendChild(el);
      remoteCursors.set(userId, el);
    }
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.querySelector('.dot').style.background = color;
    el.querySelector('.tag').style.background = color;
    el.querySelector('.tag').textContent = name;
  }

  function removeRemoteCursor(userId) {
    const el = remoteCursors.get(userId);
    if (el) {
      el.remove();
      remoteCursors.delete(userId);
    }
  }

  // ---------- Socket wiring ----------

  function connectSocket(room) {
    socket = io();

    socket.on('connect', () => {
      socket.emit('join-room', { room, name: myName, color: myColor });
    });

    socket.on('canvas-state', (strokes) => {
      if (strokes.length === 0) {
        const saved = loadSavedStrokes(room);
        if (saved && saved.length > 0) {
          localStrokes = saved;
          redrawAll();
          socket.emit('restore-board', saved);
          showToast('Restored your saved board');
          return;
        }
      }
      localStrokes = strokes.map((s) => ({ ...s }));
      redrawAll();
    });

    socket.on('draw-start', (stroke) => {
      localStrokes.push({ ...stroke, points: [stroke.point] });
    });

    socket.on('draw-move', ({ id, point }) => {
      const stroke = localStrokes.find((s) => s.id === id);
      if (!stroke) return;
      const prev = stroke.points[stroke.points.length - 1];
      stroke.points.push(point);
      drawSegment(stroke.color, stroke.size, prev, point);
    });

    socket.on('draw-end', () => {
      // no-op locally; state already applied incrementally
    });

    socket.on('clear-canvas', () => {
      localStrokes = [];
      redrawAll();
      showToast('Board cleared');
    });

    socket.on('user-count', (count) => {
      userCountEl.textContent = count;
    });

    socket.on('user-joined', ({ name }) => showToast(`${name} joined the board`));
    socket.on('user-left', ({ name }) => showToast(`${name} left`));

    socket.on('cursor-move', (data) => updateRemoteCursor(data));
    socket.on('cursor-remove', ({ userId }) => removeRemoteCursor(userId));
  }
})();
