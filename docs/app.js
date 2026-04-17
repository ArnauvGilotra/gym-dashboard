// Gym Dashboard v2 — Opus 4.7 rewrite
let DATA = null;
let activeCharts = [];
let currentCategoryFilter = 'all';

const MUSCLE_COLORS = {
    back: '#6c5ce7',
    legs: '#00d2a0',
    chest: '#ff6b6b',
    arms: '#ffd700',
    biceps: '#ffa502',
    triceps: '#ff7675',
    shoulders: '#4ecdc4',
    cardio: '#a29bfe',
    core: '#fd79a8',
    other: '#636e72',
};

const TREND_META = {
    pr:          { icon: '🏆', label: 'PR', emoji: '🔥' },
    progressing: { icon: '📈', label: 'Progressing' },
    stalled:     { icon: '⚠️',  label: 'Stalled' },
    plateau:     { icon: '➖', label: 'Plateau' },
    regressing:  { icon: '↘️',  label: 'Regressing' },
    new:         { icon: '✨', label: 'New' },
};

const INSIGHT_ICONS = {
    neglected:    '⏰',
    stalled:      '⚠️',
    breakthrough: '🔥',
    volume_up:    '📈',
    volume_down:  '📉',
    consistency:  '💪',
    dropoff:      '🚨',
};

const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { display: false },
        tooltip: {
            backgroundColor: '#0a0a0f',
            titleColor: '#e8e8f0',
            bodyColor: '#e8e8f0',
            borderColor: '#2a2a40',
            borderWidth: 1,
            cornerRadius: 8,
            padding: 10,
            titleFont: { family: 'Inter', weight: '700', size: 12 },
            bodyFont: { family: 'Inter', size: 11 },
        },
    },
    scales: {
        x: {
            grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
            ticks: {
                color: '#555570',
                font: { family: 'Inter', size: 10 },
                maxRotation: 0,
                autoSkip: true,
                maxTicksLimit: 8,
            },
        },
        y: {
            grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
            ticks: {
                color: '#555570',
                font: { family: 'Inter', size: 10 },
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
        console.error('Failed to load data:', e);
    }
}

function renderAll() {
    renderHero();
    renderInsights();
    renderPRs();
    renderHeatmap();
    renderConsistency();
    renderMuscleVolume();
    renderVolumeChart();
    renderExercisesByCategory();
    renderFooter();
}

// =================== HERO ===================

function renderHero() {
    const s = DATA.summary;
    const c = DATA.comparisons;

    // Date
    const now = new Date();
    document.getElementById('hero-date').textContent = now.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
    });

    // Streak
    document.getElementById('hero-streak').textContent = s.streak_weeks;
    const streakSub = s.longest_streak > s.streak_weeks
        ? `longest: ${s.longest_streak}w`
        : s.streak_weeks > 0 ? 'your best yet!' : 'start this week';
    document.getElementById('streak-sub').textContent = streakSub;

    // This week
    document.getElementById('hero-this-week').textContent = c.this_week.sessions;
    document.getElementById('hero-volume').textContent = fmtK(c.this_week.volume);
    document.getElementById('hero-total').textContent = s.total_sessions;

    // Deltas
    const sessionsDelta = c.sessions_wow_delta;
    const sdEl = document.getElementById('hero-sessions-delta');
    if (sessionsDelta > 0) {
        sdEl.textContent = `+${sessionsDelta} vs last`;
        sdEl.className = 'hero-stat-delta up';
    } else if (sessionsDelta < 0) {
        sdEl.textContent = `${sessionsDelta} vs last`;
        sdEl.className = 'hero-stat-delta down';
    } else {
        sdEl.textContent = 'same as last';
        sdEl.className = 'hero-stat-delta flat';
    }

    const volPct = c.volume_wow_pct;
    const vdEl = document.getElementById('hero-volume-delta');
    if (volPct !== null && volPct !== undefined) {
        if (volPct > 0) {
            vdEl.textContent = `+${volPct}%`;
            vdEl.className = 'hero-stat-delta up';
        } else if (volPct < 0) {
            vdEl.textContent = `${volPct}%`;
            vdEl.className = 'hero-stat-delta down';
        } else {
            vdEl.textContent = 'flat';
            vdEl.className = 'hero-stat-delta flat';
        }
    } else {
        vdEl.textContent = '';
    }
}

// =================== INSIGHTS ===================

function renderInsights() {
    const container = document.getElementById('insights-list');
    const countEl = document.getElementById('insights-count');
    const insights = DATA.insights || [];

    const hasAlerts = insights.some(i => i.severity === 'high' || i.severity === 'medium');
    countEl.textContent = insights.length === 0 ? 'all clear'
        : hasAlerts ? `${insights.length} to note`
        : `${insights.length} • all good`;

    if (insights.length === 0) {
        container.innerHTML = '<div class="insight-empty">✨ No alerts. Everything tracking smoothly.</div>';
        return;
    }

    container.innerHTML = insights.map(i => `
        <div class="insight-item severity-${i.severity}">
            <span class="insight-icon">${INSIGHT_ICONS[i.type] || '•'}</span>
            <span class="insight-text">${escapeHtml(i.text)}</span>
        </div>
    `).join('');
}

// =================== PRs ===================

function renderPRs() {
    const container = document.getElementById('pr-list');
    const prs = DATA.recent_prs || [];

    if (prs.length === 0) {
        container.innerHTML = '<div class="insight-empty">No PRs logged yet — get after it.</div>';
        return;
    }

    container.innerHTML = prs.map(pr => {
        const dateStr = fmtDate(pr.date);
        const repsStr = pr.reps ? `× ${pr.reps}` : '';
        return `
            <div class="pr-item" onclick="showExercise('${escapeJs(pr.exercise)}')">
                <div class="pr-exercise">${escapeHtml(pr.exercise)}</div>
                <div class="pr-1rm">${pr.estimated_1rm} lb</div>
                <div class="pr-detail">${dateStr} · ${pr.weight} lb ${repsStr}</div>
                <div class="pr-gain">+${pr.gain} lb</div>
            </div>
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

    // Build map from date -> session info
    const sessionMap = {};
    (DATA.heatmap || []).forEach(d => { sessionMap[d.date] = d; });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find earliest tracked date
    const firstDateStr = DATA.summary.first_date;
    if (!firstDateStr) return;

    let start = new Date(firstDateStr + 'T00:00:00');
    // Round to Monday of that week
    const startDow = start.getDay() === 0 ? 6 : start.getDay() - 1;
    start.setDate(start.getDate() - startDow);

    // Build data: array of weeks, each week is 7 days
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
            isFuture: d > today,
            isToday: d.getTime() === today.getTime(),
        });

        if (dow === 6) {
            weeks.push(currentWeek);
            // Record month label for first day of each week at start of month
            const monthName = currentWeek[0] ? new Date(currentWeek[0].date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' }) : '';
            if (monthName !== lastMonthLabel) {
                monthLabels.push({ weekIdx: weeks.length - 1, label: monthName });
                lastMonthLabel = monthName;
            }
            currentWeek = [];
        }

        d.setDate(d.getDate() + 1);
    }
    if (currentWeek.length) weeks.push(currentWeek);

    // Render month labels
    const cellWidth = 16; // 14px + 2px gap
    monthsEl.style.position = 'relative';
    monthsEl.style.height = '14px';
    monthsEl.style.display = 'block';
    monthsEl.style.minWidth = (weeks.length * cellWidth) + 'px';
    monthLabels.forEach(ml => {
        const span = document.createElement('span');
        span.textContent = ml.label;
        span.style.position = 'absolute';
        span.style.left = (ml.weekIdx * cellWidth) + 'px';
        monthsEl.appendChild(span);
    });

    // Render days: column-major, 7 rows
    weeks.forEach(week => {
        for (let dow = 0; dow < 7; dow++) {
            const day = week.find(d => d.dow === dow);
            const cell = document.createElement('div');
            cell.className = 'heatmap-day';

            if (!day) {
                cell.style.visibility = 'hidden';
                container.appendChild(cell);
                continue;
            }

            if (day.isFuture) {
                cell.style.visibility = 'hidden';
                container.appendChild(cell);
                continue;
            }

            if (day.session) {
                cell.classList.add('has-session');
                const muscles = day.session.muscles;
                if (muscles.length === 1) {
                    cell.style.background = MUSCLE_COLORS[muscles[0]] || MUSCLE_COLORS.other;
                } else if (muscles.length > 1) {
                    const colors = muscles.map(m => MUSCLE_COLORS[m] || MUSCLE_COLORS.other);
                    cell.style.background = `linear-gradient(135deg, ${colors.join(', ')})`;
                }

                const focus = day.session.focus || muscles.join(', ');
                const tip = document.createElement('div');
                tip.className = 'tooltip';
                tip.textContent = `${fmtDate(day.date)} — ${focus}`;
                cell.appendChild(tip);
            }

            if (day.isToday) cell.classList.add('today');

            container.appendChild(cell);
        }
    });

    // Build legend from unique muscles actually trained
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

// =================== CONSISTENCY ===================

function renderConsistency() {
    const ctx = document.getElementById('consistency-chart').getContext('2d');
    const trend = DATA.consistency_trend || [];

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trend.map(t => {
                const d = new Date(t.week + 'T00:00:00');
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }),
            datasets: [{
                data: trend.map(t => t.sessions),
                borderColor: MUSCLE_COLORS.back,
                backgroundColor: 'rgba(108, 92, 231, 0.12)',
                borderWidth: 2.5,
                pointRadius: 3.5,
                pointBackgroundColor: MUSCLE_COLORS.back,
                pointBorderColor: '#0a0a0f',
                pointBorderWidth: 1.5,
                tension: 0.35,
                fill: true,
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
                        stepSize: 1,
                        precision: 0,
                    },
                },
            },
            plugins: {
                ...CHART_DEFAULTS.plugins,
                tooltip: {
                    ...CHART_DEFAULTS.plugins.tooltip,
                    callbacks: {
                        label: c => `${c.raw} session${c.raw === 1 ? '' : 's'}`,
                    },
                },
            },
        },
    });
    activeCharts.push(chart);
}

// =================== MUSCLE VOLUME (stacked) ===================

function renderMuscleVolume() {
    const ctx = document.getElementById('muscle-volume-chart').getContext('2d');
    const mv = DATA.muscle_volume || { weeks: [], categories: [], data: [] };

    const datasets = mv.categories.map(cat => ({
        label: cat,
        data: mv.data.map(row => row[cat] || 0),
        backgroundColor: MUSCLE_COLORS[cat] || MUSCLE_COLORS.other,
        borderRadius: 4,
        stack: 'muscles',
    }));

    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: mv.weeks.map(w => {
                const d = new Date(w + 'T00:00:00');
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }),
            datasets,
        },
        options: {
            ...CHART_DEFAULTS,
            scales: {
                x: { ...CHART_DEFAULTS.scales.x, stacked: true },
                y: {
                    ...CHART_DEFAULTS.scales.y,
                    stacked: true,
                    beginAtZero: true,
                    ticks: {
                        ...CHART_DEFAULTS.scales.y.ticks,
                        callback: v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v,
                    },
                },
            },
            plugins: {
                ...CHART_DEFAULTS.plugins,
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        color: '#8888a0',
                        font: { family: 'Inter', size: 10, weight: '600' },
                        padding: 8,
                        usePointStyle: true,
                        pointStyle: 'rectRounded',
                        boxWidth: 10,
                        boxHeight: 10,
                    },
                },
                tooltip: {
                    ...CHART_DEFAULTS.plugins.tooltip,
                    callbacks: {
                        label: c => `${c.dataset.label}: ${c.raw.toLocaleString()} lb`,
                    },
                },
            },
        },
    });
    activeCharts.push(chart);
}

// =================== WEEKLY VOLUME ===================

function renderVolumeChart() {
    const ctx = document.getElementById('volume-chart').getContext('2d');
    const vol = DATA.weekly_summary || [];

    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: vol.map(v => {
                const d = new Date(v.week + 'T00:00:00');
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }),
            datasets: [{
                data: vol.map(v => v.volume),
                backgroundColor: 'rgba(108, 92, 231, 0.65)',
                borderColor: MUSCLE_COLORS.back,
                borderWidth: 0,
                borderRadius: 6,
                maxBarThickness: 32,
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
                        callback: v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v,
                    },
                },
            },
            plugins: {
                ...CHART_DEFAULTS.plugins,
                tooltip: {
                    ...CHART_DEFAULTS.plugins.tooltip,
                    callbacks: {
                        label: c => `${c.raw.toLocaleString()} lb`,
                        afterLabel: c => {
                            const v = vol[c.dataIndex];
                            return `${v.sessions} session${v.sessions === 1 ? '' : 's'}, ${v.sets} sets`;
                        },
                    },
                },
            },
        },
    });
    activeCharts.push(chart);
}

// =================== EXERCISES BY CATEGORY ===================

function renderExercisesByCategory() {
    const filterEl = document.getElementById('category-filter');
    const container = document.getElementById('category-exercises');
    const countEl = document.getElementById('exercise-count');

    const groups = DATA.exercises_by_category || [];
    const totalEx = groups.reduce((acc, g) => acc + g.total, 0);
    countEl.textContent = `${totalEx} exercises`;

    // Build category chips
    const allChip = { category: 'all', total: totalEx };
    const chips = [allChip, ...groups];
    filterEl.innerHTML = chips.map(g => `
        <button class="category-chip ${g.category === currentCategoryFilter ? 'active' : ''}"
                onclick="setCategoryFilter('${g.category}')">
            ${g.category === 'all' ? 'All' : capitalize(g.category)}
        </button>
    `).join('');

    // Render groups (filtered)
    const filteredGroups = currentCategoryFilter === 'all'
        ? groups
        : groups.filter(g => g.category === currentCategoryFilter);

    container.innerHTML = filteredGroups.map(group => `
        <div class="category-group">
            ${currentCategoryFilter === 'all' ? `<div class="category-title">${capitalize(group.category)}</div>` : ''}
            ${group.exercises.map(ex => renderExerciseRow(ex)).join('')}
        </div>
    `).join('');
}

function renderExerciseRow(ex) {
    const trend = TREND_META[ex.trend] || TREND_META.new;
    const daysText = ex.days_since === null ? 'never'
        : ex.days_since === 0 ? 'today'
        : ex.days_since === 1 ? '1d ago'
        : `${ex.days_since}d ago`;

    const isCardio = ex.equipment === 'machine' && !ex.current_max_weight;
    const displayValue = ex.current_1rm || ex.current_max_weight || 0;
    const showBadge = !isCardio; // cardio doesn't really have trends the same way

    const rightContent = isCardio
        ? `<div class="exercise-row-value" style="font-size:0.75rem;color:var(--text-dim);font-weight:500">cardio</div>`
        : `<div class="exercise-row-value">${displayValue || '—'}${displayValue ? ' lb' : ''}</div>
           <div class="exercise-row-sub">${ex.progress_pct > 0 ? '+' : ''}${ex.progress_pct}%</div>`;

    return `
        <div class="exercise-row" onclick="showExercise('${escapeJs(ex.name)}')">
            <div>
                <div class="exercise-row-name">
                    ${escapeHtml(ex.name)}
                    ${showBadge ? `<span class="trend-badge ${ex.trend}">${trend.icon} ${trend.label}</span>` : ''}
                </div>
                <div class="exercise-row-meta">
                    ${ex.total_sessions} session${ex.total_sessions === 1 ? '' : 's'} · ${daysText}
                </div>
            </div>
            <div class="exercise-row-right">
                ${rightContent}
            </div>
        </div>
    `;
}

function setCategoryFilter(cat) {
    currentCategoryFilter = cat;
    renderExercisesByCategory();
}

// =================== FOOTER ===================

function renderFooter() {
    const dt = new Date(DATA.summary.generated_at);
    document.getElementById('last-updated').textContent = dt.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
}

// =================== EXERCISE DEEP DIVE ===================

function showExercise(name) {
    const ex = DATA.exercises[name];
    if (!ex) return;

    document.getElementById('dashboard-view').style.display = 'none';
    document.getElementById('exercise-view').style.display = 'block';
    document.getElementById('exercise-title').textContent = name;

    const trend = TREND_META[ex.trend] || TREND_META.new;
    const daysText = ex.days_since === null ? 'never'
        : ex.days_since === 0 ? 'today'
        : ex.days_since === 1 ? '1 day ago'
        : `${ex.days_since} days ago`;

    document.getElementById('exercise-meta').textContent =
        `${ex.total_sessions} session${ex.total_sessions === 1 ? '' : 's'} · ${trend.icon} ${trend.label} · last ${daysText}`;

    document.getElementById('ex-current-1rm').textContent = `${ex.current_1rm || 0}`;
    document.getElementById('ex-max-weight').textContent = `${ex.current_max_weight || 0}`;
    const pctEl = document.getElementById('ex-progress');
    pctEl.textContent = `${ex.progress_pct > 0 ? '+' : ''}${ex.progress_pct}%`;
    pctEl.style.color = ex.progress_pct > 0 ? 'var(--green)' : ex.progress_pct < 0 ? 'var(--red)' : 'var(--accent)';

    // Destroy existing deep-dive charts
    activeCharts.forEach(c => { try { c.destroy(); } catch(e){} });
    activeCharts = [];

    window.scrollTo(0, 0);
    render1RMChart(name, ex);
    renderExerciseVolume(name, ex);
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

function render1RMChart(name, ex) {
    const ctx = document.getElementById('weight-chart').getContext('2d');
    const labels = ex.sessions.map(s => new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Est. 1RM',
                    data: ex.sessions.map(s => s.estimated_1rm),
                    borderColor: MUSCLE_COLORS.back,
                    backgroundColor: 'rgba(108, 92, 231, 0.15)',
                    borderWidth: 3,
                    pointRadius: 4,
                    pointBackgroundColor: MUSCLE_COLORS.back,
                    pointBorderColor: '#0a0a0f',
                    pointBorderWidth: 2,
                    tension: 0.25,
                    fill: true,
                },
                {
                    label: 'Max Weight',
                    data: ex.sessions.map(s => s.max_weight),
                    borderColor: '#ffd700',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [4, 4],
                    pointRadius: 3,
                    pointBackgroundColor: '#ffd700',
                    pointBorderColor: '#0a0a0f',
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
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        color: '#8888a0',
                        font: { family: 'Inter', size: 10, weight: '600' },
                        padding: 10,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        boxWidth: 8,
                    },
                },
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

function renderExerciseVolume(name, ex) {
    const ctx = document.getElementById('exercise-volume-chart').getContext('2d');

    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ex.sessions.map(s => new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
            datasets: [{
                data: ex.sessions.map(s => s.total_volume),
                backgroundColor: 'rgba(0, 210, 160, 0.55)',
                borderColor: MUSCLE_COLORS.legs,
                borderWidth: 0,
                borderRadius: 6,
                maxBarThickness: 40,
            }],
        },
        options: {
            ...CHART_DEFAULTS,
            scales: {
                ...CHART_DEFAULTS.scales,
                y: { ...CHART_DEFAULTS.scales.y, beginAtZero: true },
            },
            plugins: {
                ...CHART_DEFAULTS.plugins,
                tooltip: {
                    ...CHART_DEFAULTS.plugins.tooltip,
                    callbacks: {
                        label: c => `${c.raw.toLocaleString()} lb total`,
                        afterLabel: c => {
                            const s = ex.sessions[c.dataIndex];
                            return `${s.num_sets} sets, ${s.total_reps} reps`;
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
            weekday: 'short', month: 'short', day: 'numeric',
        });

        let html = `
            <div class="set-log-session">
                <div class="set-log-date">
                    <span>${dateStr}</span>
                    <span class="set-log-session-meta">Max ${session.max_weight || '—'} lb · ${session.total_volume.toLocaleString()} lb vol</span>
                </div>
                <div class="set-log-table">
                    <div class="set-log-header">#</div>
                    <div class="set-log-header">Weight</div>
                    <div class="set-log-header">Reps</div>
                    <div class="set-log-header">Est. 1RM</div>
        `;

        session.sets.forEach(set => {
            const weight = set.weight;
            const reps = set.reps;
            const est1rm = weight && reps ? Math.round(weight * (1 + reps / 30) * 10) / 10 : null;
            html += `
                <div class="set-log-set-num">${set.set_number}${set.is_dropset ? '·' : ''}</div>
                <div class="set-log-val">${weight ? `${weight} lb` : (set.duration_sec ? `${Math.round(set.duration_sec / 60)} min` : '—')}</div>
                <div class="set-log-val">${reps || (set.distance_km ? `${set.distance_km} km` : '—')}</div>
                <div class="set-log-val">${est1rm ? est1rm + ' lb' : '—'}</div>
            `;
        });

        html += '</div></div>';
        container.innerHTML += html;
    });
}

// =================== UTILS ===================

function fmtK(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toLocaleString();
}

function fmtDate(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric',
    });
}

function fmtLocal(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function capitalize(s) {
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

// Expose for inline handlers
window.showExercise = showExercise;
window.showDashboard = showDashboard;
window.setCategoryFilter = setCategoryFilter;

// Boot
loadData();
