#!/usr/bin/env python3
"""Generate static JSON data files from gym.db for the dashboard."""

import json
import sqlite3
import sys
import os
from datetime import datetime, timedelta
from collections import defaultdict

DB_PATH = os.environ.get("GYM_DB", os.path.expanduser(
    "~/.openclaw/workspace/skills/gym-tracker/data/gym.db"
))
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs", "data")


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


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
           ORDER BY sess.date, e.name, s.set_number"""
    ).fetchall()]


def compute_streak(sessions):
    """Compute current workout streak (sessions in consecutive weeks)."""
    if not sessions:
        return 0
    dates = sorted(set(s["date"] for s in sessions))
    # Weekly streak: how many consecutive weeks have at least 1 session
    weeks = sorted(set(
        datetime.strptime(d, "%Y-%m-%d").isocalendar()[:2] for d in dates
    ), reverse=True)
    if not weeks:
        return 0

    # Check if current or last week has a session
    today = datetime.now()
    current_week = today.isocalendar()[:2]
    last_week = (today - timedelta(days=7)).isocalendar()[:2]

    if weeks[0] != current_week and weeks[0] != last_week:
        return 0  # Streak broken

    streak = 1
    for i in range(len(weeks) - 1):
        y1, w1 = weeks[i]
        y2, w2 = weeks[i + 1]
        # Check if consecutive weeks
        expected = datetime.strptime(f"{y1}-W{w1:02d}-1", "%G-W%V-%u") - timedelta(weeks=1)
        actual = datetime.strptime(f"{y2}-W{w2:02d}-1", "%G-W%V-%u")
        if expected == actual:
            streak += 1
        else:
            break
    return streak


def compute_consistency(sessions):
    """Sessions per week over the tracking period."""
    if not sessions:
        return 0
    dates = [datetime.strptime(s["date"], "%Y-%m-%d") for s in sessions]
    first = min(dates)
    last = max(dates)
    weeks = max(1, (last - first).days / 7)
    return round(len(sessions) / weeks, 1)


def find_latest_win(sets_data):
    """Find the most recent personal record."""
    # Track best weight per exercise
    exercise_bests = {}  # exercise_name -> (weight, reps, date)
    wins = []

    # Sort by date
    sorted_sets = sorted(sets_data, key=lambda s: (s["session_date"], s["exercise_name"]))

    for s in sorted_sets:
        if s["weight"] is None or s["weight"] == 0:
            continue
        name = s["exercise_name"]
        w = s["weight"]
        r = s["reps"] or 0

        if name not in exercise_bests:
            exercise_bests[name] = (w, r, s["session_date"])
        else:
            prev_w, prev_r, prev_date = exercise_bests[name]
            if w > prev_w:
                wins.append({
                    "exercise": name,
                    "weight": w,
                    "reps": r,
                    "previous_weight": prev_w,
                    "date": s["session_date"],
                    "type": "weight"
                })
                exercise_bests[name] = (w, r, s["session_date"])
            elif w == prev_w and r > prev_r:
                wins.append({
                    "exercise": name,
                    "weight": w,
                    "reps": r,
                    "previous_reps": prev_r,
                    "date": s["session_date"],
                    "type": "reps"
                })
                exercise_bests[name] = (w, r, s["session_date"])

    return wins[-1] if wins else None


def compute_muscle_heatmap(sessions, sets_data):
    """Create calendar heatmap data with muscle groups per day."""
    day_data = {}
    for s in sets_data:
        date = s["session_date"]
        cat = s["category"] or "other"
        if date not in day_data:
            day_data[date] = set()
        day_data[date].add(cat)

    result = []
    for date, muscles in sorted(day_data.items()):
        result.append({
            "date": date,
            "muscles": list(muscles),
            "count": len(muscles)
        })
    return result


def compute_exercise_sparklines(sets_data):
    """Top exercises by frequency with weight progression data."""
    exercise_sessions = defaultdict(list)  # name -> [(date, max_weight)]

    for s in sets_data:
        if s["weight"] is None or s["weight"] == 0:
            continue
        name = s["exercise_name"]
        date = s["session_date"]
        exercise_sessions[name].append((date, s["weight"]))

    # Aggregate: max weight per session per exercise
    exercise_progress = {}
    for name, entries in exercise_sessions.items():
        by_date = defaultdict(float)
        for date, w in entries:
            by_date[date] = max(by_date[date], w)
        exercise_progress[name] = sorted(by_date.items())

    # Sort by number of sessions (frequency)
    top = sorted(exercise_progress.items(), key=lambda x: -len(x[1]))[:5]

    return [
        {
            "name": name,
            "data": [{"date": d, "weight": w} for d, w in points],
            "sessions_count": len(points),
            "current_max": max(w for _, w in points),
            "first_max": points[0][1] if points else 0
        }
        for name, points in top
    ]


def compute_weekly_volume(sets_data):
    """Total volume (weight × reps) per week."""
    weekly = defaultdict(float)
    weekly_dates = defaultdict(str)

    for s in sets_data:
        if s["weight"] is None or s["reps"] is None:
            continue
        date = datetime.strptime(s["session_date"], "%Y-%m-%d")
        week_start = date - timedelta(days=date.weekday())
        week_key = week_start.strftime("%Y-%m-%d")
        weekly[week_key] += s["weight"] * s["reps"]
        if not weekly_dates[week_key] or s["session_date"] > weekly_dates[week_key]:
            weekly_dates[week_key] = s["session_date"]

    return [
        {"week": k, "volume": round(v), "last_session": weekly_dates[k]}
        for k, v in sorted(weekly.items())
    ]


def compute_body_split(sets_data, sessions):
    """Summary of session distribution by body part."""
    focus_counts = defaultdict(int)
    for s in sessions:
        focus = s["focus"] or "Other"
        # Normalize: extract primary muscles
        parts = [p.strip() for p in focus.replace("+", ",").split(",")]
        for part in parts:
            focus_counts[part.strip()] += 1

    return [{"part": k, "count": v} for k, v in sorted(focus_counts.items(), key=lambda x: -x[1])]


def compute_exercise_detail(sets_data):
    """Per-exercise detail data for deep dive page."""
    exercises = defaultdict(lambda: {"sessions": defaultdict(list)})

    for s in sets_data:
        name = s["exercise_name"]
        date = s["session_date"]
        exercises[name]["sessions"][date].append({
            "set_number": s["set_number"],
            "weight": s["weight"],
            "reps": s["reps"],
            "rpe": s["rpe"],
            "is_warmup": s.get("is_warmup", 0),
            "is_dropset": s.get("is_dropset", 0),
            "notes": s["notes"]
        })

    result = {}
    for name, data in exercises.items():
        session_list = []
        for date, sets in sorted(data["sessions"].items()):
            total_vol = sum((s["weight"] or 0) * (s["reps"] or 0) for s in sets)
            max_w = max((s["weight"] or 0) for s in sets)
            session_list.append({
                "date": date,
                "sets": sets,
                "total_volume": round(total_vol),
                "max_weight": max_w
            })
        result[name] = {
            "sessions": session_list,
            "total_sessions": len(session_list)
        }

    return result


def generate_summary(sessions, sets_data):
    """High-level summary stats."""
    total_sessions = len(sessions)
    if not sessions:
        return {}

    dates = [s["date"] for s in sessions]
    first_date = min(dates)
    last_date = max(dates)
    days_tracking = (datetime.strptime(last_date, "%Y-%m-%d") - datetime.strptime(first_date, "%Y-%m-%d")).days + 1

    total_sets = len([s for s in sets_data if s["weight"] is not None])
    total_volume = sum((s["weight"] or 0) * (s["reps"] or 0) for s in sets_data)

    unique_exercises = len(set(s["exercise_name"] for s in sets_data))

    return {
        "total_sessions": total_sessions,
        "days_tracking": days_tracking,
        "first_date": first_date,
        "last_date": last_date,
        "total_sets": total_sets,
        "total_volume": round(total_volume),
        "unique_exercises": unique_exercises,
        "streak_weeks": compute_streak(sessions),
        "sessions_per_week": compute_consistency(sessions),
        "generated_at": datetime.now().isoformat()
    }


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    conn = connect()

    sessions = get_sessions(conn)
    exercises = get_exercises(conn)
    sets_data = get_sets(conn)

    # Generate all data files
    data = {
        "summary": generate_summary(sessions, sets_data),
        "latest_win": find_latest_win(sets_data),
        "heatmap": compute_muscle_heatmap(sessions, sets_data),
        "sparklines": compute_exercise_sparklines(sets_data),
        "weekly_volume": compute_weekly_volume(sets_data),
        "body_split": compute_body_split(sets_data, sessions),
        "exercises": compute_exercise_detail(sets_data),
        "sessions": sessions,
        "exercise_list": exercises
    }

    # Write single data file
    with open(os.path.join(OUT_DIR, "gym-data.json"), "w") as f:
        json.dump(data, f, indent=2)

    conn.close()
    print(f"Generated data: {len(sessions)} sessions, {len(sets_data)} sets, {len(exercises)} exercises")
    print(f"Output: {OUT_DIR}/gym-data.json")


if __name__ == "__main__":
    main()
