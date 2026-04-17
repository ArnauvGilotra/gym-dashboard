// Gym Log — editorial redesign
// Opus 4.7 · Apr 2026

let DATA = null;
let activeCharts = [];
let currentCategoryFilter = 'all';

// Muted, earthy palette — not neon
const MUSCLE_COLORS = {
    back:      '#8B7EC7',
    legs:      '#6BA38F',
    chest:     '#D47765',
    arms:      '#D4A574',
    biceps:    '#C89A65',
    triceps:   '#BF7E70',
    shoulders: '#7BA5A5',
    cardio:    '#9590B3',
    core:      '#C08FA3',
    other:     '#6E6E66',
};

const ACCENT = '#E8A87C';
const POS = '#849B7A';
const NEG = '#D47765';
const INK = '#ECEAE0';
const INK_DIM = '#8D8F87';
const INK_FAINT = '#5A5C55';
const RULE = 'rgba(255, 253, 245, 0.07)';

const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    plugins: {
        legend: { display: false },
        tooltip: {
            backgroundColor: INK,
            titleColor: '#0D100F',
            bodyColor: '#0D100F',
            borderWidth: 0,
            cornerRadius: 4,
            padding: 8,
            displayColors: false,
            titleFont: { family: "'JetBrains Mono'", weight: '500', size: 10 },
            bodyFont: { family: "'Inter'", size: 11, weight: '500' },
        },
    },
    scales: {
        x: {
            border: { display: false },
            grid: { display: false },
            ticks: {
                color: INK_FAINT,
                font: { family: "'JetBrains Mono'", size: 9, weight: 400 },
                maxRotation: 0,
                autoSkip: true,
                maxTicksLimit: 6,
                padding: 4,
            },
        },
        y: {
            border: { display: false },
            grid: { color: RULE, drawTicks: false },
            ticks: {
                color: INK_FAINT,
                font: { family: "'JetBrains Mono'", size: 9, weight: 400 },
                padding: 8,
            },
        },
    },
};

// =================== BOOT ===================

async function loadData() {
    try {
        const resp = await fetch('data/gym-data.json?t=' + Date.now());
        DATA = await resp.json();
        renderAll();
    } catch (e) {
        console.error('Failed to load:', e);
    }
}

function renderAll() {
    renderMasthead();
    renderLead();
    renderInsightsProse();
    renderPRs();
    renderHeatmap();
    renderMuscleBars();
    renderConsistency();
    renderExercises();
    renderFooter();
}

// =================== MASTHEAD / LEAD ===================

function renderMasthead() {
    const now = new Date();
    document.getElementById('hero-date').textContent =
        now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toLowerCase();
}

function renderLead() {
    const s = DATA.summary;
    const c = DATA.comparisons;

    // Volume as the lead number
    const vol = c.this_week.volume;
    document.getElementById('lead-volume').textContent = fmtHumanLarge(vol);

    // Volume delta
    const deltaEl = document.getElementById('lead-delta');
    const wow = c.volume_wow_pct;
    if (wow !== null && wow !== undefined) {
        if (wow > 0) {
            deltaEl.textContent = `+${wow}% vs last week`;
            deltaEl.className = 'delta pos';
        } else if (wow < 0) {
            deltaEl.textContent = `${wow}% vs last week`;
            deltaEl.className = 'delta neg';
        } else {
            deltaEl.textContent = 'same as last week';
            deltaEl.className = 'delta flat';
        }
    } else {
        deltaEl.textContent = '';
    }

    // Stats row
    document.getElementById('lead-sessions').textContent = c.this_week.sessions;
    document.getElementById('lead-streak').textContent = s.streak_weeks;
    document.getElementById('lead-total').textContent = s.total_sessions;
}

// =================== INSIGHTS AS PROSE ===================

function renderInsightsProse() {
    const el = document.getElementById('insights-prose');
    const insights = DATA.insights || [];
    const c = DATA.comparisons;

    // Compose a natural-sounding paragraph from rule-based observations.
    // Thinking: group by tone. Lead with wins (if any), then notes, then concerns.

    const wins = insights.filter(i => i.severity === 'good');
    const notes = insights.filter(i => i.severity === 'medium');
    const concerns = insights.filter(i => i.severity === 'high');

    const sentences = [];

    // Opening sentence — frame the week
    const thisWk = c.this_week.sessions;
    const lastWk = c.last_week.sessions;

    if (thisWk === 0 && lastWk > 0) {
        sentences.push(`No sessions yet this week — last week had <em>${lastWk}</em>.`);
    } else if (thisWk >= 4) {
        sentences.push(`<em>${thisWk}</em> sessions this week so far — <span class="good">strong rhythm</span>.`);
    } else if (thisWk >= 1) {
        const delta = thisWk - lastWk;
        if (delta > 0) {
            sentences.push(`<em>${thisWk}</em> sessions this week, up from <em>${lastWk}</em> last week.`);
        } else if (delta < 0) {
            sentences.push(`<em>${thisWk}</em> sessions this week — <em>${lastWk}</em> last week.`);
        } else {
            sentences.push(`<em>${thisWk}</em> sessions this week, same as last.`);
        }
    }

    // Wins
    const breakthroughs = wins.filter(w => w.type === 'breakthrough');
    if (breakthroughs.length === 1) {
        sentences.push(`<span class="good">${breakthroughs[0].exercise}</span> hit a new PR.`);
    } else if (breakthroughs.length === 2) {
        sentences.push(`<span class="good">${breakthroughs[0].exercise}</span> and <span class="good">${breakthroughs[1].exercise}</span> both hit new PRs.`);
    } else if (breakthroughs.length > 2) {
        const names = breakthroughs.slice(0, 2).map(b => `<span class="good">${b.exercise}</span>`).join(', ');
        sentences.push(`New PRs on ${names}, and ${breakthroughs.length - 2} more.`);
    }

    // Volume insight
    const volIns = wins.find(w => w.type === 'volume_up') || notes.find(w => w.type === 'volume_down');
    if (volIns) {
        const pct = volIns.text.match(/(\d+(?:\.\d+)?%)/);
        if (volIns.type === 'volume_up' && pct) {
            sentences.push(`Volume is <span class="good">up ${pct[1]}</span>.`);
        } else if (volIns.type === 'volume_down' && pct) {
            sentences.push(`Volume is <span class="warn">down ${pct[1]}</span>.`);
        }
    }

    // Concerns — neglected muscles
    const neglected = concerns.filter(n => n.type === 'neglected');
    neglected.push(...notes.filter(n => n.type === 'neglected'));
    if (neglected.length === 1) {
        sentences.push(`<span class="warn">${cap(neglected[0].category)}</span> hasn't been trained in ${neglected[0].days} days.`);
    } else if (neglected.length > 1) {
        const names = neglected.slice(0, 2).map(n => `<span class="warn">${cap(n.category)}</span>`).join(' and ');
        sentences.push(`${names} haven't been trained in over a week.`);
    }

    // Stalled
    const stalled = notes.filter(n => n.type === 'stalled');
    if (stalled.length === 1) {
        sentences.push(`<em>${stalled[0].exercise}</em> has plateaued — maybe change rep range or deload.`);
    } else if (stalled.length > 1) {
        const names = stalled.slice(0, 2).map(s => `<em>${s.exercise}</em>`).join(' and ');
        sentences.push(`${names} are both stalled.`);
    }

    if (sentences.length === 0) {
        el.innerHTML = '<em>Not enough data yet. Log a few more sessions and observations will show up here.</em>';
        return;
    }

    el.innerHTML = sentences.join(' ');
}

// =================== PRs ===================

function renderPRs() {
    const container = document.getElementById('pr-list');
    const prs = DATA.recent_prs || [];

    if (prs.length === 0) {
        container.innerHTML = '<li style="padding:0.75rem 0;font-family:var(--serif);color:var(--ink-dim);font-style:italic">No PRs yet. First one is coming.</li>';
        return;
    }

    container.innerHTML = prs.map((pr, i) => {
        const dateStr = fmtDateShort(pr.date);
        const repsStr = pr.reps ? `× ${pr.reps}` : '';
        return `
            <li class="pr-item" onclick="showExercise('${escapeJs(pr.exercise)}')">
                <span class="pr-rank">${String(i + 1).padStart(2, '0')}</span>
                <div class="pr-mid">
                    <span class="pr-name">${escapeHtml(pr.exercise)}</span>
                    <span class="pr-detail">${pr.weight} lb ${repsStr} · ${dateStr}</span>
                </div>
                <div class="pr-right">
                    <span class="pr-1rm">${pr.estimated_1rm}</span>
                    <span class="pr-gain">+${pr.gain} lb</span>
                </div>
            </li>
        `;
    }).join('');
}

// =================== HEATMAP ===================

function renderHeatmap() {
    const container = document.getElementById('heatmap');
    const monthsEl = document.getElementById('heatmap-months');
    const legendEl = document.getElementById('heatmap-legend');
    container.innerHTML = '';
    monthsEl.innerHTML = '';

    const sessionMap = {};
    (DATA.heatmap || []).forEach(d => { sessionMap[d.date] = d; });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDateStr = DATA.summary.first_date;
    if (!firstDateStr) return;

    let start = new Date(firstDateStr + 'T00:00:00');
    const startDow = start.getDay() === 0 ? 6 : start.getDay() - 1;
    start.setDate(start.getDate() - startDow);

    const weeks = [];
    const d = new Date(start);
    let currentWeek = [];
    const monthLabels = [];
    let lastMonthLabel = null;

    while (d <= today) {
        const dateStr = fmtLocal(d);
        const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;

        currentWeek.push({
            date: dateStr,
            dow,
            session: sessionMap[dateStr],
            isToday: d.getTime() === today.getTime(),
        });

        if (dow === 6) {
            weeks.push(currentWeek);
            const firstDay = new Date(currentWeek[0].date + 'T00:00:00');
            const monthName = firstDay.toLocaleDateString('en-US', { month: 'short' }).toLowerCase();
            if (monthName !== lastMonthLabel) {
                monthLabels.push({ weekIdx: weeks.length - 1, label: monthName });
                lastMonthLabel = monthName;
            }
            currentWeek = [];
        }

        d.setDate(d.getDate() + 1);
    }
    if (currentWeek.length) weeks.push(currentWeek);

    // Fill full available width like a real calendar grid.
    // Cells can be rectangular (wider than tall) when we have few weeks.
    const wrap = document.querySelector('.heatmap-wrap');
    const gridWrap = document.querySelector('.heatmap-grid-wrap');
    const available = (gridWrap ? gridWrap.clientWidth : 300) - 36; // minus day labels
    const totalWeeks = weeks.length;
    const gap = 4;
    // Width: fill the row completely, min 14
    let cellW = Math.floor((available - gap * (totalWeeks - 1)) / totalWeeks);
    cellW = Math.max(14, cellW);
    // Height: square-ish but capped so rows don't become absurd tall when few weeks
    // When viewport is wide and few weeks, let cells become rectangles (wider than tall)
    let cellH = Math.min(cellW, 40);
    cellH = Math.max(14, cellH);
    if (wrap) {
        wrap.style.setProperty('--hm-cell-w', cellW + 'px');
        wrap.style.setProperty('--hm-cell-h', cellH + 'px');
        wrap.style.setProperty('--hm-gap', gap + 'px');
    }

    const cellWidth = cellW + gap;
    monthLabels.forEach(ml => {
        const span = document.createElement('span');
        span.textContent = ml.label;
        span.style.position = 'absolute';
        span.style.left = (ml.weekIdx * cellWidth) + 'px';
        monthsEl.appendChild(span);
    });

    weeks.forEach(week => {
        for (let dow = 0; dow < 7; dow++) {
            const day = week.find(d => d.dow === dow);
            const cellEl = document.createElement('div');
            cellEl.className = 'heatmap-day';

            // Dim weekends by default (sat=5, sun=6 in our Mon-start mapping)
            if (dow === 5 || dow === 6) {
                cellEl.classList.add('weekend');
            }

            if (!day) {
                cellEl.style.visibility = 'hidden';
                container.appendChild(cellEl);
                continue;
            }

            if (day.session) {
                cellEl.classList.add('has-session');
                const muscles = day.session.muscles;
                if (muscles.length === 1) {
                    cellEl.style.background = MUSCLE_COLORS[muscles[0]] || MUSCLE_COLORS.other;
                } else if (muscles.length > 1) {
                    const colors = muscles.map(m => MUSCLE_COLORS[m] || MUSCLE_COLORS.other);
                    cellEl.style.background = `linear-gradient(135deg, ${colors.join(', ')})`;
                }

                const focus = day.session.focus || muscles.join(', ');
                const tip = document.createElement('div');
                tip.className = 'tooltip';
                tip.textContent = `${fmtDateShort(day.date)} · ${focus.toLowerCase()}`;
                cellEl.appendChild(tip);
            }

            if (day.isToday) cellEl.classList.add('today');

            container.appendChild(cellEl);
        }
    });

    // Legend
    const trainedMuscles = new Set();
    (DATA.heatmap || []).forEach(d => d.muscles.forEach(m => trainedMuscles.add(m)));
    legendEl.innerHTML = [...trainedMuscles].sort().map(m => `
        <span class="legend-item">
            <span class="legend-dot" style="background:${MUSCLE_COLORS[m] || MUSCLE_COLORS.other}"></span>
            ${m}
        </span>
    `).join('');

    document.getElementById('tracking-days').textContent = `${DATA.summary.days_tracking} days`;
}

// =================== MUSCLE BARS (replaces stacked bar chart) ===================

function renderMuscleBars() {
    const container = document.getElementById('muscle-bars');
    const mv = DATA.muscle_volume || { weeks: [], categories: [], data: [] };

    if (mv.weeks.length === 0) {
        container.innerHTML = '<div style="font-family:var(--serif);color:var(--ink-dim);font-style:italic">No data yet.</div>';
        return;
    }

    // Compute last 4 weeks average volume per category
    const recentWeeks = mv.data.slice(-4);
    const catTotals = {};
    mv.categories.forEach(cat => {
        catTotals[cat] = recentWeeks.reduce((sum, w) => sum + (w[cat] || 0), 0);
    });

    // Days since last trained per category
    const daysSince = {};
    (DATA.heatmap || []).forEach(d => {
        d.muscles.forEach(m => {
            if (daysSince[m] === undefined || d.date > daysSince[m]) {
                daysSince[m] = d.date;
            }
        });
    });

    // Build rows, sort by volume descending. Exclude cardio (no weight volume).
    const rows = mv.categories
        .filter(cat => cat !== 'cardio' && cat !== 'other')
        .map(cat => {
            const vol = catTotals[cat];
            const lastDate = daysSince[cat];
            const daysAgo = lastDate
                ? Math.floor((new Date() - new Date(lastDate + 'T00:00:00')) / 86400000)
                : null;
            return { cat, vol, daysAgo };
        })
        .sort((a, b) => b.vol - a.vol);

    const maxVol = Math.max(...rows.map(r => r.vol), 1);

    container.innerHTML = rows.map(r => {
        const pct = (r.vol / maxVol) * 100;
        const daysStr = r.daysAgo === null ? 'never'
            : r.daysAgo === 0 ? 'today'
            : r.daysAgo === 1 ? '1d ago'
            : `${r.daysAgo}d ago`;
        const isStale = r.daysAgo !== null && r.daysAgo >= 10;
        return `
            <div class="muscle-bar-row">
                <div class="muscle-bar-label">${r.cat}</div>
                <div class="muscle-bar-track">
                    <div class="muscle-bar-fill" style="width:${pct}%; background:${MUSCLE_COLORS[r.cat] || MUSCLE_COLORS.other}; opacity:${isStale ? 0.5 : 1}"></div>
                </div>
                <div>
                    <div class="muscle-bar-value">${fmtK(r.vol)}</div>
                    <div class="muscle-bar-days">${daysStr}</div>
                </div>
            </div>
        `;
    }).join('');
}

// =================== CONSISTENCY (sessions + volume overlay) ===================

function renderConsistency() {
    const ctx = document.getElementById('consistency-chart').getContext('2d');
    const trend = DATA.consistency_trend || [];
    const weekly = DATA.weekly_summary || [];

    // Map weekly volume by week
    const volByWeek = {};
    weekly.forEach(w => { volByWeek[w.week] = w.volume / 1000; });

    const labels = trend.map(t => {
        const d = new Date(t.week + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase();
    });

    const chart = new Chart(ctx, {
        data: {
            labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'sessions',
                    data: trend.map(t => t.sessions),
                    backgroundColor: ACCENT + '99',
                    borderColor: ACCENT,
                    borderWidth: 0,
                    borderRadius: 3,
                    maxBarThickness: 18,
                    yAxisID: 'y',
                    order: 2,
                },
                {
                    type: 'line',
                    label: 'volume (k lb)',
                    data: trend.map(t => volByWeek[t.week] || 0),
                    borderColor: POS,
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: POS,
                    pointBorderColor: '#0D100F',
                    pointBorderWidth: 1,
                    tension: 0.3,
                    fill: false,
                    yAxisID: 'y1',
                    order: 1,
                },
            ],
        },
        options: {
            ...CHART_DEFAULTS,
            scales: {
                x: CHART_DEFAULTS.scales.x,
                y: {
                    ...CHART_DEFAULTS.scales.y,
                    position: 'left',
                    beginAtZero: true,
                    ticks: {
                        ...CHART_DEFAULTS.scales.y.ticks,
                        stepSize: 1,
                        precision: 0,
                        color: ACCENT,
                    },
                },
                y1: {
                    ...CHART_DEFAULTS.scales.y,
                    position: 'right',
                    beginAtZero: true,
                    grid: { drawOnChartArea: false, color: 'transparent' },
                    ticks: {
                        ...CHART_DEFAULTS.scales.y.ticks,
                        color: POS,
                        callback: v => v.toFixed(1) + 'k',
                    },
                },
            },
            plugins: {
                ...CHART_DEFAULTS.plugins,
                tooltip: {
                    ...CHART_DEFAULTS.plugins.tooltip,
                    callbacks: {
                        label: c => {
                            if (c.dataset.type === 'line') return `${c.raw.toFixed(1)}k lb volume`;
                            return `${c.raw} session${c.raw === 1 ? '' : 's'}`;
                        },
                    },
                },
            },
        },
    });
    activeCharts.push(chart);
}

// =================== EXERCISES TABLE ===================

function renderExercises() {
    const filterEl = document.getElementById('cat-filter');
    const container = document.getElementById('ex-table');
    const countEl = document.getElementById('exercise-count');

    const groups = DATA.exercises_by_category || [];
    const totalEx = groups.reduce((acc, g) => acc + g.total, 0);
    countEl.textContent = `${totalEx} total`;

    const chips = [{ category: 'all' }, ...groups];
    filterEl.innerHTML = chips.map(g => `
        <button class="cat-chip ${g.category === currentCategoryFilter ? 'active' : ''}"
                onclick="setCategoryFilter('${g.category}')">${g.category === 'all' ? 'all' : g.category}</button>
    `).join('');

    const filteredGroups = currentCategoryFilter === 'all'
        ? groups
        : groups.filter(g => g.category === currentCategoryFilter);

    container.innerHTML = filteredGroups.map(group => `
        <div class="ex-cat-group">
            ${currentCategoryFilter === 'all' ? `<div class="ex-cat-title">${group.category}</div>` : ''}
            ${group.exercises.map(ex => renderExerciseRow(ex)).join('')}
        </div>
    `).join('');
}

function renderExerciseRow(ex) {
    const daysText = ex.days_since === null ? 'never'
        : ex.days_since === 0 ? 'today'
        : ex.days_since === 1 ? '1d ago'
        : `${ex.days_since}d ago`;

    const isCardio = !ex.current_max_weight || ex.current_max_weight === 0;
    const displayValue = ex.current_1rm || ex.current_max_weight || 0;

    const trendLabel = ex.trend === 'pr' ? '· pr'
        : ex.trend === 'progressing' ? '· up'
        : ex.trend === 'stalled' ? '· stalled'
        : ex.trend === 'plateau' ? '· flat'
        : ex.trend === 'regressing' ? '· down'
        : ex.trend === 'new' ? '· new'
        : '';

    const rightContent = isCardio
        ? `<div class="ex-value-sub" style="font-family:var(--mono);text-transform:lowercase">cardio</div>`
        : `<div class="ex-value">${displayValue || '—'}</div>
           <div class="ex-value-sub">${displayValue ? 'lb est. 1rm' : ''}${ex.progress_pct ? ` · ${ex.progress_pct > 0 ? '+' : ''}${ex.progress_pct}%` : ''}</div>`;

    return `
        <div class="ex-row" onclick="showExercise('${escapeJs(ex.name)}')">
            <div>
                <div class="ex-name">
                    ${escapeHtml(ex.name)}
                    ${!isCardio && trendLabel ? `<span class="ex-trend ${ex.trend}">${trendLabel}</span>` : ''}
                </div>
                <div class="ex-meta">${ex.total_sessions}× · ${daysText}</div>
            </div>
            <div class="ex-right">
                ${rightContent}
            </div>
        </div>
    `;
}

function setCategoryFilter(cat) {
    currentCategoryFilter = cat;
    renderExercises();
}

// =================== FOOTER ===================

function renderFooter() {
    const dt = new Date(DATA.summary.generated_at);
    document.getElementById('last-updated').textContent = dt.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }).toLowerCase();

    if (DATA.summary.first_date) {
        document.getElementById('tracking-since').textContent = new Date(DATA.summary.first_date + 'T00:00:00')
            .toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toLowerCase();
    }
}

// =================== EXERCISE DEEP DIVE ===================

function showExercise(name) {
    const ex = DATA.exercises[name];
    if (!ex) return;

    document.getElementById('dashboard-view').style.display = 'none';
    document.getElementById('exercise-view').style.display = 'block';

    document.getElementById('ex-title').textContent = name.toLowerCase();
    document.getElementById('ex-1rm').textContent = fmtHumanLarge(ex.current_1rm || ex.current_max_weight || 0);

    const progressEl = document.getElementById('ex-progress');
    const pct = ex.progress_pct || 0;
    if (pct > 0) {
        progressEl.textContent = `+${pct}% since start`;
        progressEl.className = 'delta pos';
    } else if (pct < 0) {
        progressEl.textContent = `${pct}% since start`;
        progressEl.className = 'delta neg';
    } else {
        progressEl.textContent = ex.trend === 'new' ? 'new exercise' : 'no change yet';
        progressEl.className = 'delta flat';
    }

    const trendMeta = {
        pr: 'just peaked',
        progressing: 'progressing',
        stalled: 'stalled',
        plateau: 'plateau',
        regressing: 'declining',
        new: 'new',
    };
    document.getElementById('ex-trend-meta').textContent = trendMeta[ex.trend] || ex.trend;

    document.getElementById('ex-max').textContent = ex.current_max_weight || '—';
    document.getElementById('ex-sessions-count').textContent = ex.total_sessions;

    const daysText = ex.days_since === null ? '—'
        : ex.days_since === 0 ? 'today'
        : ex.days_since === 1 ? '1d ago'
        : `${ex.days_since}d ago`;
    document.getElementById('ex-last').textContent = daysText;

    // Destroy existing charts
    activeCharts.forEach(c => { try { c.destroy(); } catch(e){} });
    activeCharts = [];

    window.scrollTo(0, 0);
    render1RMChart(ex);
    renderExerciseVolume(ex);
    renderSetLog(ex);
}

function showDashboard() {
    document.getElementById('exercise-view').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'block';
    activeCharts.forEach(c => { try { c.destroy(); } catch(e){} });
    activeCharts = [];
    window.scrollTo(0, 0);
    renderAll();
}

function render1RMChart(ex) {
    const ctx = document.getElementById('weight-chart').getContext('2d');
    const labels = ex.sessions.map(s => new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase());

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'est 1rm',
                    data: ex.sessions.map(s => s.estimated_1rm),
                    borderColor: ACCENT,
                    backgroundColor: 'rgba(232, 168, 124, 0.08)',
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: ACCENT,
                    pointBorderColor: '#0D100F',
                    pointBorderWidth: 2,
                    tension: 0.25,
                    fill: true,
                },
                {
                    label: 'max weight',
                    data: ex.sessions.map(s => s.max_weight),
                    borderColor: '#C9B8A0',
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    borderDash: [3, 3],
                    pointRadius: 2.5,
                    pointBackgroundColor: '#C9B8A0',
                    pointBorderColor: '#0D100F',
                    pointBorderWidth: 1,
                    tension: 0.25,
                    fill: false,
                },
            ],
        },
        options: {
            ...CHART_DEFAULTS,
            plugins: {
                ...CHART_DEFAULTS.plugins,
                tooltip: {
                    ...CHART_DEFAULTS.plugins.tooltip,
                    callbacks: {
                        label: c => `${c.dataset.label}: ${c.raw} lb`,
                    },
                },
            },
        },
    });
    activeCharts.push(chart);
}

function renderExerciseVolume(ex) {
    const ctx = document.getElementById('exercise-volume-chart').getContext('2d');

    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ex.sessions.map(s => new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase()),
            datasets: [{
                data: ex.sessions.map(s => s.total_volume),
                backgroundColor: POS + 'AA',
                borderWidth: 0,
                borderRadius: 3,
                maxBarThickness: 28,
            }],
        },
        options: {
            ...CHART_DEFAULTS,
            scales: {
                ...CHART_DEFAULTS.scales,
                y: {
                    ...CHART_DEFAULTS.scales.y,
                    beginAtZero: true,
                    ticks: {
                        ...CHART_DEFAULTS.scales.y.ticks,
                        callback: v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v,
                    },
                },
            },
            plugins: {
                ...CHART_DEFAULTS.plugins,
                tooltip: {
                    ...CHART_DEFAULTS.plugins.tooltip,
                    callbacks: {
                        label: c => `${c.raw.toLocaleString()} lb total`,
                        afterLabel: c => {
                            const s = ex.sessions[c.dataIndex];
                            return `${s.num_sets} sets · ${s.total_reps} reps`;
                        },
                    },
                },
            },
        },
    });
    activeCharts.push(chart);
}

function renderSetLog(ex) {
    const container = document.getElementById('set-log');
    container.innerHTML = '';

    const sessions = [...ex.sessions].reverse();

    sessions.forEach(session => {
        const dateStr = new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric',
        }).toLowerCase();

        let html = `
            <div class="set-log-session">
                <div class="set-log-head">
                    <span class="set-log-date">${dateStr}</span>
                    <span class="set-log-meta">${session.max_weight || '—'} lb max · ${fmtK(session.total_volume)} vol</span>
                </div>
                <div class="set-log-table">
                    <div class="set-log-th">#</div>
                    <div class="set-log-th">weight</div>
                    <div class="set-log-th">reps</div>
                    <div class="set-log-th">1rm</div>
        `;

        session.sets.forEach(set => {
            const weight = set.weight;
            const reps = set.reps;
            const est1rm = weight && reps ? Math.round(weight * (1 + reps / 30) * 10) / 10 : null;
            html += `
                <div class="set-log-td dim">${set.set_number}${set.is_dropset ? '·' : ''}</div>
                <div class="set-log-td">${weight ? `${weight}` : (set.duration_sec ? `${Math.round(set.duration_sec / 60)}m` : '—')}</div>
                <div class="set-log-td">${reps || (set.distance_km ? `${set.distance_km}km` : '—')}</div>
                <div class="set-log-td dim">${est1rm ? est1rm : '—'}</div>
            `;
        });

        html += '</div></div>';
        container.innerHTML += html;
    });
}

// =================== UTILS ===================

function fmtHumanLarge(n) {
    // Lead number: prefer "21,155" over "21.2k" for volume context
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 10000) return Math.round(n / 100) / 10 + 'k';
    if (n >= 1000) return n.toLocaleString();
    return n.toString();
}

function fmtK(n) {
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toLocaleString();
}

function fmtDateShort(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric',
    }).toLowerCase();
}

function fmtLocal(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

function escapeJs(s) {
    return String(s).replace(/'/g, "\\'").replace(/"/g, '\\"');
}

window.showExercise = showExercise;
window.showDashboard = showDashboard;
window.setCategoryFilter = setCategoryFilter;

// Re-render heatmap on resize (cells adapt to available width)
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (DATA && document.getElementById('dashboard-view').style.display !== 'none') {
            renderHeatmap();
        }
    }, 150);
});

loadData();
