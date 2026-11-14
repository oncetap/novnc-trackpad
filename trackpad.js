(() => {
	if(!document.getElementById("noVNC_container")) return;

	const KEY = "nv_trackpad";
	const UI_SEL = "#noVNC_control_bar_anchor, .noVNC_panel, .noVNC_modal, #noVNC_connect_dlg, #noVNC_credentials_dlg, #noVNC_fallback_error";
	const MASK = { 0: 1, 1: 4, 2: 2 };

	let on = localStorage.getItem(KEY) !== "false";
	let releaseCapture;
	import(new URL("core/util/events.js", location.href).href).then((m) => {
		releaseCapture = m?.releaseCapture;
	}).catch(() => {});

	const btn = Object.assign(document.createElement("button"), {
		id: "nv-trackpad-btn",
		type: "button"
	});
	Object.assign(btn.style, {
		position: "fixed",
		right: "12px",
		bottom: "12px",
		zIndex: "20000",
		padding: "7px 12px",
		borderRadius: "999px",
		border: "1px solid #fff4",
		color: "#fff",
		font: "600 12px/1 system-ui, sans-serif",
		cursor: "pointer",
		backdropFilter: "blur(6px)",
		userSelect: "none",
		touchAction: "manipulation",
		transition: "background .15s"
	});

	function syncBtn(){
		btn.textContent = `Trackpad: ${on ? "ON" : "OFF"}`;
		btn.style.background = on ? "#228be6d9" : "#1e1e1eb8";
	}

	btn.onclick = (e) => {
		e.stopPropagation();
		on = !on;
		localStorage.setItem(KEY, String(on));
		syncBtn();
	};
	syncBtn();
	document.body.append(btn);

	const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
	const mid = (t) => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
	const getCanvas = () => [...document.querySelectorAll("#noVNC_container canvas")].find((c) => {
		const r = c.getBoundingClientRect();
		return c.width && c.height && r.width > 50 && r.height > 50 && getComputedStyle(c).pointerEvents !== "none";
	});

	function canTrack(x, y){
		const c = getCanvas();
		if(!c) return false;
		if(document.elementsFromPoint(x, y).some((el) => el.id !== "noVNC_mouse_capture_elem" && (el === btn || el.closest(UI_SEL)))) return false;
		const r = c.getBoundingClientRect();
		return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
	}

	let cx, cy;
	let active = false, moved = false, dragging = false, armed = false;
	let fingers = 0, t0 = 0, sx = 0, sy = 0, lx = 0, ly = 0, lt = 0, mx = 0, my = 0, tapX = 0, tapY = 0;
	let tapTimer = 0, holdTimer = 0;

	function syncCursor(){
		const c = getCanvas();
		if(!c) return null;
		const r = c.getBoundingClientRect();
		const x0 = Math.max(0, r.left), x1 = Math.min(innerWidth - 1, r.right - 1);
		const y0 = Math.max(0, r.top), y1 = Math.min(innerHeight - 1, r.bottom - 1);
		if(x1 < x0 || y1 < y0) return null;
		cx = clamp(cx ?? (x0 + x1) / 2, x0, x1);
		cy = clamp(cy ?? (y0 + y1) / 2, y0, y1);
		return c;
	}

	function mouse(type, button = 0, buttons = 0){
		const c = syncCursor();
		if(!c) return;
		c.dispatchEvent(new MouseEvent(type, {
			bubbles: true,
			cancelable: true,
			view: window,
			clientX: cx,
			clientY: cy,
			button,
			buttons
		}));
		if(type === "mouseup"){
			if(releaseCapture){
				releaseCapture();
			}else{
				window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button }));
			}
		}
	}

	function click(button = 0){
		if(!syncCursor()) return;
		mouse("mousemove", 0, 0);
		mouse("mousedown", button, MASK[button] ?? 1);
		mouse("mouseup", button, 0);
	}

	function wheel(deltaX, deltaY){
		syncCursor()?.dispatchEvent(new WheelEvent("wheel", {
			bubbles: true,
			cancelable: true,
			view: window,
			clientX: cx,
			clientY: cy,
			deltaX,
			deltaY,
			deltaMode: 0
		}));
	}

	function onStart(e){
		if(!on) return;
		if(!active){
			const t = e.touches[0];
			if(!t || !canTrack(t.clientX, t.clientY)) return;
			active = true;
			fingers = e.touches.length;
			moved = dragging = false;
			t0 = lt = e.timeStamp;
			sx = lx = t.clientX;
			sy = ly = t.clientY;
			syncCursor();
			if(fingers === 1){
				armed = Boolean(tapTimer && Math.hypot(t.clientX - tapX, t.clientY - tapY) < 35);
				clearTimeout(holdTimer);
				holdTimer = setTimeout(() => {
					holdTimer = 0;
					if(!active || moved || fingers !== 1) return;
					dragging = true;
					armed = false;
					clearTimeout(tapTimer);
					tapTimer = 0;
					mouse("mousedown", 0, 1);
					btn.animate([{ transform: "scale(.9)" }, { transform: "scale(1)" }], 140);
				}, 380);
			}else if(fingers >= 2){
				[mx, my] = mid(e.touches);
			}
		}else{
			fingers = Math.max(fingers, e.touches.length);
			clearTimeout(holdTimer);
			clearTimeout(tapTimer);
			holdTimer = tapTimer = 0;
			armed = false;
			if(e.touches.length >= 2)[mx, my] = mid(e.touches);
		}
		e.preventDefault();
		e.stopImmediatePropagation();
	}

	function onMove(e){
		if(!on || !active) return;
		e.preventDefault();
		e.stopImmediatePropagation();
		if(e.touches.length === 1 && fingers === 1){
			const t = e.touches[0];
			if(!moved && Math.hypot(t.clientX - sx, t.clientY - sy) < 7) return;
			if(!moved){
				moved = true;
				clearTimeout(holdTimer);
				holdTimer = 0;
				if(armed){
					clearTimeout(tapTimer);
					tapTimer = 0;
					armed = false;
					dragging = true;
					mouse("mousedown", 0, 1);
				}
				lx = t.clientX;
				ly = t.clientY;
				lt = e.timeStamp;
				return;
			}
			const dx = t.clientX - lx, dy = t.clientY - ly;
			const dt = clamp(e.timeStamp - lt, 8, 64);
			const gain = Math.min(2.8, .75 + Math.hypot(dx, dy) / dt * 1.4);
			cx += dx * gain;
			cy += dy * gain;
			syncCursor();
			mouse("mousemove", 0, dragging ? 1 : 0);
			lx = t.clientX;
			ly = t.clientY;
			lt = e.timeStamp;
		}else if(e.touches.length === 2 && fingers === 2){
			const [nx, ny] = mid(e.touches);
			const dx = nx - mx, dy = ny - my;
			if(moved || Math.hypot(dx, dy) >= 3){
				moved = true;
				wheel(-dx * 1.6, -dy * 1.6);
				mx = nx;
				my = ny;
			}
		}
	}

	function onEnd(e){
		if(!on || !active) return;
		e.preventDefault();
		e.stopImmediatePropagation();
		clearTimeout(holdTimer);
		holdTimer = 0;
		if(e.touches.length) return;
		if(dragging){
			dragging = false;
			mouse("mouseup", 0, 0);
		}else if(!moved && e.timeStamp - t0 < 400){
			if(fingers === 2){
				click(2);
			}else if(fingers === 3){
				click(1);
			}else if(fingers === 1){
				if(armed){
					clearTimeout(tapTimer);
					tapTimer = 0;
					armed = false;
					click(0);
					setTimeout(() => click(0), 30);
				}else{
					[tapX, tapY] = [sx, sy];
					tapTimer = setTimeout(() => {
						tapTimer = 0;
						click(0);
					}, 180);
				}
			}
		}
		active = moved = armed = false;
		fingers = 0;
	}

	function blockTouchPointer(e){
		if(!on || e.pointerType !== "touch") return;
		if(active || canTrack(e.clientX, e.clientY)){
			e.preventDefault();
			e.stopImmediatePropagation();
		}
	}

	for(const [ev, fn] of [["touchstart", onStart], ["touchmove", onMove], ["touchend", onEnd], ["touchcancel", onEnd], ["pointerdown", blockTouchPointer], ["pointermove", blockTouchPointer], ["pointerup", blockTouchPointer], ["pointercancel", blockTouchPointer]]){
		document.addEventListener(ev, fn, { capture: true, passive: false });
	}
})();