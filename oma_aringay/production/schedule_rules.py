"""Where a scheduled crop activity stands: one rule for the suggestions, the dashboard counts and the yield analysis.

An ordinary step is matched to a log by its target day or by date (the log falls within the step's window), and is
`overdue` once its window has passed without one.

Set-up steps (Land Preparation, Planting, and the other steps flagged allows_pre_planting) are done once, before or at
planting, so common sense applies:
  * any log of that activity makes every step of that name `done`, however many days before or after the schedule it
    was done (land is normally prepared before the planting date, outside any window);
  * one that was never recorded is `due_now` while its window is on, then `passed`: the crop is in the ground, so it is
    no longer suggested and no longer counts as overdue (it can still be logged late from the picker).
"""

# Done once, before or at planting, besides any stage flagged allows_pre_planting.
SETUP_ACTIVITIES = frozenset({'Land Preparation', 'Planting', 'Seed Planting'})


def is_setup_stage(stage):
    return bool(getattr(stage, 'allows_pre_planting', False)) or getattr(stage, 'stage_name', None) in SETUP_ACTIVITIES


def done_date(stage_name, occurrence_day, due_date, window, logs, setup=False):
    """The date of the log that makes this step done, or None. `logs` = [(activity_name, date_of_activity, target_day)]."""
    named = [(date_, target) for name, date_, target in logs if name == stage_name]
    if setup:
        dates = [date_ for date_, _ in named if date_ is not None]
        return min(dates) if dates else None
    for date_, target in named:
        if target is not None and target == occurrence_day:
            return date_
        if due_date is not None and date_ is not None and abs((date_ - due_date).days) <= window:
            return date_
    return None


def step_status(occurrence_day, days_elapsed, window, done=False, setup=False):
    """'done' | 'overdue' | 'due_now' | 'upcoming' | 'passed' (an unrecorded set-up step whose time is over)."""
    if done:
        return 'done'
    days_diff = occurrence_day - days_elapsed
    if days_diff < -window:
        return 'passed' if setup else 'overdue'
    if abs(days_diff) <= window:
        return 'due_now'
    return 'upcoming'
