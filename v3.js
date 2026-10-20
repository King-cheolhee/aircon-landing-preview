(function () {
// 히어로 모션(시안 v3)의 순수 계산 — DOM·kit 없음. build.mjs 가 읽어 정적 그림(끝 장면)을 만들고,
// 같은 함수 본문을 페이지 스크립트에 넣어 seek(t) 가 쓴다. 모든 함수는 시간 t(초)의 순수 함수다(타이머·난수·프레임 간 상태 없음).

// ── 집 배치(세계 단위 ≈ px, x 오른쪽, y 앞쪽(발코니), z 위) ─────────────────────
// 평면도와 같은 순서: 앞줄 왼쪽부터 방3·방2·거실·안방, 실외기실은 뒤쪽 오른쪽 구석.
const FRONT = { y0: 96, y1: 200 }; // 앞줄 방 깊이
const BALCONY = { y0: 200, y1: 214 };
const WIDTH = 346;
const ROOMS = [
  { id: "room3", x0: 0, x1: 66, y0: 96, y1: 200, kind: "room" },
  { id: "room2", x0: 66, x1: 132, y0: 96, y1: 200, kind: "room" },
  { id: "living", x0: 132, x1: 250, y0: 96, y1: 200, kind: "room" },
  { id: "master", x0: 250, x1: 346, y0: 96, y1: 200, kind: "room" },
  { id: "entry", x0: 0, x1: 70, y0: 0, y1: 96, kind: "back" },
  { id: "bath", x0: 70, x1: 132, y0: 30, y1: 96, kind: "back" },
  { id: "kitchen", x0: 132, x1: 250, y0: 0, y1: 96, kind: "back" },
  { id: "dress", x0: 250, x1: 300, y0: 0, y1: 96, kind: "back" },
  { id: "dress2", x0: 300, x1: 346, y0: 50, y1: 96, kind: "back" },
  { id: "utility", x0: 300, x1: 346, y0: 0, y1: 50, kind: "utility" },
];
const CEIL = 40; // 천장(벽을 자른 높이) — 실내기 판넬이 이 면에 붙는다
const UNITS = [
  { id: "living", cx: 191, cy: 148, s: 30 },
  { id: "master", cx: 298, cy: 148, s: 26 },
  { id: "room2", cx: 99, cy: 148, s: 24 },
  { id: "room3", cx: 33, cy: 148, s: 24 },
]; // 낙하·등장 순서 = 이 배열 순서(거실 → 안방 → 방 → 방)
const OUTDOOR = { x: 312, y: 6, w: 28, d: 28, h: 32 }; // 실외기실 안 실외기

// ── 스프링(닫힌 형식 감쇠 스프링, 질량 1) ──────────────────────────────────────
function spring(t, w, z) {
  if (t <= 0) return 0;
  if (z >= 1) return 1 - Math.exp(-w * t) * (1 + w * t);
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, t) => { const u = clamp01((t - a) / (b - a)); return u * u * (3 - 2 * u); };
// 목표가 여러 번 바뀌는 값: 변화마다 (새 목표 − 이전 목표) × 계단 응답을 더한다(선형이라 정확).
function track(t, v0, keys) {
  let v = v0, prev = v0;
  for (const [ti, vi, w, z] of keys) { v += (vi - prev) * spring(t - ti, w, z); prev = vi; }
  return v;
}

// ── 시간표(초). 한 바퀴 D 초, t = D 는 t = 0(끝 장면)과 같은 그림이라 이음새가 없다 ────────
const D = 18;
const T = {
  planIn: [0, 0.7], // 끝 장면 → 평면도 교차 페이드(평면도 1.03 → 1)
  drops: [1.0, 1.5, 2.0, 2.5, 3.1], // 거실 → 안방 → 방 → 방 → 실외기
  zoom: 4.6, // 거실 라벨로 확대 시작(실외기 라벨이 붙고 약 1초 읽기 뒤)
  swap: [7.0, 8.0], // 평면도 → 아이소 교차 페이드
  units: [7.7, 8.3, 8.7, 9.1], // 실내기 매달림(UNITS 순서) — 거실은 아이소가 나타나는 중에 내려온다
  pullback: 8.7, // 카메라가 천천히 물러남
  pipes: [9.8, 10.15, 10.5, 10.85], // 실내기별 배관 그리기 시작(UNITS 순서)
  pipeDur: 1.1,
  main: [11.75, 12.75], // 분기관 → 실외기 배관
  flow: 12.9, // 냉매 흐름·팬 시작
  end: 13.4, // 끝 장면 라벨·문구
  caps: [0, 4.6, 8.0, 9.8, 11.7, 13.4], // 자막 바뀌는 시각(labels.json captions 순서)
};
const ZOOM = 2.6; // 평면도 확대 배율(거실 라벨 중심)
const ISO_Z = [1.9, 2.4]; // 아이소가 나타날 때 배율 → 확대가 이어져 머무는 배율(평면도 확대와 같은 방향)

// 라벨 낙하: 위에서 떨어져 약한 오버슈트(ζ 0.62 ≈ 8%)로 붙고, 넘친 만큼 살짝 눌린다.
const DROP = { h: 46, w: 11, z: 0.6 };
function dropAt(t, t0) {
  const x = spring(t - t0, DROP.w, DROP.z);
  return {
    dy: -DROP.h * (1 - x), // px, 위(−)에서 0으로
    op: clamp01((t - t0) / 0.12),
    squash: Math.max(0, x - 1) / 0.08, // 0..≈1, 넘친 순간만
    shadow: clamp01(x) ** 3,
  };
}

// 평면도 카메라: 배율과 초점(평면도 정규 좌표 0..1). 1 → ZOOM(2초 안 정착), 교차 페이드 동안 조금 더 확대.
function planCam(t, focus) {
  const s0 = 1.03 - 0.03 * smooth(T.planIn[0], T.planIn[1], t);
  const s = track(t, s0, [[T.zoom, ZOOM, 4.2, 1], [T.swap[0], ZOOM * 1.18, 3, 1]]);
  const k = clamp01((s - 1) / (ZOOM - 1));
  return { s, fx: 0.5 + (focus[0] - 0.5) * k, fy: 0.5 + (focus[1] - 0.5) * k };
}
// 장면 섞기: 0 = 평면도, 1 = 아이소.
function swapAt(t) {
  if (t < T.planIn[1]) return 1 - smooth(T.planIn[0], T.planIn[1], t);
  return smooth(T.swap[0], T.swap[1], t);
}
// 아이소 카메라: 배율과 초점(아이소 화면 정규 좌표). 거실 실내기 근처에서 시작해 천천히 물러나 전체(1, 가운데).
function isoCam(t, focus) {
  if (t < T.planIn[1]) return { s: 1, fx: 0.5, fy: 0.5 };
  const into = [T.swap[0] - 0.2, ISO_Z[1], 2.6, 1];
  const s = track(t, ISO_Z[0], [into, [T.pullback, 1, 1.55, 1]]);
  const sp = track(T.pullback, ISO_Z[0], [into]); // 물러나기 시작할 때 배율
  const k = t < T.pullback ? 1 : clamp01((s - 1) / (sp - 1)); // 물러나기 전까지 거실 실내기가 가운데
  return { s, fx: 0.5 + (focus[0] - 0.5) * k, fy: 0.5 + (focus[1] - 0.5) * k };
}
// 아나토미 진행용 시각: 첫 0.7초(끝 장면이 사라지는 중)는 앞 바퀴의 끝 그대로.
const isoTime = (t) => (t < T.planIn[1] ? t + D : t);
function unitAt(t, i) {
  const ta = isoTime(t);
  const x = spring(ta - T.units[i], 9, 0.78);
  return { dz: 34 * (1 - x), op: clamp01((ta - T.units[i]) / 0.25) };
}
// 배관 조각 j/n 의 보이는 정도(선 그리기 흉내): 시작 + 길이 비례로 하나씩 0.18초에 걸쳐 나타남.
function revealAt(t, start, dur, j, n) {
  const ta = isoTime(t);
  return clamp01((ta - start - (dur * j) / Math.max(1, n)) / 0.18);
}
const flowOn = (t) => clamp01((isoTime(t) - T.flow) / 0.5);
// 팬 각도(도): 각속도가 0 → 최대로 지수 접근, 각도 = 그 적분(닫힌 형식).
function fanAngle(t) {
  const u = isoTime(t) - T.flow;
  if (u <= 0) return 0;
  const W = 420, k = 1.8;
  return W * (u - (1 - Math.exp(-k * u)) / k);
}
// 냉매 점 위치(0..1): 점마다 간격을 두고 일정 속도로 흐른다.
const flowPhase = (t, i, n, speed) => (((isoTime(t) - T.flow) * speed + i / n) % 1 + 1) % 1;
function captionAt(t) {
  let i = 0;
  for (let k = 0; k < T.caps.length; k++) if (t >= T.caps[k]) i = k;
  if (t < 0.35) i = T.caps.length - 1; // 처음 0.35초는 앞 바퀴 끝 문구(끝 장면과 같은 그림)
  const start = t < 0.35 ? -1 : (i === 0 ? 0.35 : T.caps[i]);
  const next = t < 0.35 ? 0.35 : (i + 1 < T.caps.length ? T.caps[i + 1] : D + 0.35);
  return { i, op: Math.min(clamp01((t - start) / 0.25), clamp01((next - t) / 0.18)) };
}
// 끝 장면 라벨(아이소 위): 차례로 떠오름. 처음 0.7초는 사라짐.
function endLabelAt(t, i) {
  if (t < T.planIn[1]) return { op: 1 - smooth(0.05, 0.45, t), dy: 0 };
  const u = clamp01((t - T.end - i * 0.12) / 0.3);
  return { op: u, dy: 8 * (1 - u) };
}

/* 히어로 모션 재생기(시안 v3). 위에 model.mjs 의 함수 본문이 붙는다(assemble.py 가 export 만 떼고 이어 붙임).
   seek(t) = t초 장면을 그리는 순수 함수(인라인 style/attribute 만 씀). 재생 판정은 site-src/motion.js 와 같다:
   보임 관찰자(기본 루트) + 띠 관찰자(root: document, 가운데 20%) — 띠에 닿고 0.4초 뒤 재생, 화면 밖·숨은 탭 = 멈추고 끝 장면.
   감속 모드·IntersectionObserver 없음·JS 없음 = 끝 장면(마크업 기본) 그대로. 버튼: 움직임 멈추기(= 끝 장면) / 다시 재생.
   단계 패널([data-v3-steps], 히어로 옆): 재생 중인 단계(captionAt 의 i = T.caps 6구간)를 강조하고, 단계를 누르면 그 시점으로 간다
   (재생 중이면 그 시각부터 이어서, 멈춤·감속 모드면 그 단계의 대표 장면에서 정지). JS 없음 = 단계 글 전체가 목록으로 읽힌다. */
(function () {
  var root = document.querySelector("[data-v3]");
  var dataEl = document.getElementById("v3-data");
  if (!root || !dataEl) return;
  var DATA = JSON.parse(dataEl.textContent);
  var W = DATA.W, H = DATA.H;
  var plan = root.querySelector(".v3-plan"), planCamEl = root.querySelector(".v3-plan-cam");
  var iso = root.querySelector(".v3-iso"), camEl = iso.querySelector(".v3-cam");
  var rotor = iso.querySelector(".v3-fan-rot");
  var stepsEl = document.querySelector("[data-v3-steps]");
  var order = DATA.units.concat(["outdoor"]); // 라벨 낙하·끝 장면 순서
  var units = DATA.units.map(function (id) { return iso.querySelectorAll('[data-g="u:' + id + '"]'); });
  var chunks = DATA.routes.map(function (r, i) {
    var list = [];
    for (var j = 0; j < r.n; j++) list.push(iso.querySelector('[data-g="r' + i + ":" + j + '"]'));
    return list;
  });
  // 냉매 점: 화면 폴리라인 누적 길이를 한 번 잰다(t 와 무관 — 결정적)
  var flows = DATA.routes.filter(function (r) { return r.kind === "gas" || r.kind === "liq"; }).map(function (r) {
    var acc = [0];
    for (var i = 1; i < r.pts.length; i++) acc.push(acc[i - 1] + Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]));
    var main = r.id.indexOf("main") >= 0;
    // 냉방: 액관은 실외기 → 실내기, 가스관은 실내기 → 실외기. 실내 배관은 실내기→헤더, 본관은 헤더→실외기 방향으로 그려져 있다.
    return { pts: r.pts, acc: acc, len: acc[acc.length - 1], dir: r.kind === "gas" ? 1 : -1, main: main };
  });
  var dots = iso.querySelectorAll(".v3-dots circle");
  var labels = order.map(function (id) {
    var el = root.querySelector('.v3-label[data-id="' + id + '"]');
    return { id: id, el: el, chip: el.querySelector(".v3-chip"), shadow: el.querySelector(".v3-shadow") };
  });
  var pb = DATA.planBox;
  var planPt = function (id) { var a = DATA.plan[id]; return [pb.left + a[0] * pb.w, pb.top + a[1] * pb.h]; };
  var planFocus = planPt("living");
  var f3 = function (n) { return Math.round(n * 1000) / 1000; };

  function pointAt(f, s) {
    var d = s * f.len, i = 1;
    while (i < f.acc.length - 1 && f.acc[i] < d) i++;
    var a = f.pts[i - 1], b = f.pts[i], seg = f.acc[i] - f.acc[i - 1] || 1, u = (d - f.acc[i - 1]) / seg;
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  }

  function seek(t) {
    t = ((t % D) + D) % D;
    var w = swapAt(t);
    var pc = planCam(t, planFocus);
    plan.style.opacity = f3(1 - w);
    planCamEl.style.transform = "translate(" + f3((0.5 - pc.fx * pc.s) * 100) + "%," + f3((0.5 - pc.fy * pc.s) * 100) + "%) scale(" + f3(pc.s) + ")";
    iso.style.opacity = f3(w);
    var ic = isoCam(t, DATA.focus);
    camEl.setAttribute("transform", "translate(" + f3((0.5 - ic.fx * ic.s) * W) + " " + f3((0.5 - ic.fy * ic.s) * H) + ") scale(" + f3(ic.s) + ")");
    // 실내기 매달림
    units.forEach(function (els, i) {
      var u = unitAt(t, i), tr = "translate(0 " + f3(u.dz * DATA.rise) + ")", op = String(f3(u.op));
      for (var k = 0; k < els.length; k++) { els[k].setAttribute("transform", tr); els[k].style.opacity = op; }
    });
    // 배관 선 그리기(조각이 차례로 나타남)
    DATA.routes.forEach(function (r, i) {
      var list = chunks[i];
      for (var j = 0; j < list.length; j++) if (list[j]) list[j].style.opacity = String(f3(revealAt(t, r.timing[0], r.timing[1], j, r.n)));
    });
    // 냉매 흐름 + 팬
    var on = flowOn(t), n = DATA.dotsPer;
    flows.forEach(function (f, ri) {
      for (var i = 0; i < n; i++) {
        var c = dots[ri * n + i];
        var s = flowPhase(t, i, n, 34 / f.len * (f.main ? 1.4 : 1));
        var s2 = f.dir > 0 ? s : 1 - s;
        var p = pointAt(f, 0.04 + 0.92 * s2);
        c.setAttribute("cx", f3(p[0])); c.setAttribute("cy", f3(p[1]));
        c.style.opacity = String(f3(on * Math.min(1, s * 8, (1 - s) * 8)));
      }
    });
    if (rotor) rotor.setAttribute("transform", "rotate(" + f3(fanAngle(t) % 360) + ")");
    // 라벨
    var zk = clamp01((pc.s - 1) / (ZOOM - 1));
    labels.forEach(function (L, k) {
      var pp = planPt(L.id), ip = DATA.iso[L.id];
      var P1 = [(pp[0] - pc.fx) * pc.s + 0.5, (pp[1] - pc.fy) * pc.s + 0.5];
      var P2 = [(ip[0] - ic.fx) * ic.s + 0.5, (ip[1] - ic.fy) * ic.s + 0.5];
      var pos = P2, op = 0, dy = 0, sx = 1, sy = 1, sh = 0, scale = 1;
      if (t < T.planIn[1]) { var e0 = endLabelAt(t, k); op = e0.op; }
      else if (t < T.swap[0]) {
        var d = dropAt(t, T.drops[k]);
        pos = P1; op = d.op; dy = d.dy; sh = d.shadow * (1 - zk); sx = 1 + 0.05 * d.squash; sy = 1 - 0.08 * d.squash;
        if (L.id === "living") scale = 1 + 0.15 * zk; else op *= 1 - 0.55 * zk; // 확대 중 나머지 라벨은 0.45까지 흐려짐
      } else if (L.id === "living") {
        var mix = t < T.swap[1] ? w : 1;
        pos = [P1[0] + (P2[0] - P1[0]) * mix, P1[1] + (P2[1] - P1[1]) * mix];
        op = 1; sh = (1 - mix) * 0;
        scale = 1 + 0.15 * ((1 - mix) * zk + mix * clamp01((ic.s - 1) / (ISO_Z[1] - 1)));
      } else if (t < T.swap[1]) {
        pos = P1; op = (1 - 0.55 * zk) * (1 - w);
      } else if (t >= T.end) { var e1 = endLabelAt(t, k); op = e1.op; dy = e1.dy; }
      L.el.style.left = f3(pos[0] * 100) + "%";
      L.el.style.top = f3(pos[1] * 100) + "%";
      L.el.style.opacity = String(f3(op));
      L.chip.style.translate = "-50% " + f3(dy) + "px";
      L.chip.style.scale = f3(sx * scale) + " " + f3(sy * scale);
      L.shadow.style.opacity = String(f3(sh));
    });
    setStep(captionAt(t).i);
  }

  // ── 단계 패널: 제목을 버튼으로 바꾸고(JS 있을 때만), 모바일용 단계 점을 만든다 ──
  var START = T.caps.map(function (c, i) { return i === 0 ? 0.4 : c; }); // 재생 중 단계 클릭 = 그 구간 시작부터
  var STILL = T.caps.map(function (c, i) { return (i + 1 < T.caps.length ? T.caps[i + 1] : D) - 0.15; }); // 멈춘 상태 = 구간 끝(완성된 장면)
  var stepEls = [], stepBtns = [], dotBtns = [], cur = -1, jumpTo = null;
  function setStep(i) {
    if (i === cur || !stepEls.length) return;
    cur = i;
    stepEls.forEach(function (li, k) { li.classList.toggle("is-now", k === i); });
    stepBtns.forEach(function (b, k) { if (k === i) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current"); });
    dotBtns.forEach(function (b, k) { if (k === i) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current"); });
  }
  if (stepsEl) {
    stepEls = [].slice.call(stepsEl.querySelectorAll(".hb-step"));
    var dotRow = document.createElement("div"); // (이름 주의: dots = 냉매 점 목록)
    dotRow.className = "hb-dots";
    stepEls.forEach(function (li, k) {
      var h = li.querySelector(".hb-h"), b = document.createElement("button");
      b.type = "button"; b.className = "hb-btn";
      while (h.firstChild) b.appendChild(h.firstChild);
      h.appendChild(b);
      stepBtns.push(b);
      var d = document.createElement("button");
      d.type = "button"; d.className = "hb-dot";
      d.setAttribute("aria-label", (k + 1) + "단계: " + li.querySelector(".hb-t").textContent);
      dotRow.appendChild(d); dotBtns.push(d);
      var go = function () { if (jumpTo) jumpTo(k); else { seek(STILL[k]); } };
      b.addEventListener("click", go); d.addEventListener("click", go);
    });
    stepsEl.appendChild(dotRow);
    stepsEl.classList.add("hb-js");
    setStep(T.caps.length - 1); // 마크업 기본 그림 = 끝 장면 = 마지막 단계
  }
  window.__v3 = { seek: seek, D: D, step: function () { return cur; } };

  var still = matchMedia("(prefers-reduced-motion: reduce)");
  if (/[?&]v3render\b/.test(location.search) || !window.IntersectionObserver || still.matches) return;
  var ctl = root.querySelector(".v3-ctl"), b = ctl && ctl.querySelector(".v3-btn");
  if (!b) return;
  var seen = false, band = false, playing = false, stopped = false, t0 = 0, raf = 0, wait = 0, from = 0;
  function frame(now) { if (!playing) return; seek((now - t0) / 1000); raf = requestAnimationFrame(frame); }
  function start() { wait = 0; playing = true; t0 = performance.now() - from * 1000; from = 0; raf = requestAnimationFrame(frame); }
  function halt() { clearTimeout(wait); wait = 0; playing = false; cancelAnimationFrame(raf); from = 0; seek(0); }
  jumpTo = function (k) {
    if (playing) { t0 = performance.now() - START[k] * 1000; seek(START[k]); }
    else if (stopped) seek(STILL[k]); // 멈춤 = 그 단계의 완성 장면에서 정지
    else { from = START[k]; seek(STILL[k]); } // 아직 재생 전 = 그 장면을 보여 두고, 재생이 시작되면 그 단계부터
  };
  function sync() {
    if (stopped) return;
    if (!seen || document.hidden) { if (playing || wait) halt(); }
    else if (!playing) { if (!band) { clearTimeout(wait); wait = 0; } else if (!wait) wait = setTimeout(start, 400); }
  }
  function watch(o, set) {
    var cb = function (e) { set(e[e.length - 1].isIntersecting); sync(); };
    try { new IntersectionObserver(cb, o).observe(root); }
    catch (_) { delete o.root; new IntersectionObserver(cb, o).observe(root); }
  }
  watch({ threshold: 0 }, function (v) { seen = v; });
  watch({ root: document, rootMargin: "-40% 0px -40% 0px", threshold: 0 }, function (v) { band = v; });
  document.addEventListener("visibilitychange", sync);
  b.addEventListener("click", function () {
    stopped = !stopped;
    b.textContent = stopped ? "다시 재생" : "움직임 멈추기";
    if (stopped) halt();
    else if (seen && !document.hidden) start();
  });
  seek(0);
  ctl.hidden = false;
})();

})();
/* 시안 v3b 페이지 동작(page.js): 스크롤 등장 · 금액 세기 · 가격 카드 팝업 · 후기 종류별 전환. v3.js 끝에 이어 붙는다.
   JS 없음 = 모든 내용이 처음부터 보이는 정적 페이지(가격 상세는 카드 안에 펼쳐짐, 후기는 종류별 묶음 목록).
   감속 모드·IntersectionObserver 없음 = 스크롤 등장·금액 세기·후기 자동 전환 없음(팝업은 그대로 쓴다). */
(function () {
  var reduce = !window.matchMedia || matchMedia("(prefers-reduced-motion: reduce)").matches;
  // 보임 판정은 site-src/motion.js 와 같은 방식: isIntersecting 만 보고, 문서 루트(iframe 안에서도 띠가 맞음) → 안 되면 기본 루트
  function observer(opts, cb) {
    try { return new IntersectionObserver(cb, opts); }
    catch (_) { delete opts.root; return new IntersectionObserver(cb, opts); }
  }

  // ── 금액 세기: "495만원"·"약 420만원"·"120,000원" 꼴만 짧게(0.6초) 올라가며 세고, 끝에는 원래 글자로 되돌린다 ──
  var NUM = /^(약 )?([\d,]+)(만원|원)$/;
  function countUp(root) {
    if (reduce) return;
    root.querySelectorAll(".pc-amt .amt").forEach(function (a) {
      var w = document.createTreeWalker(a, NodeFilter.SHOW_TEXT), node, m;
      while ((node = w.nextNode())) if ((m = NUM.exec(node.data.trim()))) break;
      if (!node || !m) return;
      var orig = node.data, to = parseInt(m[2].replace(/,/g, ""), 10), from = Math.round(to * 0.6), comma = m[2].indexOf(",") >= 0;
      var step = to >= 10000 ? 1000 : 1, t0 = performance.now();
      var fmt = function (v) { var s = String(v); return comma ? s.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : s; };
      (function tick(now) {
        var u = Math.min(1, (now - t0) / 600), e = 1 - Math.pow(1 - u, 3);
        if (u >= 1) { node.data = orig; return; }
        node.data = (m[1] || "") + fmt(Math.round((from + (to - from) * e) / step) * step) + m[3];
        requestAnimationFrame(tick);
      })(t0);
    });
  }

  // ── 스크롤 등장: html.rv-on(<head> 에서 붙임)일 때만. 같이 들어온 요소는 문서 순서대로 0.08초 간격(최대 0.32초) ──
  if (document.documentElement.classList.contains("rv-on") && window.IntersectionObserver) {
    var io = observer({ root: document, rootMargin: "0px 0px -8% 0px", threshold: 0 }, function (es) {
      var ins = es.filter(function (e) { return e.isIntersecting; }).map(function (e) { return e.target; });
      ins.sort(function (a, b) { return a.compareDocumentPosition(b) & 4 ? -1 : 1; });
      ins.forEach(function (el, i) {
        io.unobserve(el);
        var d = Math.min(i, 4) * 0.08;
        el.style.setProperty("--rv-d", d + "s");
        el.classList.add("is-in");
        setTimeout(function () { countUp(el); }, d * 1000);
        setTimeout(function () { el.style.removeProperty("--rv-d"); }, d * 1000 + 900); // 지연은 등장에만(마우스 반응에는 남기지 않음)
      });
    });
    document.querySelectorAll("[data-rv]").forEach(function (el) { io.observe(el); });
  }

  // ── 가격 카드 → 팝업: 카드 제목을 버튼으로 바꾸고(카드 전체가 누르는 자리), 상세를 대화상자에 복사해 띄운다 ──
  var dlg = document.getElementById("pc-dlg");
  if (dlg && typeof dlg.showModal === "function") {
    var dh = dlg.querySelector(".pc-dlg-h"), db = dlg.querySelector(".pc-dlg-body"), opener = null;
    document.querySelectorAll(".pc").forEach(function (li) {
      var t = li.querySelector(".pc-t"), det = li.querySelector(".pc-detail"), amt = li.querySelector(".pc-amt");
      if (!t || !det) return;
      var b = document.createElement("button");
      b.type = "button"; b.className = "pc-btn";
      b.setAttribute("aria-haspopup", "dialog");
      if (amt && amt.id) b.setAttribute("aria-describedby", amt.id);
      while (t.firstChild) b.appendChild(t.firstChild);
      t.appendChild(b);
      li.classList.add("is-js");
      b.addEventListener("click", function () {
        opener = b;
        dh.textContent = li.getAttribute("data-pc-title");
        db.textContent = "";
        db.appendChild(det.cloneNode(true));
        dlg.showModal();
      });
    });
    dlg.addEventListener("click", function (e) {
      if (e.target === dlg || (e.target.closest && e.target.closest("[data-close]"))) dlg.close(); // 바깥(배경) 클릭 = 대화상자 자체
    });
    dlg.addEventListener("close", function () { if (opener) { opener.focus(); opener = null; } });
    dlg.addEventListener("keydown", function (e) { // 포커스 가두기: Tab 이 대화상자 안에서만 돈다
      if (e.key !== "Tab") return;
      var f = dlg.querySelectorAll("a[href], button:not([disabled])"), first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  // ── 후기: 종류 칩(탭) + 그 종류 카드. 칩 아래 막대(5초)가 다 차면 다음 종류. 마우스·포커스·터치 중·화면 밖·숨은 탭 = 멈춤 ──
  var rv = document.querySelector("[data-rv-root]");
  if (!rv || reduce || !window.IntersectionObserver) return;
  var bar = rv.querySelector(".rv-bar"), pauseBtn = rv.querySelector(".rv-pause"), box = rv.querySelector(".rv-panels");
  var tabs = [].slice.call(rv.querySelectorAll(".rv-tab"));
  var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute("aria-controls")); });
  if (!tabs.length || !bar) return;
  var cur = 0, stopped = false, seen = false, hover = false, focus = false, touch = false;
  panels.forEach(function (p, k) { p.setAttribute("role", "tabpanel"); p.setAttribute("aria-labelledby", tabs[k].id); });
  function sync() { rv.classList.toggle("is-paused", hover || focus || touch || !seen || document.hidden); }
  function restart() { rv.classList.remove("is-auto"); void rv.offsetWidth; if (!stopped) rv.classList.add("is-auto"); }
  function show(k) {
    cur = (k + tabs.length) % tabs.length;
    tabs.forEach(function (t, i) { t.setAttribute("aria-selected", String(i === cur)); t.tabIndex = i === cur ? 0 : -1; });
    panels.forEach(function (p, i) { p.classList.toggle("is-on", i === cur); });
    var t = tabs[cur], row = t.parentNode; // 칩 줄이 넘치면 지금 칩이 보이게(가로만, 페이지는 움직이지 않음)
    if (row.scrollWidth > row.clientWidth) row.scrollLeft = Math.max(0, t.offsetLeft - row.offsetLeft - 16);
    restart();
  }
  rv.addEventListener("animationend", function (e) { if (e.animationName === "rv-fill" && !stopped) show(cur + 1); });
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { show(i); });
    t.addEventListener("keydown", function (e) {
      var k = { ArrowRight: cur + 1, ArrowLeft: cur - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (k === undefined) return;
      e.preventDefault(); show(k); tabs[cur].focus();
    });
  });
  pauseBtn.addEventListener("click", function () {
    stopped = !stopped;
    pauseBtn.textContent = stopped ? "다시 재생" : "움직임 멈추기";
    box.setAttribute("aria-live", stopped ? "polite" : "off");
    restart();
  });
  rv.addEventListener("mouseenter", function () { hover = true; sync(); });
  rv.addEventListener("mouseleave", function () { hover = false; sync(); });
  rv.addEventListener("focusin", function () { focus = true; sync(); });
  rv.addEventListener("focusout", function (e) { focus = rv.contains(e.relatedTarget); sync(); });
  rv.addEventListener("touchstart", function () { touch = true; sync(); }, { passive: true });
  rv.addEventListener("touchend", function () { touch = false; sync(); }, { passive: true });
  rv.addEventListener("touchcancel", function () { touch = false; sync(); }, { passive: true });
  observer({ threshold: 0 }, function (es) { seen = es[es.length - 1].isIntersecting; sync(); }).observe(rv);
  document.addEventListener("visibilitychange", sync);
  rv.classList.add("is-js");
  box.setAttribute("aria-live", "off");
  bar.hidden = false;
  show(0);
  sync();
  // 6줄로 접힌 긴 후기에만 "더 보기"(내용은 그대로, 누르면 전체)
  requestAnimationFrame(function () {
    rv.querySelectorAll(".review-text").forEach(function (p) {
      if (p.scrollHeight <= p.clientHeight + 2) return;
      var b = document.createElement("button");
      b.type = "button"; b.className = "rv-more"; b.textContent = "더 보기"; b.setAttribute("aria-expanded", "false");
      b.addEventListener("click", function () {
        var open = p.parentNode.classList.toggle("is-open");
        b.textContent = open ? "접기" : "더 보기"; b.setAttribute("aria-expanded", String(open));
      });
      p.after(b);
    });
  });
  window.__rv = { next: function () { show(cur + 1); }, cur: function () { return cur; } };
})();
