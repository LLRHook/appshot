// Original plant illustrations for the Sample Garden screens, built from plain SVG shapes. Nothing
// here is traced or taken from anywhere. There is no randomness, so every run draws the same pixels.

const GREENS = {
	deep: ['#1E7A45', '#176338'],
	mid: ['#2F9A58', '#237E48'],
	light: ['#52B873', '#3B9F5E'],
	fresh: ['#9BD86F', '#7CC558']
};

const round = (value) => Math.round(value * 100) / 100;

/** Half-outlines of a leaf: points along the leaf (t) and out from its midrib (s). */
const LEAF_SHAPES = {
	oval: [
		[0.1, 0.42, 0.25, 0.52, 0.45, 0.52],
		[0.68, 0.52, 0.88, 0.25, 1, 0]
	],
	fiddle: [
		[0.05, 0.34, 0.15, 0.38, 0.27, 0.36],
		[0.36, 0.35, 0.4, 0.52, 0.56, 0.58],
		[0.74, 0.65, 0.93, 0.36, 1, 0]
	],
	heart: [
		[-0.12, 0.34, 0, 0.6, 0.24, 0.56],
		[0.5, 0.52, 0.8, 0.24, 1, 0]
	]
};

/** A leaf from its base point. `angle` is degrees clockwise from straight up. */
export function leaf({ x, y, angle, length, width, tone = 'mid', shape = 'oval', veins = 3 }) {
	const radians = (angle * Math.PI) / 180;
	const along = [Math.sin(radians), -Math.cos(radians)];
	const across = [Math.cos(radians), Math.sin(radians)];
	const at = (t, s) =>
		`${round(x + along[0] * length * t + across[0] * width * s)} ${round(y + along[1] * length * t + across[1] * width * s)}`;
	const half = (side) =>
		LEAF_SHAPES[shape]
			.map(
				([t1, s1, t2, s2, t3, s3]) =>
					`C${at(t1, s1 * side)} ${at(t2, s2 * side)} ${at(t3, s3 * side)}`
			)
			.join('');
	const [front, back] = GREENS[tone];
	const ribs = Array.from({ length: veins }, (_, index) => {
		const t = 0.22 + (index * 0.56) / Math.max(1, veins - 1);
		const reach = shape === 'fiddle' ? 0.4 : 0.34;
		return [1, -1]
			.map(
				(side) =>
					`M${at(t, 0)}Q${at(t + 0.08, reach * 0.55 * side)} ${at(t + 0.15, reach * side * (1.05 - t * 0.5))}`
			)
			.join('');
	}).join('');
	return `<path d="M${at(0, 0)}${half(1)}Z" fill="${front}"/><path d="M${at(0, 0)}${half(-1)}Z" fill="${back}"/><path d="${ribs}" fill="none" stroke="#fff" stroke-opacity=".11" stroke-width="${round(length * 0.011)}" stroke-linecap="round"/><path d="M${at(0, 0)}L${at(0.94, 0)}" stroke="#fff" stroke-opacity=".2" stroke-width="${round(length * 0.014)}" stroke-linecap="round"/>`;
}

let serial = 0;

/** A straight-sided pot with a rim. `top` is the rim's top edge, centered on `x`. */
export function pot({ x, top, width, height, colors }) {
	const id = `pot${serial++}`;
	const [light, mid, dark] = colors;
	const rim = height * 0.2;
	const left = x - width / 2;
	const inset = width * 0.12;
	const bottom = top + height;
	return `<defs><linearGradient id="${id}" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${light}"/><stop offset=".55" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs><path d="M${round(left + width * 0.04)} ${round(top + rim * 0.7)}H${round(left + width * 0.96)}L${round(left + width - inset)} ${round(bottom - width * 0.05)}Q${round(left + width - inset - width * 0.01)} ${round(bottom)} ${round(left + width - inset - width * 0.06)} ${round(bottom)}H${round(left + inset + width * 0.06)}Q${round(left + inset + width * 0.01)} ${round(bottom)} ${round(left + inset)} ${round(bottom - width * 0.05)}Z" fill="url(#${id})"/><rect x="${round(left)}" y="${round(top)}" width="${round(width)}" height="${round(rim)}" rx="${round(rim * 0.28)}" fill="url(#${id})"/><rect x="${round(left + width * 0.04)}" y="${round(top + rim)}" width="${round(width * 0.92)}" height="${round(rim * 0.2)}" fill="#000" fill-opacity=".1"/>`;
}

const POTS = {
	stone: ['#F7F8FA', '#DDE2E9', '#AEB7C4'],
	clay: ['#EE8F6C', '#D96E4A', '#A84E32'],
	ink: ['#4A5568', '#2F3846', '#1B222D'],
	lilac: ['#CFC4F7', '#AB9BEC', '#7F6CD0'],
	sky: ['#B9D3FB', '#86B2F5', '#5688DC']
};

/** A fiddle-leaf fig: one slim trunk, large waisted leaves, a crown of fresher growth. */
export function figPlant({ x, y, size, pot: potColor = 'stone' }) {
	const unit = size / 100;
	const potHeight = 22 * unit;
	const trunkTop = y - 80 * unit;
	const potTop = y - potHeight;
	const leaves = [
		[0.24, -74, 27, 'deep'],
		[0.3, 70, 28, 'deep'],
		[0.44, -58, 29, 'mid'],
		[0.5, 56, 29, 'mid'],
		[0.62, -42, 27, 'deep'],
		[0.66, 40, 27, 'mid'],
		[0.78, -26, 24, 'light'],
		[0.82, 24, 23, 'light'],
		[0.92, -9, 20, 'light'],
		[0.97, 12, 17, 'fresh']
	];
	const trunkAt = (t) => [x + Math.sin(t * 2.6) * 2.4 * unit, potTop - (potTop - trunkTop) * t];
	const trunk = `<path d="M${x} ${round(potTop + 2 * unit)}${Array.from({ length: 12 }, (_, i) => {
		const [px, py] = trunkAt((i + 1) / 12);
		return `L${round(px)} ${round(py)}`;
	}).join(
		''
	)}" fill="none" stroke="#6B5B4D" stroke-width="${round(1.7 * unit)}" stroke-linecap="round" stroke-linejoin="round"/>`;
	const art = leaves
		.map(([t, angle, length, tone]) => {
			const [px, py] = trunkAt(t);
			return leaf({
				x: px,
				y: py,
				angle,
				length: length * unit,
				width: length * 0.72 * unit,
				tone,
				shape: 'fiddle',
				veins: 4
			});
		})
		.join('');
	return `${trunk}${art}${pot({ x, top: potTop, width: 32 * unit, height: potHeight, colors: POTS[potColor] })}`;
}

/** A pothos on a shelf: heart leaves above the rim, two vines trailing past the shelf's edge. */
export function pothosPlant({ x, y, size, pot: potColor = 'sky' }) {
	const unit = size / 100;
	const potHeight = 24 * unit;
	const shelfY = y - 30 * unit;
	const potTop = shelfY - potHeight;
	const heart = (bx, by, angle, length, tone) =>
		leaf({
			x: bx,
			y: by,
			angle,
			length: length * unit,
			width: length * 0.84 * unit,
			tone,
			shape: 'heart',
			veins: 2
		});
	const crown = [
		[-64, 28, 'deep'],
		[64, 28, 'deep'],
		[-36, 33, 'mid'],
		[36, 33, 'mid'],
		[-12, 36, 'light'],
		[16, 30, 'fresh']
	].map(([angle, length, tone]) => heart(x, potTop + 3 * unit, angle, length, tone));
	const vine = (side) => {
		const stops = [
			[22, -6, 128, 15, 'mid'],
			[27, 4, 152, 15, 'light'],
			[29, 15, 176, 14, 'deep'],
			[29, 26, 190, 13, 'mid'],
			[28, 36, 170, 12, 'light']
		];
		const path = `M${round(x + 12 * side * unit)} ${round(potTop + unit)}C${round(x + 26 * side * unit)} ${round(potTop - 6 * unit)} ${round(x + 31 * side * unit)} ${round(potTop + 14 * unit)} ${round(x + 28 * side * unit)} ${round(potTop + 40 * unit)}`;
		return `<path d="${path}" fill="none" stroke="#3B8F58" stroke-width="${round(unit * 0.9)}" stroke-linecap="round"/>${stops
			.map(([dx, dy, angle, length, tone]) =>
				heart(x + dx * side * unit, potTop + dy * unit, angle * side, length, tone)
			)
			.join('')}`;
	};
	const shelf = `<rect x="${round(x - 46 * unit)}" y="${round(shelfY)}" width="${round(92 * unit)}" height="${round(3.2 * unit)}" rx="${round(1.2 * unit)}" fill="#8F9BB0"/>`;
	return `${shelf}${crown.join('')}${pot({ x, top: potTop, width: 34 * unit, height: potHeight, colors: POTS[potColor] })}${vine(-1)}${vine(1)}`;
}

/** A snake plant: upright swords with darker bands and a pale edge. */
export function snakePlant({ x, y, size, pot: potColor = 'ink' }) {
	const unit = size / 100;
	const potHeight = 24 * unit;
	const potTop = y - potHeight;
	const swords = [
		[-13, 56, -9, 'deep'],
		[13, 60, 9, 'deep'],
		[-7, 74, -4, 'mid'],
		[7, 70, 4, 'mid'],
		[0, 84, 0, 'light']
	];
	const art = swords
		.map(([dx, height, lean, tone], index) => {
			const baseX = x + dx * unit;
			const tipX = baseX + lean * unit;
			const tipY = potTop - height * unit;
			const half = 5.4 * unit;
			const outline = `M${round(baseX - half * 0.8)} ${round(potTop + 2 * unit)}C${round(baseX - half * 1.5)} ${round(potTop - height * unit * 0.4)} ${round(tipX - half * 0.9)} ${round(tipY + height * unit * 0.3)} ${round(tipX)} ${round(tipY)}C${round(tipX + half * 0.9)} ${round(tipY + height * unit * 0.3)} ${round(baseX + half * 1.5)} ${round(potTop - height * unit * 0.4)} ${round(baseX + half * 0.8)} ${round(potTop + 2 * unit)}Z`;
			const clip = `sword${serial++}`;
			const bands = Array.from({ length: 9 }, (_, band) => {
				const bandY = potTop - (band + 0.5) * ((height * unit) / 9);
				const swing = band % 2 ? 1 : -1;
				return `<path d="M${round(baseX - 12 * unit)} ${round(bandY + swing * unit)}L${round(baseX - 3 * unit)} ${round(bandY - swing * 1.6 * unit)}L${round(baseX + 3 * unit)} ${round(bandY + swing * 1.6 * unit)}L${round(baseX + 14 * unit)} ${round(bandY - swing * unit)}" fill="none" stroke="#0F4F2B" stroke-opacity=".42" stroke-width="${round(1.5 * unit)}"/>`;
			}).join('');
			return `<clipPath id="${clip}"><path d="${outline}"/></clipPath><path d="${outline}" fill="${GREENS[tone][index % 2]}"/><g clip-path="url(#${clip})">${bands}</g><path d="${outline}" fill="none" stroke="#D5EFA8" stroke-width="${round(0.9 * unit)}"/>`;
		})
		.join('');
	return `${art}${pot({ x, top: potTop, width: 44 * unit, height: potHeight, colors: POTS[potColor] })}`;
}

/** A barrel cactus with ribs, small spines and one pink flower. */
export function cactusPlant({ x, y, size, pot: potColor = 'clay' }) {
	const unit = size / 100;
	const potHeight = 26 * unit;
	const potTop = y - potHeight;
	const radius = 25 * unit;
	const centerY = potTop - radius * 0.86;
	const id = `barrel${serial++}`;
	const ribs = [-0.72, -0.38, 0, 0.38, 0.72]
		.map((share) => {
			const reach = share * radius;
			return `<path d="M${round(x + reach * 0.2)} ${round(centerY - radius * 0.97)}Q${round(x + reach * 1.32)} ${round(centerY)} ${round(x + reach * 0.2)} ${round(centerY + radius * 0.97)}" fill="none" stroke="#0F5C33" stroke-opacity=".45" stroke-width="${round(1 * unit)}"/>`;
		})
		.join('');
	const spines = [
		[-0.55, -0.45],
		[-0.2, -0.62],
		[0.2, -0.62],
		[0.55, -0.45],
		[-0.68, 0.02],
		[-0.28, 0.02],
		[0.28, 0.02],
		[0.68, 0.02],
		[-0.55, 0.48],
		[-0.2, 0.58],
		[0.2, 0.58],
		[0.55, 0.48]
	]
		.map(([sx, sy]) => {
			const px = x + sx * radius;
			const py = centerY + sy * radius;
			const tick = 1.7 * unit;
			return `<path d="M${round(px - tick)} ${round(py - tick)}L${round(px + tick)} ${round(py + tick)}M${round(px + tick)} ${round(py - tick)}L${round(px - tick)} ${round(py + tick)}" stroke="#E9F7D8" stroke-width="${round(0.6 * unit)}" stroke-linecap="round"/>`;
		})
		.join('');
	const petals = Array.from({ length: 7 }, (_, index) => {
		const angle = -60 + index * 20;
		return `<ellipse cx="${round(x)}" cy="${round(centerY - radius - 4 * unit)}" rx="${round(2.2 * unit)}" ry="${round(5.4 * unit)}" fill="${index % 2 ? '#F06BB0' : '#E3489B'}" transform="rotate(${angle} ${round(x)} ${round(centerY - radius + 1 * unit)})"/>`;
	}).join('');
	return `<defs><radialGradient id="${id}" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#5DBF7B"/><stop offset=".62" stop-color="#2C9458"/><stop offset="1" stop-color="#176338"/></radialGradient></defs>${petals}<circle cx="${round(x)}" cy="${round(centerY - radius + 0.5 * unit)}" r="${round(2 * unit)}" fill="#FFD9EC"/><ellipse cx="${round(x)}" cy="${round(centerY)}" rx="${round(radius)}" ry="${round(radius)}" fill="url(#${id})"/>${ribs}${spines}${pot({ x, top: potTop, width: 46 * unit, height: potHeight, colors: POTS[potColor] })}`;
}

/** A fern: arching fronds whose leaflets shrink toward each tip. */
export function fernPlant({ x, y, size, pot: potColor = 'lilac' }) {
	const unit = size / 100;
	const potHeight = 24 * unit;
	const potTop = y - potHeight;
	const fronds = [
		[-78, 42, 'deep'],
		[78, 42, 'deep'],
		[-56, 52, 'mid'],
		[56, 52, 'mid'],
		[-34, 58, 'deep'],
		[34, 58, 'deep'],
		[-14, 62, 'light'],
		[14, 62, 'mid'],
		[0, 58, 'fresh']
	];
	const art = fronds
		.map(([angle, length, tone]) => {
			const radians = (angle * Math.PI) / 180;
			const startX = x + Math.sin(radians) * 5 * unit;
			const startY = potTop + unit;
			const reach = length * unit;
			const controlX = startX + Math.sin(radians * 0.6) * reach * 0.62;
			const controlY = startY - Math.cos(radians * 0.6) * reach * 0.8;
			const endX = startX + Math.sin(radians * 1.25) * reach;
			const endY = startY - Math.cos(radians * 1.25) * reach * 0.82 + Math.abs(angle) * 0.1 * unit;
			const point = (t) => [
				(1 - t) ** 2 * startX + 2 * (1 - t) * t * controlX + t * t * endX,
				(1 - t) ** 2 * startY + 2 * (1 - t) * t * controlY + t * t * endY
			];
			const heading = (t) => {
				const dx = 2 * (1 - t) * (controlX - startX) + 2 * t * (endX - controlX);
				const dy = 2 * (1 - t) * (controlY - startY) + 2 * t * (endY - controlY);
				return (Math.atan2(dx, -dy) * 180) / Math.PI;
			};
			const leaflets = Array.from({ length: 13 }, (_, index) => {
				const t = 0.14 + index * 0.066;
				const [px, py] = point(t);
				const leafLength = (11.5 - index * 0.68) * unit;
				return [-1, 1]
					.map((side) =>
						leaf({
							x: px,
							y: py,
							angle: heading(t) + side * 58,
							length: leafLength,
							width: leafLength * 0.52,
							tone,
							veins: 0
						})
					)
					.join('');
			}).join('');
			return `<path d="M${round(startX)} ${round(startY)}Q${round(controlX)} ${round(controlY)} ${round(endX)} ${round(endY)}" fill="none" stroke="${GREENS[tone][1]}" stroke-width="${round(0.9 * unit)}" stroke-linecap="round"/>${leaflets}`;
		})
		.join('');
	return `${art}${pot({ x, top: potTop, width: 38 * unit, height: potHeight, colors: POTS[potColor] })}`;
}

const PLANTS = {
	fig: figPlant,
	pothos: pothosPlant,
	snake: snakePlant,
	cactus: cactusPlant,
	fern: fernPlant
};

/** A rounded square thumbnail holding one plant, for list rows. */
export function plantTile(kind, { size = 48, background = '#E9EEF5', radius = 14 } = {}) {
	return `<svg class="tile" width="${size}" height="${size}" viewBox="0 0 120 120" style="border-radius:${radius}px;background:${background}">${PLANTS[kind]({ x: 60, y: 114, size: 102 })}</svg>`;
}

/** A soft wall, a window's light and a floor, with the fig standing in it. */
export function figRoom({ width, height }) {
	const floor = height * 0.8;
	return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="wall" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#C4D8F8"/><stop offset="1" stop-color="#E4ECFB"/></linearGradient><linearGradient id="ground" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#AFC2E4"/><stop offset="1" stop-color="#C6D4EC"/></linearGradient><filter id="soft"><feGaussianBlur stdDeviation="3"/></filter></defs><rect width="${width}" height="${height}" fill="url(#wall)"/><g fill="#fff" fill-opacity=".34" filter="url(#soft)"><path d="M${width * 0.04} ${height * 0.34}L${width * 0.27} ${height * 0.25}V${height * 0.58}L${width * 0.04} ${height * 0.7}Z"/><path d="M${width * 0.3} ${height * 0.24}L${width * 0.5} ${height * 0.16}V${height * 0.46}L${width * 0.3} ${height * 0.56}Z"/></g><rect y="${floor}" width="${width}" height="${height - floor}" fill="url(#ground)"/><rect y="${floor - 2}" width="${width}" height="2" fill="#fff" fill-opacity=".6"/><ellipse cx="${width * 0.5}" cy="${floor + height * 0.03}" rx="${width * 0.17}" ry="${height * 0.02}" fill="#3A4F7A" fill-opacity=".26"/>${figPlant({ x: width * 0.5, y: floor + height * 0.03, size: height * 0.72, pot: 'stone' })}</svg>`;
}

/** The newest growth up close: a rolled spear between two mature leaves. */
export function newLeafCloseUp({ width, height }) {
	const x = width * 0.5;
	const y = height * 1.05;
	const scale = height / 100;
	return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="closeup" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#E5EDFB"/><stop offset="1" stop-color="#CFE3DC"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#closeup)"/>${leaf({ x: x - 6 * scale, y, angle: -58, length: 116 * scale, width: 66 * scale, tone: 'deep', shape: 'fiddle', veins: 5 })}${leaf({ x: x + 6 * scale, y, angle: 56, length: 112 * scale, width: 62 * scale, tone: 'mid', shape: 'fiddle', veins: 5 })}<path d="M${x} ${y}C${x - 2 * scale} ${height * 0.7} ${x + 2 * scale} ${height * 0.45} ${x} ${height * 0.12}" stroke="#6B5B4D" stroke-width="${2.2 * scale}" fill="none" stroke-linecap="round"/>${leaf({ x, y: height * 0.62, angle: 3, length: 56 * scale, width: 15 * scale, tone: 'fresh', veins: 0 })}</svg>`;
}

/** A shelf with cuttings rooting in a glass, between two of the garden's smaller plants. */
export function cuttingsScene({ width, height }) {
	const scale = height / 100;
	const shelf = height * 0.88;
	const glassX = width * 0.5;
	const glassWidth = 26 * scale;
	const glassHeight = 44 * scale;
	const glassTop = shelf - glassHeight;
	const sprigs = [
		[-3, -30, 'mid'],
		[2, 24, 'light'],
		[-1, 2, 'fresh']
	];
	const stems = sprigs
		.map(([dx, angle, tone]) => {
			const baseX = glassX + dx * scale;
			const radians = (angle * Math.PI) / 180;
			const tipX = round(baseX + Math.sin(radians) * 46 * scale);
			const tipY = round(glassTop + 34 * scale - Math.cos(radians) * 46 * scale);
			return `<path d="M${baseX} ${shelf - 7 * scale}L${tipX} ${tipY}" stroke="#3B8F58" stroke-width="${0.9 * scale}" stroke-linecap="round"/>${leaf({ x: tipX, y: tipY, angle: angle - 28, length: 22 * scale, width: 19 * scale, tone, shape: 'heart', veins: 2 })}${leaf({ x: tipX, y: tipY, angle: angle + 30, length: 20 * scale, width: 17 * scale, tone: 'deep', shape: 'heart', veins: 2 })}`;
		})
		.join('');
	return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="cuttings" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#E7E2FB"/><stop offset="1" stop-color="#D8E7FB"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#cuttings)"/><rect y="${shelf}" width="${width}" height="${height - shelf}" fill="#B9C5DD"/>${cactusPlant({ x: width * 0.2, y: shelf, size: 54 * scale, pot: 'clay' })}${snakePlant({ x: width * 0.8, y: shelf, size: 66 * scale, pot: 'ink' })}${stems}<rect x="${glassX - glassWidth / 2 + 1}" y="${glassTop + glassHeight * 0.34}" width="${glassWidth - 2}" height="${glassHeight * 0.66 - 1}" rx="${2.4 * scale}" fill="#7FB0F6" fill-opacity=".55"/><rect x="${glassX - glassWidth / 2}" y="${glassTop}" width="${glassWidth}" height="${glassHeight}" rx="${3 * scale}" fill="#fff" fill-opacity=".24" stroke="#fff" stroke-opacity=".9" stroke-width="${0.9 * scale}"/></svg>`;
}

/** The sample's mark: a two-leaf sprout in a small pot, on transparency. */
export function sampleMark(size) {
	const unit = size / 640;
	const scaled = (value) => round(value * unit);
	const left = leaf({
		x: 320 * unit,
		y: 318 * unit,
		angle: -46,
		length: 300 * unit,
		width: 208 * unit,
		tone: 'mid',
		veins: 3
	});
	const right = leaf({
		x: 320 * unit,
		y: 300 * unit,
		angle: 44,
		length: 256 * unit,
		width: 176 * unit,
		tone: 'fresh',
		veins: 3
	});
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${left}${right}<path d="M${scaled(320)} ${scaled(300)}V${scaled(420)}" stroke="#176338" stroke-width="${scaled(22)}" stroke-linecap="round"/><path d="M${scaled(192)} ${scaled(452)}H${scaled(448)}L${scaled(418)} ${scaled(578)}Q${scaled(413)} ${scaled(600)} ${scaled(390)} ${scaled(600)}H${scaled(250)}Q${scaled(227)} ${scaled(600)} ${scaled(222)} ${scaled(578)}Z" fill="#6D4FD8"/><rect x="${scaled(170)}" y="${scaled(400)}" width="${scaled(300)}" height="${scaled(66)}" rx="${scaled(18)}" fill="#8469E6"/></svg>`;
}
