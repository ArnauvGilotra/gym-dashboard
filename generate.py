#!/usr/bin/env python3
"""Generate static JSON data from gym.db for the dashboard.

v2 (Apr 2026): Richer analytics — estimated 1RM, stall detection, muscle-group
volume breakdown, week-over-week comparisons, and auto-generated insights.
"""

import json
import sqlite3
import os
from datetime import datetime, timedelta, date
from collections import defaultdict

DB_PATH = os.environ.get("GYM_DB", os.path.expanduser(
    "~/.openclaw/workspace/skills/gym-tracker/data/gym.db"
))
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs", "data")

TODAY = datetime.now().date()

# ---- Helpers ------------------------------------------------------------

def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def parse_date(s):
    return datetime.strptime(s, "%Y-%m-%d").date()


def estimate_1rm(weight, reps):
    """Epley formula: 1RM = w * (1 + reps/30). Returns 0 if invalid inputs."""
    if not weight or not reps or reps <= 0:
        return 0
    if reps == 1:
        return weight
    return round(weight * (1 + reps / 30), 1)


def days_between(d1, d2):
    """Days between two date strings (d1 - d2)."""
    return (parse_date(d1) - parse_date(d2)).days


def week_start(d):
    """Monday of the ISO week for date string d."""
    dt = parse_date(d)
    return (dt - timedelta(days=dt.weekday())).strftime("%Y-%m-%d")


# ---- Data loading -------------------------------------------------------

def get_sessions(conn):
    return [dict(r) for r in conn.execute(
        "SELECT * FROM sessions ORDER BY date"
    ).fetchall()]


def get_exercises(conn):
    return [dict(r) for r in conn.execute(
        "SELECT * FROM exercises ORDER BY name"
    ).fetchall()]


def get_sets(conn):
    return [dict(r) for r in conn.execute(
        """SELECT s.*, e.name as exercise_name, e.category, e.equipment,
                  sess.date as session_date, sess.focus as session_focus
           FROM sets s
           JOIN exercises e ON s.exercise_id = e.id
           JOIN sessions sess ON s.session_id = sess.id
           WHERE s.is_warmup = 0 OR s.is_warmup IS NULL
           ORDER BY sess.date, e.name, s.set_number"""
    ).fetchall()]


# ---- Per-exercise analysis ----------------------------------------------

def analyze_exercise(name, sets_for_ex):
    """Build a full analysis for one exercise — sessions, PRs, trend."""
    by_date = defaultdict(list)
    for s in sets_for_ex:
        by_date[s["session_date"]].append(s)

    sessions = []
    for dt in sorted(by_date.keys()):
        dset = by_date[dt]
        # Filter to weighted sets for stats
        weighted = [s for s in dset if s.get("weight") and s.get("reps")]
        max_weight = max((s["weight"] for s in weighted), default=0)
        best_1rm = 0
        for s in weighted:
            e1 = estimate_1rm(s["weight"], s["reps"])
            if e1 > best_1rm:
                best_1rm = e1
        volume = sum((s.get("weight") or 0) * (s.get("reps") or 0) for s in dset)
        total_reps = sum(s.get("reps") or 0 for s in dset)
        sessions.append({
            "date": dt,
            "sets": [
                {
                    "set_number": s["set_number"],
                    "weight": s["weight"],
                    "reps": s["reps"],
                    "rpe": s["rpe"],
                    "is_warmup": s.get("is_warmup", 0) or 0,
                    "is_dropset": s.get("is_dropset", 0) or 0,
                    "notes": s["notes"],
                    "duration_sec": s.get("duration_sec"),
                    "distance_km": s.get("distance_km"),
                    "incline": s.get("incline"),
                    "speed_kmh": s.get("speed_kmh"),
                }
                for s in dset
            ],
            "max_weight": max_weight,
            "estimated_1rm": best_1rm,
            "total_volume": round(volume),
            "total_reps": total_reps,
            "num_sets": len(dset),
        })

    # Stats
    all_weights = [s["max_weight"] for s in sessions if s["max_weight"]]
    all_1rms = [s["estimated_1rm"] for s in sessions if s["estimated_1rm"]]
    all_vols = [s["total_volume"] for s in sessions if s["total_volume"]]

    current_max_weight = all_weights[-1] if all_weights else 0
    current_1rm = all_1rms[-1] if all_1rms else 0
    all_time_max_weight = max(all_weights) if all_weights else 0
    all_time_1rm = max(all_1rms) if all_1rms else 0

    # Stall detection — last 3 sessions' best 1RM has been flat/declining
    trend = "new"
    days_since = (TODAY - parse_date(sessions[-1]["date"])).days if sessions else None

    if len(all_1rms) >= 3:
        recent = all_1rms[-3:]
        if max(recent) == recent[-1] and recent[-1] > max(all_1rms[:-3] or [0]):
            trend = "pr"  # Just hit new peak
        elif recent[-1] < max(all_1rms[:-3] or [0]) * 0.95:
            trend = "regressing"
        elif max(recent) - min(recent) < max(recent) * 0.03:
            trend = "stalled"
        elif recent[-1] > recent[0]:
            trend = "progressing"
        else:
            trend = "plateau"
    elif len(all_1rms) == 2:
        trend = "progressing" if all_1rms[-1] > all_1rms[0] else "plateau"

    # Progress since first session
    first_1rm = all_1rms[0] if all_1rms else 0
    progress_pct = 0
    if first_1rm > 0:
        progress_pct = round(((current_1rm - first_1rm) / first_1rm) * 100, 1)

    return {
        "sessions": sessions,
        "total_sessions": len(sessions),
        "current_max_weight": current_max_weight,
        "current_1rm": current_1rm,
        "all_time_max_weight": all_time_max_weight,
        "all_time_1rm": all_time_1rm,
        "progress_pct": progress_pct,
        "trend": trend,
        "days_since": days_since,
        "last_session": sessions[-1]["date"] if sessions else None,
        "category": sets_for_ex[0].get("category") if sets_for_ex else None,
        "equipment": sets_for_ex[0].get("equipment") if sets_for_ex else None,
    }


# ---- Aggregate computations ---------------------------------------------

def compute_heatmap(sessions, sets_data):
    """Full year calendar data with muscles per day."""
    day_muscles = defaultdict(set)
    for s in sets_data:
        cat = s.get("category") or "other"
        day_muscles[s["session_date"]].add(cat)

    focus_map = {s["date"]: s["focus"] for s in sessions}

    return [
        {
            "date": d,
            "muscles": sorted(day_muscles[d]),
            "focus": focus_map.get(d, ""),
        }
        for d in sorted(day_muscles.keys())
    ]


def compute_muscle_volume(sets_data):
    """Weekly volume per muscle group over time."""
    by_week_cat = defaultdict(lambda: defaultdict(float))
    weeks = set()
    cats = set()

    for s in sets_data:
        if not s.get("weight") or not s.get("reps"):
            continue
        wk = week_start(s["session_date"])
        cat = s.get("category") or "other"
        by_week_cat[wk][cat] += s["weight"] * s["reps"]
        weeks.add(wk)
        cats.add(cat)

    sorted_weeks = sorted(weeks)
    sorted_cats = sorted(cats)

    return {
        "weeks": sorted_weeks,
        "categories": sorted_cats,
        "data": [
            {
                "week": wk,
                **{cat: round(by_week_cat[wk].get(cat, 0)) for cat in sorted_cats},
            }
            for wk in sorted_weeks
        ],
    }


def compute_weekly_summary(sessions, sets_data):
    """Total volume + sessions + sets per week."""
    weeks = defaultdict(lambda: {"volume": 0, "sessions": 0, "sets": 0})
    session_weeks = defaultdict(set)

    for sess in sessions:
        wk = week_start(sess["date"])
        session_weeks[wk].add(sess["date"])

    for s in sets_data:
        if not s.get("weight") or not s.get("reps"):
            continue
        wk = week_start(s["session_date"])
        weeks[wk]["volume"] += s["weight"] * s["reps"]
        weeks[wk]["sets"] += 1

    for wk, dates in session_weeks.items():
        weeks[wk]["sessions"] = len(dates)

    return [
        {
            "week": wk,
            "volume": round(v["volume"]),
            "sessions": v["sessions"],
            "sets": v["sets"],
        }
        for wk, v in sorted(weeks.items())
    ]


def compute_comparisons(sessions, sets_data):
    """This week vs last week, this month vs last month."""
    today = TODAY
    this_week_start = today - timedelta(days=today.weekday())
    last_week_start = this_week_start - timedelta(days=7)
    last_week_end = this_week_start - timedelta(days=1)

    def volume_in_range(start, end):
        v = 0
        s_count = set()
        set_count = 0
        for s in sets_data:
            d = parse_date(s["session_date"])
            if start <= d <= end:
                if s.get("weight") and s.get("reps"):
                    v += s["weight"] * s["reps"]
                    set_count += 1
                s_count.add(s["session_date"])
        return round(v), len(s_count), set_count

    this_week = volume_in_range(this_week_start, today)
    last_week = volume_in_range(last_week_start, last_week_end)

    # Months
    this_month_start = today.replace(day=1)
    last_month_end = this_month_start - timedelta(days=1)
    last_month_start = last_month_end.replace(day=1)

    this_month = volume_in_range(this_month_start, today)
    last_month = volume_in_range(last_month_start, last_month_end)

    def pct_change(current, previous):
        if previous == 0:
            return None
        return round(((current - previous) / previous) * 100, 1)

    return {
        "this_week": {
            "volume": this_week[0],
            "sessions": this_week[1],
            "sets": this_week[2],
        },
        "last_week": {
            "volume": last_week[0],
            "sessions": last_week[1],
            "sets": last_week[2],
        },
        "this_month": {
            "volume": this_month[0],
            "sessions": this_month[1],
            "sets": this_month[2],
        },
        "last_month": {
            "volume": last_month[0],
            "sessions": last_month[1],
            "sets": last_month[2],
        },
        "volume_wow_pct": pct_change(this_week[0], last_week[0]),
        "sessions_wow_delta": this_week[1] - last_week[1],
        "volume_mom_pct": pct_change(this_month[0], last_month[0]),
    }


def compute_recent_prs(exercises_analysis, limit=5):
    """Most recent PRs (weight or estimated 1RM) across all exercises."""
    prs = []
    for name, data in exercises_analysis.items():
        all_1rms = [s["estimated_1rm"] for s in data["sessions"]]
        all_weights = [s["max_weight"] for s in data["sessions"]]
        if len(all_1rms) < 2:
            continue

        running_1rm = 0
        running_w = 0
        for i, sess in enumerate(data["sessions"]):
            e1 = sess["estimated_1rm"]
            w = sess["max_weight"]
            if e1 > running_1rm and running_1rm > 0:
                # Find the rep count of the set that produced this 1rm
                best_set = max(
                    (s for s in sess["sets"] if s.get("weight") and s.get("reps")),
                    key=lambda x: estimate_1rm(x["weight"], x["reps"]),
                    default=None,
                )
                prs.append({
                    "exercise": name,
                    "date": sess["date"],
                    "weight": best_set["weight"] if best_set else w,
                    "reps": best_set["reps"] if best_set else None,
                    "estimated_1rm": e1,
                    "previous_1rm": round(running_1rm, 1),
                    "gain": round(e1 - running_1rm, 1),
                    "category": data.get("category"),
                })
            running_1rm = max(running_1rm, e1)
            running_w = max(running_w, w)

    # Sort by date descending, take most recent
    prs.sort(key=lambda x: x["date"], reverse=True)
    return prs[:limit]


def compute_insights(exercises_analysis, comparisons, sessions):
    """Auto-generated insights — things Arnauv should know about."""
    insights = []

    # 1. Neglected muscle groups (no training in 10+ days)
    cat_last_seen = {}
    for name, data in exercises_analysis.items():
        cat = data.get("category")
        if not cat or cat == "cardio":
            continue
        last = data.get("last_session")
        if not last:
            continue
        if cat not in cat_last_seen or last > cat_last_seen[cat]:
            cat_last_seen[cat] = last

    for cat, last in cat_last_seen.items():
        days = (TODAY - parse_date(last)).days
        if days >= 10:
            insights.append({
                "type": "neglected",
                "severity": "high" if days >= 14 else "medium",
                "text": f"{cat.title()} hasn't been trained in {days} days",
                "category": cat,
                "days": days,
            })

    # 2. Stalled exercises — 3+ sessions, flat 1RM
    stalled = [
        {"name": name, "sessions": data["total_sessions"], "current_1rm": data["current_1rm"], "category": data.get("category")}
        for name, data in exercises_analysis.items()
        if data["trend"] == "stalled" and data["total_sessions"] >= 3
    ]
    for s in stalled[:3]:
        insights.append({
            "type": "stalled",
            "severity": "medium",
            "text": f"{s['name']} is stalled at {s['current_1rm']} lb est. 1RM",
            "exercise": s["name"],
            "category": s["category"],
        })

    # 3. Recent breakthrough — exercise on PR trend
    breakthroughs = [
        name for name, data in exercises_analysis.items()
        if data["trend"] == "pr" and data["total_sessions"] >= 3
    ]
    for name in breakthroughs[:2]:
        insights.append({
            "type": "breakthrough",
            "severity": "good",
            "text": f"{name} just hit a new PR — keep pushing",
            "exercise": name,
        })

    # 4. Weekly volume change
    wow = comparisons.get("volume_wow_pct")
    if wow is not None and abs(wow) >= 15:
        if wow > 0:
            insights.append({
                "type": "volume_up",
                "severity": "good",
                "text": f"Weekly volume up {wow}% vs last week",
            })
        else:
            insights.append({
                "type": "volume_down",
                "severity": "medium",
                "text": f"Weekly volume down {abs(wow)}% vs last week",
            })

    # 5. Session frequency
    this_wk_sess = comparisons["this_week"]["sessions"]
    last_wk_sess = comparisons["last_week"]["sessions"]
    if this_wk_sess >= 4:
        insights.append({
            "type": "consistency",
            "severity": "good",
            "text": f"{this_wk_sess} sessions this week — strong work",
        })
    elif this_wk_sess == 0 and last_wk_sess > 0:
        insights.append({
            "type": "dropoff",
            "severity": "high",
            "text": "No sessions logged this week yet",
        })

    # Sort: high severity first, then medium, then good
    severity_order = {"high": 0, "medium": 1, "good": 2}
    insights.sort(key=lambda i: severity_order.get(i["severity"], 3))
    return insights


def compute_consistency_trend(sessions):
    """Sessions per ISO-week over the last 12 weeks for a trend chart."""
    weeks = defaultdict(int)
    for s in sessions:
        weeks[week_start(s["date"])] += 1

    if not weeks:
        return []

    # Fill missing weeks with 0
    first = parse_date(min(weeks.keys()))
    last_wk = TODAY - timedelta(days=TODAY.weekday())

    result = []
    wk = first
    while wk <= last_wk:
        key = wk.strftime("%Y-%m-%d")
        result.append({"week": key, "sessions": weeks.get(key, 0)})
        wk += timedelta(days=7)
    # Keep last 12 weeks
    return result[-12:]


def compute_streak(sessions):
    """Sessions in the current rolling 7-day window, plus consecutive weeks."""
    if not sessions:
        return {"week_streak": 0, "last_7_days": 0, "longest_week_streak": 0}

    dates = sorted({s["date"] for s in sessions})
    today = TODAY

    # Last 7 days count
    last_7 = sum(1 for d in dates if (today - parse_date(d)).days <= 7)

    # Current consecutive weeks streak
    week_keys = sorted({week_start(d) for d in dates})
    # Walk back from current week
    current_wk = (today - timedelta(days=today.weekday())).strftime("%Y-%m-%d")
    streak = 0
    check = current_wk
    # If no session this week but last week had one, streak still alive
    if current_wk not in week_keys:
        last_wk = (today - timedelta(days=today.weekday()+7)).strftime("%Y-%m-%d")
        if last_wk not in week_keys:
            return {"week_streak": 0, "last_7_days": last_7, "longest_week_streak": compute_longest_streak(week_keys)}
        check = last_wk

    while check in week_keys:
        streak += 1
        prev = (parse_date(check) - timedelta(days=7)).strftime("%Y-%m-%d")
        check = prev

    return {
        "week_streak": streak,
        "last_7_days": last_7,
        "longest_week_streak": compute_longest_streak(week_keys),
    }


def compute_longest_streak(week_keys):
    if not week_keys:
        return 0
    longest = 1
    current = 1
    for i in range(1, len(week_keys)):
        prev = parse_date(week_keys[i-1])
        this = parse_date(week_keys[i])
        if (this - prev).days == 7:
            current += 1
            longest = max(longest, current)
        else:
            current = 1
    return longest


def compute_exercises_by_category(exercises_analysis):
    """Group exercises by category with summary stats."""
    by_cat = defaultdict(list)
    for name, data in exercises_analysis.items():
        cat = data.get("category") or "other"
        by_cat[cat].append({
            "name": name,
            "total_sessions": data["total_sessions"],
            "current_1rm": data["current_1rm"],
            "current_max_weight": data["current_max_weight"],
            "all_time_1rm": data["all_time_1rm"],
            "trend": data["trend"],
            "days_since": data["days_since"],
            "progress_pct": data["progress_pct"],
            "equipment": data.get("equipment"),
        })

    # Sort exercises within category by most recent activity
    for cat in by_cat:
        by_cat[cat].sort(key=lambda x: (x["days_since"] if x["days_since"] is not None else 9999))

    # Sort categories by exercise count
    return [
        {"category": cat, "exercises": exs, "total": len(exs)}
        for cat, exs in sorted(by_cat.items(), key=lambda x: -len(x[1]))
    ]


# ---- Main ---------------------------------------------------------------

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    conn = connect()

    sessions = get_sessions(conn)
    exercises = get_exercises(conn)
    sets_data = get_sets(conn)

    # Per-exercise analysis
    sets_by_ex = defaultdict(list)
    for s in sets_data:
        sets_by_ex[s["exercise_name"]].append(s)

    exercises_analysis = {
        name: analyze_exercise(name, sets_for_ex)
        for name, sets_for_ex in sets_by_ex.items()
    }

    comparisons = compute_comparisons(sessions, sets_data)
    streak_data = compute_streak(sessions)

    # Summary
    dates = [s["date"] for s in sessions]
    days_tracking = 0
    if dates:
        days_tracking = (parse_date(max(dates)) - parse_date(min(dates))).days + 1

    total_volume = sum((s.get("weight") or 0) * (s.get("reps") or 0) for s in sets_data)
    weighted_sets = sum(1 for s in sets_data if s.get("weight") and s.get("reps"))

    summary = {
        "total_sessions": len(sessions),
        "days_tracking": days_tracking,
        "first_date": min(dates) if dates else None,
        "last_date": max(dates) if dates else None,
        "total_sets": weighted_sets,
        "total_volume": round(total_volume),
        "unique_exercises": len(exercises_analysis),
        "streak_weeks": streak_data["week_streak"],
        "longest_streak": streak_data["longest_week_streak"],
        "last_7_days": streak_data["last_7_days"],
        "sessions_per_week": round(len(sessions) / max(1, days_tracking / 7), 1) if days_tracking else 0,
        "generated_at": datetime.now().isoformat(),
    }

    data = {
        "summary": summary,
        "comparisons": comparisons,
        "insights": compute_insights(exercises_analysis, comparisons, sessions),
        "recent_prs": compute_recent_prs(exercises_analysis, limit=5),
        "heatmap": compute_heatmap(sessions, sets_data),
        "weekly_summary": compute_weekly_summary(sessions, sets_data),
        "muscle_volume": compute_muscle_volume(sets_data),
        "consistency_trend": compute_consistency_trend(sessions),
        "exercises_by_category": compute_exercises_by_category(exercises_analysis),
        "exercises": exercises_analysis,
        "sessions": sessions,
    }

    with open(os.path.join(OUT_DIR, "gym-data.json"), "w") as f:
        json.dump(data, f, indent=2, default=str)

    conn.close()
    print(f"✓ {len(sessions)} sessions, {weighted_sets} sets, {len(exercises_analysis)} exercises")
    print(f"✓ {len(data['insights'])} insights, {len(data['recent_prs'])} recent PRs")
    print(f"✓ {OUT_DIR}/gym-data.json")


if __name__ == "__main__":
    main()
