from app.repositories.dashboard import get_dashboard_stats, get_user_stats


def load_dashboard():
    return get_dashboard_stats() or {"users": 0, "total_tasks": 0, "active_tasks": 0, "recent_tasks": []}


def load_user_stats(user_id: int):
    return get_user_stats(user_id)