"""SMS content parser for kaptárgsm-style messages.

Custom scales store per-field patterns in sms_template as JSON:
    {"weight": "Suly: {}kg", "temp": "Homero: {}", "battery": "Akku: {}%"}
Each pattern is searched independently; {} matches a decimal number.
"""
from __future__ import annotations
import json
import re

_NUM = r'([\d.,]+)'

# Default kaptárgsm regexes (case-insensitive)
_DEFAULT = [
    ('weight',  re.compile(r'kaptar\s+sulya\s*:\s*' + _NUM + r'\s*kg', re.I)),
    ('battery', re.compile(r'akkufesz\.?\s*:\s*'     + _NUM + r'\s*v',  re.I)),
    ('temp',    re.compile(r'hofok\s*:\s*'           + _NUM + r'\s*c',  re.I)),
]


def _to_float(s: str) -> float:
    return float(s.replace(',', '.'))


def _parse_with_fields(content: str, fields: dict) -> dict | None:
    result = {}
    for field, pattern in fields.items():
        if not pattern:
            continue
        # re.escape escapes {} to \{\}, then we put the number capture group back
        regex = re.escape(pattern).replace(r'\{\}', _NUM, 1)
        m = re.search(regex, content, re.I)
        if m:
            try:
                result[field] = _to_float(m.group(1))
            except ValueError:
                pass
    return result if 'weight' in result else None


def parse_sms(content: str, template: str | None = None) -> dict | None:
    """Return dict with 'weight' (required) and optionally 'battery', 'temp', or None."""
    if template:
        try:
            fields = json.loads(template)
            if isinstance(fields, dict):
                return _parse_with_fields(content, fields)
        except (json.JSONDecodeError, TypeError):
            pass
        return None

    result: dict[str, float] = {}
    for field, rx in _DEFAULT:
        m = rx.search(content)
        if m:
            try:
                result[field] = _to_float(m.group(1))
            except ValueError:
                pass
    return result if 'weight' in result else None
