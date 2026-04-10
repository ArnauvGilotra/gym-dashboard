// Gym Dashboard App
let DATA = null;
let sparklineCharts = [];
let activeCharts = [];

const MUSCLE_COLORS = {
    back: '#6c5ce7',
    legs: '#00d2a0',
    chest: '#ff6b6b',
    arms: '#ffd700',
    shoulders: '#4ecdc4',
    biceps: '#ffa502',
    triceps: '#ff7675',
    cardio: '#a29bfe',
    core: '#fd79a8',
    other: '#636e72'
};

const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { display: false },
        tooltip: {
            backgroundColor: '#222240',
            titleColor: '#e8e8f0',
            bodyColor: '#e8e8f0',
            borderColor: '#1e1e30',
            borderWidth: 1,
            cornerRadius: 10,
            padding: 10,
            titleFont: { family: 'Inter', weight: '600' },
            bodyFont: { family: 'Inter' }
        }
    },
    scales: {
        x: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: { color: '#555570', font: { family: 'Inter', size: 11 } }
        },
        y: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: { color: '#555570', font: { family: 'Inter', size: 11 } }
        }
    }
};

async function loadData() {
    const resp = await fetch('data/gym-data.json');
    DATA = await resp.json();
    renderDashboard();
}

function renderDashboard() {
    const s = DATA.summary;

    // Hero stats
    document.getElementById('streak-weeks').textContent = s.streak_weeks;
    document.getElementById('sessions-per-week').textContent = s.sessions_per_week;
    document.getElementById('total-sessions').textContent = s.total_sessions;
    document.getElementById('tracking-days').textContent = `${s.days_tracking} days tracked`;
    document.getElementById('exercise-count').textContent = `${s.unique_exercises} exercises`;
    document.getElementById('last-updated').textContent = new Date(s.generated_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    renderWinCard();
    renderHeatmap();
    renderSparklines();
    renderVolumeChart();
    renderBodySplit();
    renderExerciseList();
}

function renderWinCard() {
    const win = DATA.latest_win;
    const el = document.getElementById('win-content');

    if (!win) {
        el.innerHTML = '<p class="win-placeholder">Keep pushing — your first PR is coming! 💪</p>';
        return;
    }

    const dateStr = new Date(win.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    if (win.type === 'weight') {
        const increase = win.weight - win.previous_weight;
        el.innerHTML = `
            <div class="win-exercise">${win.exercise}</div>
            <div class="win-detail">${win.weight} lbs × ${win.reps}</div>
            <div class="win-comparison">↑ ${increase} lbs from ${win.previous_weight} lbs</div>
            <div class="win-date">${dateStr}</div>
        `;
    } else {
        el.innerHTML = `
            <div class="win-exercise">${win.exercise}</div>
            <div class="win-detail">${win.weight} lbs × ${win.reps} reps</div>
            <div class="win-comparison">↑ ${win.reps - win.previous_reps} more reps at same weight</div>
            <div class="win-date">${dateStr}</div>
        `;
    }
}

function renderHeatmap() {
    const container = document.getElementById('heatmap');
    container.innerHTML = '';

    // Build a calendar grid for the last 5 weeks
    const sessionMap = {};
    DATA.heatmap.forEach(d => { sessionMap[d.date] = d; });
    // Also map from sessions for focus info
    const focusMap = {};
    DATA.sessions.forEach(s => { focusMap[s.date] = s.focus; });

    const today = new Date();
    // Start from 4 weeks ago Monday
    const start = new Date(today);
    start.setDate(start.getDate() - start.getDay() + 1 - 28); // Go back 4 weeks to Monday

    // Day labels
    const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    dayLabels.forEach(label => {
        const el = document.createElement('div');
        el.className = 'heatmap-day-label';
        el.textContent = label;
        container.appendChild(el);
    });

    // Fill days
    const d = new Date(start);
    while (d <= today) {
        const dateStr = d.toISOString().slice(0, 10);
        const dayEl = document.createElement('div');
        dayEl.className = 'heatmap-day';

        const session = sessionMap[dateStr];
        if (session) {
            dayEl.classList.add('has-session');
            // Create gradient or solid color based on muscles
            const muscles = session.muscles;
            if (muscles.length === 1) {
                dayEl.style.background = MUSCLE_COLORS[muscles[0]] || MUSCLE_COLORS.other;
            } else {
                const colors = muscles.map(m => MUSCLE_COLORS[m] || MUSCLE_COLORS.other);
                dayEl.style.background = `linear-gradient(135deg, ${colors.join(', ')})`;
            }
            dayEl.style.opacity = '0.85';

            // Tooltip
            const focus = focusMap[dateStr] || muscles.join(', ');
            const tip = document.createElement('div');
            tip.className = 'tooltip';
            tip.textContent = `${new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${focus}`;
            dayEl.appendChild(tip);
        }

        // Day number (subtle)
        const isToday = dateStr === today.toISOString().slice(0, 10);
        if (isToday) {
            dayEl.style.border = '2px solid var(--accent)';
        }

        container.appendChild(dayEl);
        d.setDate(d.getDate() + 1);
    }
}

function renderSparklines() {
    const container = document.getElementById('sparklines');
    container.innerHTML = '';

    // Destroy old sparkline charts
    sparklineCharts.forEach(c => c.destroy());
    sparklineCharts = [];

    DATA.sparklines.forEach((ex, i) => {
        const row = document.createElement('div');
        row.className = 'sparkline-row';
        row.onclick = () => showExercise(ex.name);

        const trend = ex.current_max > ex.first_max ? 'up' : ex.current_max < ex.first_max ? 'down' : 'flat';
        const trendPct = ex.first_max > 0 ? Math.round(((ex.current_max - ex.first_max) / ex.first_max) * 100) : 0;
        const trendText = trend === 'up' ? `+${trendPct}%` : trend === 'down' ? `${trendPct}%` : '—';

        row.innerHTML = `
            <div class="sparkline-info">
                <div class="sparkline-name">${ex.name}</div>
                <div class="sparkline-meta">${ex.sessions_count} sessions</div>
            </div>
            <canvas class="sparkline-chart" id="spark-${i}"></canvas>
            <div>
                <div class="sparkline-weight">${ex.current_max}</div>
                <div class="sparkline-trend ${trend}">${trendText}</div>
            </div>
        `;

        container.appendChild(row);

        // Draw mini sparkline
        const ctx = document.getElementById(`spark-${i}`).getContext('2d');
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ex.data.map(d => d.date),
                datasets: [{
                    data: ex.data.map(d => d.weight),
                    borderColor: '#6c5ce7',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.3,
                    fill: {
                        target: 'origin',
                        above: 'rgba(108, 92, 231, 0.1)'
                    }
                }]
            },
            options: {
                responsive: false,
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: {
                    x: { display: false },
                    y: { display: false }
                },
                elements: { point: { radius: 0 } }
            }
        });
        sparklineCharts.push(chart);
    });
}

function renderVolumeChart() {
    const ctx = document.getElementById('volume-chart').getContext('2d');
    const vol = DATA.weekly_volume;

    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: vol.map(v => {
                const d = new Date(v.week + 'T00:00:00');
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }),
            datasets: [{
                data: vol.map(v => v.volume),
                backgroundColor: 'rgba(108, 92, 231, 0.6)',
                borderColor: '#6c5ce7',
                borderWidth: 1,
                borderRadius: 8,
                barThickness: 'flex',
                maxBarThickness: 40
            }]
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
                        callback: v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v
                    }
                }
            },
            plugins: {
                ...CHART_DEFAULTS.plugins,
                tooltip: {
                    ...CHART_DEFAULTS.plugins.tooltip,
                    callbacks: {
                        label: ctx => `${ctx.raw.toLocaleString()} lbs`
                    }
                }
            }
        }
    });
    activeCharts.push(chart);
}

function renderBodySplit() {
    const container = document.getElementById('split-bars');
    container.innerHTML = '';
    const split = DATA.body_split;
    const maxCount = Math.max(...split.map(s => s.count));

    const splitColors = {
        'Back': MUSCLE_COLORS.back,
        'Legs': MUSCLE_COLORS.legs,
        'Chest': MUSCLE_COLORS.chest,
        'Arms': MUSCLE_COLORS.arms,
        'Shoulders': MUSCLE_COLORS.shoulders,
        'Cardio': MUSCLE_COLORS.cardio,
        'Triceps': MUSCLE_COLORS.triceps
    };

    split.forEach(s => {
        const pct = (s.count / maxCount) * 100;
        const color = splitColors[s.part] || MUSCLE_COLORS.other;
        container.innerHTML += `
            <div class="split-bar-row">
                <span class="split-bar-label">${s.part}</span>
                <div class="split-bar-track">
                    <div class="split-bar-fill" style="width:${pct}%; background:${color}"></div>
                </div>
                <span class="split-bar-count">${s.count}</span>
            </div>
        `;
    });
}

function renderExerciseList() {
    const container = document.getElementById('exercise-list');
    container.innerHTML = '';

    const exercises = Object.keys(DATA.exercises).sort();
    exercises.forEach(name => {
        const ex = DATA.exercises[name];
        const item = document.createElement('div');
        item.className = 'exercise-item';
        item.onclick = () => showExercise(name);
        item.innerHTML = `
            <div>
                <div class="exercise-item-name">${name}</div>
                <div class="exercise-item-meta">${ex.total_sessions} session${ex.total_sessions !== 1 ? 's' : ''}</div>
            </div>
            <span class="exercise-item-arrow">→</span>
        `;
        container.appendChild(item);
    });
}

// ===== Exercise Deep Dive =====

function showExercise(name) {
    const ex = DATA.exercises[name];
    if (!ex) return;

    document.getElementById('dashboard-view').style.display = 'none';
    document.getElementById('exercise-view').style.display = 'block';
    document.getElementById('exercise-title').textContent = name;
    document.getElementById('exercise-meta').textContent = `${ex.total_sessions} session${ex.total_sessions !== 1 ? 's' : ''} logged`;

    // Destroy old charts
    activeCharts.forEach(c => c.destroy());
    activeCharts = [];

    window.scrollTo(0, 0);
    renderWeightProgression(name, ex);
    renderExerciseVolume(name, ex);
    renderSetLog(ex);
}

function showDashboard() {
    document.getElementById('exercise-view').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'block';
    activeCharts.forEach(c => c.destroy());
    activeCharts = [];
    window.scrollTo(0, 0);
}

function renderWeightProgression(name, ex) {
    const ctx = document.getElementById('weight-chart').getContext('2d');

    const labels = ex.sessions.map(s => s.date);
    const maxWeights = ex.sessions.map(s => s.max_weight);

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.map(l => {
                const d = new Date(l + 'T00:00:00');
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }),
            datasets: [{
                label: 'Max Weight (lbs)',
                data: maxWeights,
                borderColor: '#6c5ce7',
                backgroundColor: 'rgba(108, 92, 231, 0.15)',
                borderWidth: 3,
                pointRadius: 5,
                pointBackgroundColor: '#6c5ce7',
                pointBorderColor: '#14141f',
                pointBorderWidth: 2,
                tension: 0.2,
                fill: true
            }]
        },
        options: {
            ...CHART_DEFAULTS,
            plugins: {
                ...CHART_DEFAULTS.plugins,
                tooltip: {
                    ...CHART_DEFAULTS.plugins.tooltip,
                    callbacks: {
                        label: ctx => `${ctx.raw} lbs`
                    }
                }
            }
        }
    });
    activeCharts.push(chart);
}

function renderExerciseVolume(name, ex) {
    const ctx = document.getElementById('exercise-volume-chart').getContext('2d');

    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ex.sessions.map(s => {
                const d = new Date(s.date + 'T00:00:00');
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }),
            datasets: [{
                label: 'Volume (lbs)',
                data: ex.sessions.map(s => s.total_volume),
                backgroundColor: 'rgba(0, 210, 160, 0.5)',
                borderColor: '#00d2a0',
                borderWidth: 1,
                borderRadius: 8,
                maxBarThickness: 40
            }]
        },
        options: {
            ...CHART_DEFAULTS,
            scales: {
                ...CHART_DEFAULTS.scales,
                y: {
                    ...CHART_DEFAULTS.scales.y,
                    beginAtZero: true
                }
            },
            plugins: {
                ...CHART_DEFAULTS.plugins,
                tooltip: {
                    ...CHART_DEFAULTS.plugins.tooltip,
                    callbacks: {
                        label: ctx => `${ctx.raw.toLocaleString()} lbs total`
                    }
                }
            }
        }
    });
    activeCharts.push(chart);
}

function renderSetLog(ex) {
    const container = document.getElementById('set-log');
    container.innerHTML = '';

    // Most recent first
    const sessions = [...ex.sessions].reverse();

    sessions.forEach(session => {
        const dateStr = new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric'
        });

        let html = `
            <div class="set-log-session">
                <div class="set-log-date">${dateStr}</div>
                <div class="set-log-table">
                    <div class="set-log-header">Set</div>
                    <div class="set-log-header">Weight</div>
                    <div class="set-log-header">Reps</div>
        `;

        session.sets.forEach(set => {
            const weightStr = set.weight ? `${set.weight} lbs` : '—';
            const repsStr = set.reps ? set.reps : '—';
            html += `
                <div class="set-log-set-num">${set.set_number}</div>
                <div class="set-log-val">${weightStr}</div>
                <div class="set-log-val">${repsStr}</div>
            `;
        });

        html += `</div></div>`;
        container.innerHTML += html;
    });
}

// Boot
loadData();
