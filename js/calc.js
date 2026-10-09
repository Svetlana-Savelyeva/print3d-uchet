// Все расчёты приложения. Чистые функции без доступа к хранилищу — их легко проверить тестами.
// Принцип: каждая сумма раскладывается на строки «база × ставка = сумма»; итог = сумма округлённых строк.

// Округление до копеек «как на бумаге»: 4,725 → 4,73 (гасим погрешность двоичных дробей).
export const round2 = (n) => {
  const x = Number(n) * 100;
  if (!Number.isFinite(x)) return 0;
  const r = Math.round(Math.abs(Number(x.toPrecision(12))));
  return (Math.sign(x) * r) / 100 || 0;
};
export const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const sum = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0);

// Группы назначений задают поведение в аналитике; названия назначений можно менять.
export const PURPOSE_GROUPS = {
  business: 'Бизнес',
  sale: 'Продажа',
  personal: 'Личное',
  gift: 'Подарки',
  test: 'Эксперименты',
  other: 'Прочее',
};

export const ROLE_LABELS = {
  model: 'Материал изделия',
  support: 'Supports',
  purge: 'Purge / flushing',
  tower: 'Prime tower',
  waste: 'Другие отходы',
};

// Как категория покупки попадает в «денежную» аналитику.
// capital — оборудование (инвестиция), tooling — оснащение, material — филамент,
// operating — эксплуатационные расходы, direct — прямой расход под конкретную печать, other — прочее.
export const PURCHASE_CATEGORIES = {
  equipment: { label: 'Оборудование', kind: 'capital' },
  tools: { label: 'Инструменты', kind: 'tooling' },
  outfit: { label: 'Оснащение', kind: 'tooling' },
  filament: { label: 'Филамент', kind: 'material' },
  parts: { label: 'Запасные части', kind: 'operating' },
  service: { label: 'Обслуживание', kind: 'operating' },
  consumable: { label: 'Расходники', kind: 'operating' },
  silica: { label: 'Силикагель', kind: 'operating' },
  glue: { label: 'Клей', kind: 'operating' },
  cleaning: { label: 'Средства для очистки', kind: 'operating' },
  packaging: { label: 'Упаковка', kind: 'operating' },
  software: { label: 'Программы', kind: 'operating' },
  other: { label: 'Прочее', kind: 'other' },
};

export const MONEY_KIND_LABELS = {
  capital: 'Оборудование',
  tooling: 'Оснащение',
  material: 'Филамент',
  operating: 'Эксплуатационные',
  direct: 'Прямые расходы',
  other: 'Прочее',
};

// ---------- Склад ----------

export function spoolStats(spool, movements) {
  const own = movements.filter((m) => m.spoolId === spool.id);
  const by = (t) => sum(own.filter((m) => m.type === t), (m) => m.grams);
  const bought = by('purchase');
  const left = round2(sum(own, (m) => m.grams));
  return {
    bought,
    printed: -by('print'),
    failed: -by('failure'),
    adjusted: -by('adjust'),
    writtenOff: -by('writeoff'),
    reversed: by('reverse'),
    used: round2(bought - left),
    left,
    value: round2(Math.max(0, left) * spool.costPerG),
  };
}

export function spoolStatus(spool, stats, lowStockG) {
  if (spool.closed || stats.left <= 0) return 'empty';
  if (stats.left >= spool.netG && stats.used <= 0) return 'new';
  if (stats.left < lowStockG) return 'low';
  return 'open';
}

export const costPerGram = (price, delivery, netG) => (netG > 0 ? (num(price) + num(delivery)) / num(netG) : 0);

// ---------- Оборудование и расходники ----------

export const amortBase = (eq) => Math.max(0, num(eq.price) + num(eq.extra) - num(eq.residual));
export const amortRate = (eq) => (eq.includeInCost && num(eq.resourceHours) > 0 ? amortBase(eq) / num(eq.resourceHours) : 0);

export function chargeAccrued(sourceId, prints) {
  let total = 0;
  for (const p of prints) {
    if (!p.finalized) continue;
    for (const c of p.charges || []) if (c.sourceId === sourceId) total += c.amount;
  }
  return round2(total);
}

export function equipmentHours(eq, prints) {
  const worked = sum(prints.filter((p) => p.finalized && (p.printerId === eq.id || equipmentAttached(eq, p))), (p) => num(p.hours));
  return round2(num(eq.initialHours) + worked);
}
const equipmentAttached = (eq, p) => eq.attachTo && eq.attachTo === p.printerId;

export function consumableRate(c) {
  if (c.mode === 'hour') return num(c.life) > 0 ? num(c.price) / num(c.life) : 0;
  if (c.mode === 'print') return num(c.life) > 0 ? num(c.price) / num(c.life) : 0;
  return 0;
}

export const consumableActive = (c, date) =>
  (c.mode === 'hour' || c.mode === 'print') && (!c.activeFrom || c.activeFrom <= date) && (!c.activeTo || date <= c.activeTo);

// ---------- Себестоимость печати ----------

/**
 * Рассчитывает себестоимость печати.
 * input: {
 *   date, hours, kwhActual?, extraCost?, extraLabel?,
 *   materials: [{ spool: {id, name, costPerG}, role, grams }],
 *   printer, equipment: [] (всё оборудование), consumables: [], prints: [] (для учёта уже начисленного),
 *   settings: { tariff, printerW, extraW }
 * }
 */
export function computeCost(input) {
  const { settings } = input;
  const hours = Math.max(0, num(input.hours));
  const materials = (input.materials || [])
    .filter((m) => m.spool && num(m.grams) > 0)
    .map((m) => {
      const grams = round2(num(m.grams));
      const costPerG = m.spool.costPerG;
      return {
        spoolId: m.spool.id,
        spoolName: m.spool.label || m.spool.name,
        role: m.role || 'model',
        grams,
        costPerG,
        amount: round2(grams * costPerG),
      };
    });

  const charges = [];
  // Электричество: фактические кВт·ч, если введены, иначе мощность × время.
  if (num(input.kwhActual) > 0) {
    const kwh = num(input.kwhActual);
    charges.push({ kind: 'electricity', label: 'Электричество (по счётчику)', base: `${fmtNum(kwh)} кВт·ч`, rate: `${fmtNum(settings.tariff)} ₽/кВт·ч`, amount: round2(kwh * num(settings.tariff)), sourceId: null });
  } else if (hours > 0) {
    const watts = num(input.printerW || settings.printerW) + num(settings.extraW);
    const kwh = (watts / 1000) * hours;
    charges.push({ kind: 'electricity', label: 'Электричество', base: `${fmtNum(watts)} Вт × ${fmtNum(hours)} ч = ${fmtNum(round2(kwh))} кВт·ч`, rate: `${fmtNum(settings.tariff)} ₽/кВт·ч`, amount: round2(kwh * num(settings.tariff)), sourceId: null });
  }
  if (num(input.extraCost) > 0) {
    charges.push({ kind: 'extra', label: input.extraLabel || 'Доп. прямые расходы', base: '', rate: '', amount: round2(num(input.extraCost)), sourceId: null });
  }

  // Амортизация: выбранный принтер + оборудование, привязанное к нему (например, AMS).
  const amortItems = (input.equipment || []).filter((e) => e.includeInCost && e.status !== 'retired' && input.printer && (e.id === input.printer.id || e.attachTo === input.printer.id));
  for (const eq of amortItems) {
    const rate = amortRate(eq);
    if (!rate || !hours) continue;
    const remaining = round2(amortBase(eq) - chargeAccrued(eq.id, input.prints || []));
    const amount = round2(Math.max(0, Math.min(rate * hours, remaining)));
    if (amount <= 0) continue;
    charges.push({ kind: 'amortization', label: `Амортизация: ${eq.name}`, base: `${fmtNum(hours)} ч`, rate: `${fmtNum(round2(rate))} ₽/ч`, amount, sourceId: eq.id });
  }

  // Эксплуатационные расходы по заранее заданной ставке.
  for (const c of (input.consumables || []).filter((c) => consumableActive(c, input.date))) {
    const rate = consumableRate(c);
    const base = c.mode === 'hour' ? hours : 1;
    if (!rate || !base) continue;
    const remaining = round2(num(c.price) - chargeAccrued(c.id, input.prints || []));
    const amount = round2(Math.max(0, Math.min(rate * base, remaining)));
    if (amount <= 0) continue;
    charges.push({ kind: 'ops', label: c.name, base: c.mode === 'hour' ? `${fmtNum(hours)} ч` : '1 печать', rate: c.mode === 'hour' ? `${fmtNum(round2(rate))} ₽/ч` : `${fmtNum(round2(rate))} ₽/печать`, amount, sourceId: c.id });
  }

  const k = (kind) => round2(sum(charges.filter((c) => c.kind === kind), (c) => c.amount));
  const material = round2(sum(materials, (m) => m.amount));
  const electricity = k('electricity');
  const extra = k('extra');
  const direct = round2(material + electricity + extra);
  const amortization = k('amortization');
  const ops = k('ops');
  const full = round2(direct + amortization + ops);
  return { materials, charges, totals: { material, electricity, extra, direct, amortization, ops, full } };
}

/** Делит себестоимость между годными и бракованными изделиями (брак выделяется отдельно). */
export function splitByQuality(full, contribution, qty, goodQty) {
  const q = Math.max(1, Math.round(num(qty)));
  const good = Math.max(0, Math.min(q, Math.round(num(goodQty))));
  const unit = full / q;
  return {
    qty: q,
    good,
    bad: q - good,
    unit: round2(unit),
    unitContribution: round2(contribution / q),
    failCost: round2(unit * (q - good)),
    goodCost: round2(full - unit * (q - good)),
    unitWithFailures: good > 0 ? round2(full / good) : 0,
  };
}

// ---------- Цена продажи ----------

export function priceOptions(unitCost, settings) {
  const fee = num(settings.mpFee) / 100;
  const pack = num(settings.packCost);
  const raw = (2 * unitCost + pack) / (1 - fee || 1);
  return {
    m50: round2(unitCost * 1.5),
    m100: round2(unitCost * 2),
    rec: Math.ceil(raw / 10) * 10,
    recRaw: round2(raw),
  };
}

export function saleResult(sale) {
  const revenue = round2(num(sale.qty) * num(sale.price));
  const fee = round2((revenue * num(sale.feePct)) / 100);
  const pack = round2(num(sale.packCost) * num(sale.qty));
  const cost = round2(num(sale.unitCost) * num(sale.qty));
  const contributionCost = round2(num(sale.unitContribution) * num(sale.qty));
  return {
    revenue,
    fee,
    pack,
    cost,
    profit: round2(revenue - fee - pack - cost),
    // Вклад в окупаемость: без амортизации, чтобы не учитывать стоимость принтера дважды.
    contribution: round2(revenue - fee - pack - contributionCost),
  };
}

// ---------- Аналитика ----------

export function periodRange(period, today, custom) {
  const d = new Date(today + 'T00:00:00');
  const iso = (x) => x.toISOString().slice(0, 10);
  const shift = (days) => { const x = new Date(d); x.setDate(x.getDate() + days); return iso(x); };
  switch (period) {
    case 'today': return { from: today, to: today };
    case 'week': { const wd = (d.getDay() + 6) % 7; return { from: shift(-wd), to: today }; }
    case 'month': return { from: today.slice(0, 8) + '01', to: today };
    case 'year': return { from: today.slice(0, 5) + '01-01', to: today };
    case 'custom': return { from: custom?.from || '0000-01-01', to: custom?.to || today };
    default: return { from: '0000-01-01', to: '9999-12-31' };
  }
}
const inRange = (date, r) => date >= r.from && date <= r.to;

export const ownerShareOf = (o) => Math.max(0, Math.min(100, num(o.ownerShare))) / 100;

/** Цена 1 шт. для Merino Home по выбранному способу: наценка 50 %, 100 % или своя цена. */
export function ownerUnitPrice(unitCost, mode, own) {
  if (mode === 'own' && num(own) > 0) return round2(num(own));
  if (mode === 'm50') return round2(unitCost * 1.5);
  if (mode === 'cost') return round2(unitCost);
  return round2(unitCost * 2);
}

/** Расчёт по Merino Home для строки выхода печати: сколько платит собственник и что остаётся вам. */
export function ownerResult(o, unitCost, unitContribution) {
  const s = ownerShareOf(o);
  const q = num(o.qty);
  const price = num(o.unitPrice) || unitCost;
  return {
    share: s,
    price,
    total: round2(price * q),
    owner: round2(s * price * q), // выставляется собственнику — ваша выручка
    mine: round2((1 - s) * price * q), // ваша доля по цене (расход в учёте Merino Home)
    ownerCost: round2(s * unitCost * q),
    profit: round2(s * (price - unitCost) * q), // прибыль: цена минус себестоимость доли собственника
    contribution: round2(s * (price - unitContribution) * q), // вклад в окупаемость (без амортизации)
    myCost: round2((1 - s) * unitCost * q), // ваша доля себестоимости
  };
}

export function purposeGroup(state, purposeId) {
  return state.purposes.find((p) => p.id === purposeId)?.group || 'other';
}

export function dashboard(state, range) {
  const prints = state.prints.filter((p) => p.finalized && inRange(p.date, range));
  const t = (f) => round2(sum(prints, f));
  const byGroup = Object.fromEntries(Object.keys(PURPOSE_GROUPS).map((g) => [g, 0]));
  let failCost = 0;
  let economy = 0;
  let ownerDue = 0, ownerProfit = 0, ownerCost = 0, ownerQty = 0;
  for (const p of prints) {
    failCost += p.split.failCost;
    for (const o of p.outputs || []) {
      const s = ownerShareOf(o);
      byGroup[purposeGroup(state, o.purposeId)] += p.split.unit * o.qty;
      if (s > 0) {
        const r = ownerResult(o, p.split.unit, p.split.unitContribution);
        ownerDue += r.owner;
        ownerProfit += r.profit;
        ownerCost += r.ownerCost;
        ownerQty += o.qty;
      }
      // Экономия — ваша доля: (1 − доля собственника) × (аналог − себестоимость).
      if (num(o.analogPrice) > 0) economy += (1 - s) * (num(o.analogPrice) - p.split.unit) * o.qty;
    }
  }
  for (const g in byGroup) byGroup[g] = round2(byGroup[g]);

  const purchases = state.purchases.filter((x) => inRange(x.date, range));
  const moneyByKind = Object.fromEntries(Object.keys(MONEY_KIND_LABELS).map((k) => [k, 0]));
  for (const x of purchases) moneyByKind[x.kind] = round2((moneyByKind[x.kind] || 0) + num(x.amount));

  const sales = state.sales.filter((s) => inRange(s.date, range)).map((s) => ({ ...s, r: saleResult(s) }));

  return {
    printsCount: prints.length,
    success: prints.filter((p) => p.status === 'done').length,
    failedCount: prints.filter((p) => p.status === 'partial' || p.status === 'failed').length,
    items: sum(prints, (p) => p.split.good),
    grams: t((p) => sum(p.materials, (m) => m.grams)),
    hours: t((p) => num(p.hours)),
    totals: {
      material: t((p) => p.totals.material),
      electricity: t((p) => p.totals.electricity),
      extra: t((p) => p.totals.extra),
      direct: t((p) => p.totals.direct),
      amortization: t((p) => p.totals.amortization),
      ops: t((p) => p.totals.ops),
      full: t((p) => p.totals.full),
    },
    byGroup,
    failCost: round2(failCost),
    economy: round2(economy),
    owner: { revenue: round2(ownerDue), profit: round2(ownerProfit), cost: round2(ownerCost), qty: ownerQty },
    money: round2(sum(purchases, (x) => num(x.amount))),
    moneyByKind,
    sales: {
      list: sales,
      count: sales.length,
      qty: sum(sales, (s) => num(s.qty)),
      revenue: round2(sum(sales, (s) => s.r.revenue)),
      profit: round2(sum(sales, (s) => s.r.profit)),
      contribution: round2(sum(sales, (s) => s.r.contribution)),
    },
  };
}

export function payback(state) {
  const invested = round2(sum(state.purchases.filter((x) => x.kind === 'capital' || x.kind === 'tooling'), (x) => num(x.amount)));
  const capital = round2(sum(state.purchases.filter((x) => x.kind === 'capital'), (x) => num(x.amount)));
  let economy = 0;
  let owner = 0;
  for (const p of state.prints.filter((p) => p.finalized)) {
    for (const o of p.outputs || []) {
      const s = ownerShareOf(o);
      const c = p.split.unitContribution;
      // Собственник платит свою долю цены. Сверх живых расходов (материал, свет, расходники)
      // это и есть вклад в окупаемость принтера.
      if (s > 0) owner += ownerResult(o, p.split.unit, c).contribution;
      if (num(o.analogPrice) > 0) economy += (1 - s) * (num(o.analogPrice) - c) * o.qty;
    }
  }
  const salesContribution = round2(sum(state.sales, (s) => saleResult(s).contribution));
  const effect = round2(economy + owner + salesContribution);
  const firstDate = state.purchases.filter((x) => x.kind === 'capital').map((x) => x.date).sort()[0];
  return {
    invested,
    capital,
    tooling: round2(invested - capital),
    economy: round2(economy),
    owner: round2(owner),
    sales: salesContribution,
    effect,
    left: round2(Math.max(0, invested - effect)),
    pct: invested > 0 ? Math.min(100, (effect / invested) * 100) : 0,
    since: firstDate,
  };
}

export function modelStats(modelId, prints) {
  const own = prints.filter((p) => p.finalized && p.modelId === modelId).sort((a, b) => (a.date < b.date ? -1 : 1));
  const units = sum(own, (p) => p.split.good);
  const goodPrints = own.filter((p) => p.split.good > 0);
  return {
    prints: own.length,
    units,
    ok: own.filter((p) => p.status === 'done').length,
    failed: own.filter((p) => p.status !== 'done').length,
    grams: round2(sum(own, (p) => sum(p.materials, (m) => m.grams))),
    hours: round2(sum(own, (p) => num(p.hours))),
    avgUnit: goodPrints.length ? round2(sum(goodPrints, (p) => p.split.unit * p.split.good) / units) : 0,
    lastUnit: goodPrints.length ? goodPrints[goodPrints.length - 1].split.unit : 0,
    last: own[own.length - 1] || null,
  };
}

export function fmtNum(n) {
  return Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}
