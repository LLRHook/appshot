// HTML for the Sample Garden screens, laid out in iPhone points (440 x 956) and rendered at @3x.
// Every plant, note and number here is made up, and each screen says so with a small marker.
import { cuttingsScene, figPlant, figRoom, newLeafCloseUp, plantTile, sampleMark } from './art.mjs';

const ICONS = {
	today:
		'<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
	plants:
		'<path d="M6.5 13.5h11l-1.2 6.2a1.6 1.6 0 0 1-1.6 1.3H9.3a1.6 1.6 0 0 1-1.6-1.3z"/><path d="M12 13.5V8"/><path d="M12 9c0-3 2-5 6-5 0 4-2 6-6 6M12 10.5C12 8.2 10.4 6.5 7 6.5c0 3.2 1.8 5 5 5"/>',
	schedule:
		'<path d="M7.5 3v3M16.5 3v3M4 9.5h16"/><rect x="4" y="5" width="16" height="16" rx="3"/>',
	journal:
		'<path d="M6 3.5h12a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5z"/><path d="M9 8.5h6.5M9 12.5h6.5M9 16.5h3.5"/>',
	insights: '<path d="M5 20v-8M12 20V5M19 20v-5"/>',
	drop: '<path d="M12 3.5c3.5 4.4 5.8 7.3 5.8 10.6a5.8 5.8 0 1 1-11.6 0c0-3.3 2.3-6.2 5.8-10.6z"/>',
	mist: '<path d="M8 5.5v.01M12 3.5v.01M16 5.5v.01M6 10v.01M10 8.5v.01M14 8.5v.01M18 10v.01"/><path d="M9 13h6l.8 8h-7.6z"/>',
	feed: '<path d="M12 3.5l1.9 5 5 1.9-5 1.9-1.9 5-1.9-5-5-1.9 5-1.9z"/><path d="M18.5 16v4M16.5 18h4"/>',
	rotate:
		'<path d="M4.5 11a7.8 7.8 0 0 1 13.4-4.4L20 8.8M20 4v4.8h-4.8M19.5 13a7.8 7.8 0 0 1-13.4 4.4L4 15.2M4 20v-4.8h4.8"/>',
	sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
	back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
	next: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
	more: '<path d="M5.5 12h.01M12 12h.01M18.5 12h.01"/>',
	check: '<path d="M5.5 12.5l4.2 4.2L18.5 7.5"/>',
	plus: '<path d="M12 5.5v13M5.5 12h13"/>'
};

const icon = (name, size = 20, width = 1.9) =>
	`<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

const statusBar = (tone = 'dark') => `
	<div class="status ${tone}">
		<span class="clock">9:41</span>
		<span class="system">
			<svg width="19" height="13" viewBox="0 0 19 13" fill="currentColor"><rect x="0" y="8.5" width="3.2" height="4.5" rx="1"/><rect x="5.2" y="5.8" width="3.2" height="7.2" rx="1"/><rect x="10.4" y="3" width="3.2" height="10" rx="1"/><rect x="15.6" y="0" width="3.2" height="13" rx="1"/></svg>
			<svg width="18" height="13" viewBox="0 0 18 13" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M1.2 4.4a11.6 11.6 0 0 1 15.6 0" stroke-width="2"/><path d="M4 7.6a7.4 7.4 0 0 1 10 0" stroke-width="2"/><circle cx="9" cy="11" r="1.5" fill="currentColor" stroke="none"/></svg>
			<svg width="29" height="14" viewBox="0 0 29 14" fill="none"><rect x=".6" y=".6" width="24.8" height="12.8" rx="4" stroke="currentColor" stroke-opacity=".45" stroke-width="1.1"/><rect x="2.2" y="2.2" width="21.6" height="9.6" rx="2.6" fill="currentColor"/><path d="M27 5v4c.9-.3 1.5-1.1 1.5-2S27.900 5.300 27 5z" fill="currentColor" fill-opacity=".5"/></svg>
		</span>
	</div>`;

const TABS = [
	['today', 'Today'],
	['plants', 'Plants'],
	['schedule', 'Schedule'],
	['journal', 'Journal'],
	['insights', 'Insights']
];

const tabBar = (active) => `
	<nav class="tabs">
		${TABS.map(
			([id, label]) =>
				`<span class="tab${id === active ? ' on' : ''}">${icon(id, 23, id === active ? 2.2 : 1.8)}<b>${label}</b></span>`
		).join('')}
	</nav>`;

const homeIndicator = `<div class="home"></div>`;
const sampleTag = `<span class="sample-tag">Sample data</span>`;

const shell = (body, { background = 'var(--bg)' } = {}) =>
	`<main class="screen" style="background:${background}">${body}${homeIndicator}</main>`;

const CATEGORIES = {
	water: ['drop', 'var(--water)', 'var(--water-tint)'],
	mist: ['mist', 'var(--mist)', 'var(--mist-tint)'],
	feed: ['feed', 'var(--feed)', 'var(--feed-tint)'],
	turn: ['rotate', 'var(--sun)', 'var(--sun-tint)'],
	wipe: ['sun', 'var(--sun)', 'var(--sun-tint)']
};

const chip = (category, label) => {
	const [name, ink, tint] = CATEGORIES[category];
	return `<span class="chip" style="color:${ink};background:${tint}">${icon(name, 14, 2.2)}${label}</span>`;
};

function taskRow({ plant, tile, name, category, task, done }) {
	return `
		<li class="task${done ? ' done' : ''}">
			${plantTile(plant, { size: 50, background: tile })}
			<div class="task-text"><strong>${name}</strong>${chip(category, task)}</div>
			<span class="tick">${done ? icon('check', 17, 2.8) : ''}</span>
		</li>`;
}

function today() {
	const left = [
		{ plant: 'pothos', tile: '#E4EEFF', name: 'Tendril', category: 'water', task: 'Water, 180 ml' },
		{ plant: 'fern', tile: '#EEEAFE', name: 'Frond', category: 'mist', task: 'Mist twice' }
	];
	const done = [
		{ plant: 'fig', tile: '#E4F4E9', name: 'Big Fig', category: 'turn', task: 'Quarter turn' },
		{
			plant: 'cactus',
			tile: '#FDE9E2',
			name: 'Prickle',
			category: 'water',
			task: 'Soil still dry'
		},
		{ plant: 'snake', tile: '#E8EBF0', name: 'Spear', category: 'wipe', task: 'Wiped leaves' }
	];
	const tomorrow = [
		{ plant: 'fern', tile: '#EEEAFE', name: 'Frond', category: 'water', task: 'Water, 120 ml' },
		{ plant: 'fig', tile: '#E4F4E9', name: 'Big Fig', category: 'feed', task: 'Feed, half dose' }
	];
	return shell(`
		${statusBar()}
		<header class="top">
			<span class="brand"><span class="brand-mark">${sampleMark(30)}</span>Sample Garden</span>
			${sampleTag}
		</header>
		<div class="title-row">
			<h1>Today</h1>
			<span class="date">Tue 14 May</span>
		</div>
		<section class="summary">
			<div class="summary-text">
				<p class="eyebrow">This morning</p>
				<p class="big"><em>3</em> of 5 done</p>
				<div class="meter"><i class="on"></i><i class="on"></i><i class="on"></i><i></i><i></i></div>
				<p class="hint">Two plants are still waiting</p>
			</div>
			<svg class="summary-art" width="190" height="210" viewBox="0 0 190 210">${figPlant({ x: 96, y: 212, size: 196, pot: 'lilac' })}</svg>
		</section>
		<h2>Still to do</h2>
		<ul class="group">${left.map((item) => taskRow(item)).join('')}</ul>
		<h2>Done</h2>
		<ul class="group">${done.map((item) => taskRow({ ...item, done: true })).join('')}</ul>
		<h2>Tomorrow</h2>
		<ul class="group">${tomorrow.map((item) => taskRow(item)).join('')}</ul>
		${tabBar('today')}
	`);
}

function plant() {
	const care = [
		['water', 'Water', 'Every 7 days', 'Next on Thu'],
		['mist', 'Mist', 'Twice a week', 'Next on Fri'],
		['feed', 'Feed', 'Once a month', 'Next on 2 Jun']
	];
	return shell(
		`
		<div class="hero">${figRoom({ width: 440, height: 454 })}</div>
		${statusBar()}
		<div class="hero-bar">
			<span class="glass">${icon('back', 22, 2.2)}</span>
			<span class="hero-actions">${sampleTag}<span class="glass">${icon('more', 22, 3)}</span></span>
		</div>
		<section class="sheet">
			<div class="sheet-title">
				<div>
					<h1 class="plant-name">Big Fig</h1>
					<p class="species"><em>Ficus lyrata</em> &nbsp;·&nbsp; Living room window</p>
				</div>
				<span class="health">Thriving</span>
			</div>
			<div class="stats">
				<div class="stat"><span style="color:var(--water)">${icon('drop', 19, 2.2)}</span><b>2 days</b><small>Until water</small></div>
				<div class="stat"><span style="color:var(--sun)">${icon('sun', 19, 2.2)}</span><b>Bright</b><small>Indirect light</small></div>
				<div class="stat"><span style="color:var(--mist)">${icon('mist', 19, 2.2)}</span><b>54%</b><small>Humidity</small></div>
			</div>
			<h2 class="flush">Care plan</h2>
			<ul class="group flat">
				${care
					.map(([category, name, cadence, next]) => {
						const [symbol, ink, tint] = CATEGORIES[category];
						return `<li class="care"><span class="care-icon" style="color:${ink};background:${tint}">${icon(symbol, 19, 2.2)}</span><span class="care-text"><strong>${name}</strong><small>${cadence}</small></span><span class="care-next">${next}</span>${icon('next', 15, 2.4)}</li>`;
					})
					.join('')}
			</ul>
			<button class="primary">${icon('drop', 20, 2.3)}Mark as watered</button>
		</section>
	`
	);
}

function schedule() {
	const dots = {
		2: ['water'],
		3: ['mist'],
		7: ['water', 'feed'],
		9: ['mist'],
		10: ['water'],
		14: ['water', 'mist'],
		16: ['water'],
		17: ['mist'],
		21: ['water'],
		23: ['water', 'mist'],
		24: ['feed'],
		28: ['water'],
		30: ['mist']
	};
	const ink = { water: 'var(--water)', mist: 'var(--mist)', feed: 'var(--feed)' };
	const cells = [
		...Array.from({ length: 2 }, () => '<span class="day blank"></span>'),
		...Array.from({ length: 31 }, (_, index) => {
			const day = index + 1;
			const marks = (dots[day] ?? [])
				.map((kind) => `<i style="background:${day === 14 ? '#fff' : ink[kind]}"></i>`)
				.join('');
			return `<span class="day${day === 14 ? ' picked' : ''}${day < 14 ? ' past' : ''}"><b>${day}</b><span class="dots">${marks}</span></span>`;
		})
	].join('');
	const agenda = [
		['pothos', '#E4EEFF', '8:00', 'Water Tendril', '180 ml, top of the soil', 'water'],
		['fern', '#EEEAFE', '8:15', 'Mist Frond', 'Both sides of the fronds', 'mist'],
		['fig', '#E4F4E9', '17:30', 'Check Big Fig', 'Look for new growth', 'turn'],
		['cactus', '#FDE9E2', '18:00', 'Turn Prickle', 'A quarter turn to the window', 'turn'],
		['snake', '#E8EBF0', '18:10', 'Wipe Spear', 'A damp cloth, top to tip', 'wipe']
	];
	return shell(`
		${statusBar()}
		<header class="top plain">
			<h1>Schedule</h1>
			${sampleTag}
		</header>
		<section class="calendar">
			<div class="month"><strong>May</strong><span class="arrows">${icon('back', 18, 2.3)}${icon('next', 18, 2.3)}</span></div>
			<div class="weekdays"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>
			<div class="days">${cells}</div>
		</section>
		<h2>Tuesday 14 May</h2>
		<ul class="group">
			${agenda
				.map(
					([kind, tile, time, title, detail, category]) =>
						`<li class="agenda"><span class="time">${time}</span>${plantTile(kind, { size: 44, background: tile, radius: 12 })}<span class="agenda-text"><strong>${title}</strong><small>${detail}</small></span><span class="bar" style="background:${CATEGORIES[category][1]}"></span></li>`
				)
				.join('')}
		</ul>
		${tabBar('schedule')}
	`);
}

function journal() {
	return shell(`
		${statusBar()}
		<header class="top plain">
			<h1>Journal</h1>
			${sampleTag}
		</header>
		<div class="filters"><span class="on">All notes</span><span>New leaves</span><span>Cuttings</span><span>Blooms</span></div>
		<article class="note">
			<div class="note-photo">${newLeafCloseUp({ width: 400, height: 186 })}</div>
			<div class="note-body">
				<div class="note-meta">${plantTile('fig', { size: 30, background: '#E4F4E9', radius: 9 })}<strong>Big Fig</strong><time>14 May</time></div>
				<p>A new leaf at the very top, still rolled tight. Two weeks since the last one.</p>
				<div class="note-tags"><span>New leaf</span><span>+4 cm</span></div>
			</div>
		</article>
		<article class="note">
			<div class="note-photo short">${cuttingsScene({ width: 400, height: 136 })}</div>
			<div class="note-body">
				<div class="note-meta">${plantTile('pothos', { size: 30, background: '#E4EEFF', radius: 9 })}<strong>Tendril</strong><time>11 May</time></div>
				<p>Trimmed the two longest vines and started three cuttings in a glass.</p>
				<div class="note-tags"><span>Cuttings</span></div>
			</div>
		</article>
		<article class="note">
			<div class="note-body">
				<div class="note-meta">${plantTile('cactus', { size: 30, background: '#FDE9E2', radius: 9 })}<strong>Prickle</strong><time>6 May</time></div>
				<p>First flower bud of the year.</p>
			</div>
		</article>
		<span class="fab">${icon('plus', 28, 2.5)}</span>
		${tabBar('journal')}
	`);
}

/** A Catmull-Rom curve through points, as an SVG path, for the moisture chart. */
function smoothPath(points) {
	const at = (index) => points[Math.max(0, Math.min(points.length - 1, index))];
	return points
		.map(([x, y], index) => {
			if (!index) return `M${x} ${y}`;
			const [p0, p1, p3] = [at(index - 2), at(index - 1), at(index + 1)];
			const c1 = [p1[0] + (x - p0[0]) / 6, p1[1] + (y - p0[1]) / 6];
			const c2 = [x - (p3[0] - p1[0]) / 6, y - (p3[1] - p1[1]) / 6];
			return `C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${x} ${y}`;
		})
		.join('');
}

function insights() {
	const moisture = [58, 50, 43, 36, 78, 70, 62, 54, 46, 38, 80, 71, 63, 55];
	const width = 368;
	const height = 112;
	const points = moisture.map((value, index) => [
		Math.round((index * width) / (moisture.length - 1)),
		Math.round(height - (value / 100) * height)
	]);
	const line = smoothPath(points);
	const light = [5, 6.5, 4, 7, 6, 3.5, 6.5];
	const thirsty = [
		['pothos', '#E4EEFF', 'Tendril', 3, '3 waterings'],
		['fern', '#EEEAFE', 'Frond', 2, '2 waterings'],
		['fig', '#E4F4E9', 'Big Fig', 1, '1 watering'],
		['snake', '#E8EBF0', 'Spear', 1, '1 watering'],
		['cactus', '#FDE9E2', 'Prickle', 0, 'Not this week']
	];
	return shell(`
		${statusBar()}
		<header class="top plain">
			<h1>Insights</h1>
			${sampleTag}
		</header>
		<section class="card score">
			<svg width="92" height="92" viewBox="0 0 92 92">
				<circle cx="46" cy="46" r="38" fill="none" stroke="#E4F4E9" stroke-width="11"/>
				<circle cx="46" cy="46" r="38" fill="none" stroke="var(--leaf)" stroke-width="11" stroke-linecap="round" stroke-dasharray="205 239" transform="rotate(-90 46 46)"/>
				<text x="46" y="55" text-anchor="middle" class="ring-number">86</text>
			</svg>
			<div>
				<p class="eyebrow dark">Garden score</p>
				<p class="big dark">5 of 6 plants thriving</p>
				<p class="hint dark">An invented score for an invented garden</p>
			</div>
		</section>
		<section class="card">
			<div class="card-head"><strong>Soil moisture</strong><small>Last 14 days</small></div>
			<svg class="chart" width="${width}" height="${height + 22}" viewBox="0 0 ${width} ${height + 22}">
				<defs><linearGradient id="moisture" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#2F7BF6" stop-opacity=".28"/><stop offset="1" stop-color="#2F7BF6" stop-opacity="0"/></linearGradient></defs>
				<path d="M0 28H${width}M0 56H${width}M0 84H${width}" stroke="#131A22" stroke-opacity=".07"/>
				<path d="${line}L${width} ${height}L0 ${height}Z" fill="url(#moisture)"/>
				<path d="${line}" fill="none" stroke="var(--water)" stroke-width="3" stroke-linecap="round"/>
				<circle cx="${points[4][0]}" cy="${points[4][1]}" r="5" fill="#fff" stroke="var(--water)" stroke-width="3"/>
				<circle cx="${points[10][0]}" cy="${points[10][1]}" r="5" fill="#fff" stroke="var(--water)" stroke-width="3"/>
				<text x="0" y="${height + 18}" class="axis">1 May</text>
				<text x="${width / 2}" y="${height + 18}" class="axis" text-anchor="middle">7 May</text>
				<text x="${width}" y="${height + 18}" class="axis" text-anchor="end">14 May</text>
			</svg>
		</section>
		<div class="pair">
			<section class="card small">
				<small>Care streak</small>
				<p class="stat-number">12<span>days</span></p>
				<div class="streak">${Array.from({ length: 14 }, (_, index) => `<i class="${index < 12 ? 'on' : ''}"></i>`).join('')}</div>
			</section>
			<section class="card small">
				<small>Window light</small>
				<p class="stat-number">6.5<span>hours</span></p>
				<div class="bars">${light.map((value, index) => `<i class="${index === 6 ? 'on' : ''}" style="height:${Math.round(value * 5.6)}px"></i>`).join('')}</div>
			</section>
		</div>
		<section class="card rows">
			<div class="card-head"><strong>Thirstiest this week</strong></div>
			${thirsty
				.map(
					([kind, tile, name, count, label]) =>
						`<div class="rank">${plantTile(kind, { size: 34, background: tile, radius: 10 })}<strong>${name}</strong><span class="rank-bar"><i style="width:${count * 33}%"></i></span><small>${label}</small></div>`
				)
				.join('')}
		</section>
		${tabBar('insights')}
	`);
}

export const SCREENS = { today, plant, schedule, journal, insights };

/** The shared stylesheet; `fonts` is the bundled faces as @font-face rules. */
export const stylesheet = (fonts) => `
${fonts}
:root {
	--bg: #f2f3f7;
	--card: #fff;
	--ink: #131a22;
	--ink-2: #5b6673;
	--ink-3: #98a2ae;
	--line: rgba(19, 26, 34, 0.08);
	--leaf: #1f9d57;
	--leaf-deep: #125c35;
	--leaf-tint: #e2f5e9;
	--water: #2f7bf6;
	--water-tint: #e5efff;
	--mist: #7a5af8;
	--mist-tint: #eeeafe;
	--feed: #d6409f;
	--feed-tint: #fbe8f4;
	--sun: #ee5a36;
	--sun-tint: #feebe6;
	--serif: 'Instrument Serif', serif;
	--sans: 'DM Sans', sans-serif;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 440px; height: 956px; overflow: hidden; background: var(--bg); }
body { font-family: var(--sans); color: var(--ink); -webkit-font-smoothing: antialiased; font-optical-sizing: auto; font-feature-settings: 'tnum' 1; }
ul { list-style: none; }
svg { display: block; }
.screen { position: relative; width: 440px; height: 956px; overflow: hidden; padding-top: 54px; }
.status { position: absolute; top: 0; left: 0; right: 0; height: 54px; z-index: 5; }
.status .clock { position: absolute; top: 19px; left: 53px; font-size: 17px; font-weight: 600; letter-spacing: -0.2px; }
.status .system { position: absolute; top: 22px; right: 33px; display: flex; align-items: center; gap: 6px; }
.home { position: absolute; left: 148px; right: 148px; bottom: 8px; height: 5px; border-radius: 3px; background: var(--ink); z-index: 9; }
.top { display: flex; align-items: center; justify-content: space-between; padding: 12px 24px 0; }
.top.plain { padding-top: 16px; }
.brand { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; letter-spacing: -0.1px; }
.brand-mark { width: 30px; height: 30px; display: block; }
.sample-tag { font-size: 11.5px; font-weight: 600; letter-spacing: 0.1px; color: var(--ink-2); background: rgba(19, 26, 34, 0.07); padding: 5px 9px; border-radius: 99px; white-space: nowrap; }
h1 { font-family: var(--serif); font-weight: 400; font-size: 50px; line-height: 1; letter-spacing: -0.8px; }
.title-row { display: flex; align-items: baseline; justify-content: space-between; padding: 14px 24px 0; }
.date { font-size: 15px; color: var(--ink-2); font-weight: 500; }
h2 { font-size: 13.5px; font-weight: 600; color: var(--ink-2); padding: 19px 24px 9px; letter-spacing: 0.1px; }
h2.flush { padding: 18px 0 8px; }
.summary { position: relative; margin: 16px 20px 0; height: 172px; border-radius: 26px; color: #fff; overflow: hidden; background: linear-gradient(135deg, #125c35 0%, #1a7f49 62%, #27a05e 100%); }
.summary-text { position: absolute; left: 22px; top: 21px; width: 212px; }
.summary .eyebrow { font-size: 13px; font-weight: 500; color: #bfe8cd; }
.big { font-family: var(--serif); font-size: 36px; line-height: 1.05; margin-top: 4px; }
.big em { font-style: normal; color: #daf975; }
.meter { display: flex; gap: 5px; margin-top: 16px; }
.meter i { width: 36px; height: 7px; border-radius: 4px; background: rgba(255, 255, 255, 0.22); }
.meter i.on { background: #daf975; }
.hint { font-size: 13.5px; margin-top: 12px; color: #d5efdd; }
.summary-art { position: absolute; right: -8px; bottom: -44px; }
.group { margin: 0 20px; background: var(--card); border-radius: 22px; padding: 2px 0; }
.task { display: flex; align-items: center; gap: 13px; padding: 9px 14px; position: relative; }
.task + .task::before, .care + .care::before, .agenda + .agenda::before { content: ''; position: absolute; top: 0; left: 77px; right: 14px; height: 1px; background: var(--line); }
.task-text { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; flex: 1; }
.task-text strong { font-size: 16.5px; font-weight: 600; letter-spacing: -0.15px; }
.chip { display: inline-flex; align-items: center; gap: 4px; font-size: 12.5px; font-weight: 600; padding: 2.5px 8px 2.5px 6px; border-radius: 99px; }
.tick { width: 28px; height: 28px; border-radius: 50%; border: 2px solid #cdd3db; display: flex; align-items: center; justify-content: center; color: #fff; }
.done .tick { background: var(--leaf); border-color: var(--leaf); }
.tile { flex: none; }
.tabs { position: absolute; left: 16px; right: 16px; bottom: 24px; height: 66px; border-radius: 33px; background: rgba(255, 255, 255, 0.78); backdrop-filter: blur(18px) saturate(1.5); box-shadow: 0 10px 30px rgba(19, 26, 34, 0.14), 0 0 0 0.5px rgba(19, 26, 34, 0.05); display: flex; align-items: center; padding: 0 6px; z-index: 8; }
.screen:has(.tabs)::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 130px; background: linear-gradient(180deg, rgba(242, 243, 247, 0), rgba(242, 243, 247, 0.92) 70%, #F2F3F7 80%); z-index: 7; }
.tab { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; height: 54px; border-radius: 27px; color: var(--ink-2); font-size: 10.5px; }
.tab b { font-weight: 600; }
.tab.on { color: var(--leaf-deep); background: var(--leaf-tint); }

/* Plant page */
.hero { position: absolute; top: 0; left: 0; }
.hero-bar { position: absolute; top: 62px; left: 20px; right: 20px; display: flex; justify-content: space-between; align-items: center; z-index: 4; }
.glass { width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.72); box-shadow: 0 2px 10px rgba(19, 26, 34, 0.1); }
.hero-actions { display: flex; align-items: center; gap: 10px; }
.hero-actions .sample-tag { background: rgba(255, 255, 255, 0.72); }
.sheet { position: absolute; left: 0; right: 0; top: 420px; bottom: 0; padding: 24px 22px 0; background: var(--bg); border-radius: 34px 34px 0 0; }
.sheet-title { display: flex; justify-content: space-between; align-items: flex-start; }
.plant-name { font-size: 46px; }
.species { font-size: 14px; color: var(--ink-2); margin-top: 6px; }
.species em { font-family: var(--serif); font-size: 17px; color: var(--ink); }
.health { font-size: 13px; font-weight: 700; color: var(--leaf-deep); background: var(--leaf-tint); padding: 6px 11px; border-radius: 99px; margin-top: 7px; }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 18px; }
.stat { background: var(--card); border-radius: 20px; padding: 14px 13px 13px; display: flex; flex-direction: column; }
.stat b { font-size: 19px; font-weight: 700; letter-spacing: -0.3px; margin-top: 8px; }
.stat small { font-size: 12.5px; color: var(--ink-2); margin-top: 1px; }
.group.flat { margin: 0; }
.care { display: flex; align-items: center; gap: 12px; padding: 9px 12px; position: relative; color: var(--ink-3); }
.care + .care::before { left: 62px; }
.care-icon { width: 38px; height: 38px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex: none; }
.care-text { display: flex; flex-direction: column; flex: 1; color: var(--ink); }
.care-text strong { font-size: 15.5px; font-weight: 600; }
.care-text small { font-size: 12.5px; color: var(--ink-2); }
.care-next { font-size: 13px; font-weight: 500; color: var(--ink-2); }
.primary { position: absolute; left: 22px; right: 22px; bottom: 30px; height: 58px; border: 0; border-radius: 29px; background: linear-gradient(180deg, #23a85f, #17894b); color: #fff; font: 700 17px var(--sans); display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 10px 24px rgba(23, 137, 75, 0.32); }

/* Schedule */
.calendar { margin: 16px 20px 0; background: var(--card); border-radius: 24px; padding: 16px 14px 12px; }
.month { display: flex; justify-content: space-between; align-items: center; padding: 0 8px; }
.month strong { font-family: var(--serif); font-weight: 400; font-size: 29px; }
.arrows { display: flex; gap: 14px; color: var(--ink-2); }
.weekdays, .days { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; }
.weekdays { font-size: 12px; font-weight: 600; color: var(--ink-3); margin-top: 10px; }
.day { position: relative; height: 54px; font-size: 16.5px; font-weight: 500; display: flex; flex-direction: column; align-items: center; padding-top: 11px; }
.day.past { color: var(--ink-3); }
.day b { font-weight: inherit; }
.day.picked { color: #fff; font-weight: 700; }
.day.picked::before { content: ''; position: absolute; top: 3px; left: 50%; width: 46px; height: 48px; margin-left: -23px; border-radius: 16px; background: var(--leaf); }
.day.picked b, .day.picked .dots { position: relative; }
.dots { display: flex; gap: 3px; height: 5px; margin-top: 4px; }
.dots i { width: 5px; height: 5px; border-radius: 50%; }
.agenda { display: flex; align-items: center; gap: 12px; padding: 9px 12px; position: relative; }
.agenda + .agenda::before { left: 112px; right: 12px; }
.time { width: 44px; font-size: 13.5px; font-weight: 600; color: var(--ink-2); }
.agenda-text { display: flex; flex-direction: column; flex: 1; }
.agenda-text strong { font-size: 15.5px; font-weight: 600; letter-spacing: -0.1px; }
.agenda-text small { font-size: 12.5px; color: var(--ink-2); }
.bar { width: 4px; height: 32px; border-radius: 2px; }

/* Journal */
.filters { display: flex; gap: 8px; padding: 14px 20px 2px; }
.filters span { font-size: 13.5px; font-weight: 600; padding: 8px 14px; border-radius: 99px; background: var(--card); color: var(--ink-2); }
.filters span.on { background: var(--ink); color: #fff; }
.note { margin: 12px 20px 0; background: var(--card); border-radius: 24px; overflow: hidden; }
.note-photo svg { width: 100%; }
.note-body { padding: 11px 15px 13px; }
.note-meta { display: flex; align-items: center; gap: 8px; font-size: 15px; }
.note-meta strong { font-weight: 600; flex: 1; }
.note-meta time { font-size: 13px; color: var(--ink-2); }
.note p { font-size: 14.5px; line-height: 1.34; margin-top: 7px; }
.note-tags { display: flex; gap: 6px; margin-top: 8px; }
.note-tags span { font-size: 12px; font-weight: 600; color: var(--leaf-deep); background: var(--leaf-tint); padding: 3px 9px; border-radius: 99px; }
.fab { position: absolute; right: 26px; bottom: 106px; width: 58px; height: 58px; border-radius: 50%; background: var(--leaf); color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 24px rgba(23, 137, 75, 0.36); z-index: 8; }

/* Insights */
.card { margin: 12px 20px 0; background: var(--card); border-radius: 24px; padding: 15px 16px; }
.card small { font-size: 13px; color: var(--ink-2); }
.card-head { display: flex; justify-content: space-between; align-items: baseline; }
.card-head strong { font-size: 15.5px; font-weight: 600; }
.score { display: flex; align-items: center; gap: 16px; margin-top: 14px; }
.ring-number { font: 400 31px var(--serif); fill: var(--ink); }
.eyebrow.dark { font-size: 13px; font-weight: 500; color: var(--ink-2); }
.big.dark { font-size: 27px; color: var(--ink); line-height: 1.04; margin-top: 2px; }
.hint.dark { font-size: 12.5px; color: var(--ink-2); margin-top: 5px; }
.chart { margin-top: 11px; overflow: visible; }
.axis { font: 500 11.5px var(--sans); fill: var(--ink-3); }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 12px 20px 0; }
.pair .card { margin: 0; height: 122px; }
.stat-number { font-family: var(--serif); font-size: 37px; line-height: 1; margin-top: 3px; }
.stat-number span { font: 500 13px var(--sans); color: var(--ink-2); margin-left: 5px; }
.streak { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-top: 9px; }
.streak i { height: 8px; border-radius: 3px; background: #e6e9ee; }
.streak i.on { background: var(--leaf); }
.bars { display: flex; align-items: flex-end; gap: 6px; height: 28px; margin-top: 4px; }
.bars i { flex: 1; border-radius: 3px; background: #fbd5ca; max-height: 28px; }
.bars i.on { background: var(--sun); }
.rows { padding-bottom: 8px; }
.rank { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.rank strong { width: 62px; font-size: 14px; font-weight: 600; }
.rank-bar { flex: 1; height: 7px; background: #eef1f5; border-radius: 4px; overflow: hidden; }
.rank-bar i { display: block; height: 100%; background: var(--water); border-radius: 4px; }
.rank small { width: 76px; text-align: right; font-size: 12px; }
`;
