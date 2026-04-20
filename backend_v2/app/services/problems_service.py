from app.repositories.problems import (
    get_problems,
    get_problem_by_id,
    create_problem,
    update_problem,
    delete_problem,
)


def list_problems(limit: int = 50):
    return get_problems(limit=limit)


def get_problem(problem_id: int):
    return get_problem_by_id(problem_id)


def add_problem(title: str, description: str, created_by_user_id: int):
    return create_problem(title=title, description=description, created_by_user_id=created_by_user_id)


def edit_problem(problem_id: int, title: str, description: str):
    return update_problem(problem_id=problem_id, title=title, description=description)


def remove_problem(problem_id: int) -> bool:
    return delete_problem(problem_id)