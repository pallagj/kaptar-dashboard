"""SMS content parser for kaptárgsm-style messages.

Default format (kaptárgsm):
    SMS: 2
    A kaptar sulya: 38.8 kg
    Sulyvaltozas: 0.2 kg
    Akkufesz.: 6.2 V OK
    Hofok: 21.7 C
    Terero: 21,0

Custom scales can store a template string in sms_template using {weight}, {battery},
{temp} placeholders; anything else is treated as a literal (regex-escaped) prefix.
{*} matches and discards any value.
"""
from __future__ import annotations
import re

_NUM = r'([\d.,]+)'

# Default kaptárgsm regexes (case-insensitive)
_DEFAULT = [
    ('weight',  re.compile(r'kaptar\s+sulya\s*:\s*' + _NUM + r'\s*kg',   re.I)),
    ('battery', re.compile(r'akkufesz\.?\s*:\s*'     + _NUM + r'\s*v',    re.I)),
    ('temp',    re.compile(r'hofok\s*:\s*'           + _NUM + r'\s*c',    re.I)),
]

# Splitting on this pattern (with a capturing group) returns alternating
# [literal, name, literal, name, ..., literal].
_PLACEHOLDER = re.compile(r'\{(\w+|\*)\}')


def _to_float(s: str) -> float:
    return float(s.replace(',', '.'))


def _parse_with_template(content: str, template: str) -> dict | None:
    """Convert a user-defined template to a regex and extract named fields."""
    tokens = _PLACEHOLDER.split(template)  # alternates: literal, name, literal, name, ..., literal
    fields: list[str] = []
    regex = ''
    i = 0
    while i < len(tokens):
        regex += re.escape(tokens[i])  # literal segment
        i += 1
        if i < len(tokens):
            name = tokens[i]           # placeholder name (or '*')
            if name == '*':
                regex += r'[\s\S]*?'
            else:
                fields.append(name)
                regex += r'([\d.,]+)'
            i += 1
    try:
        m = re.search(regex, content, re.I)
    except re.error:
        return None
    if not m:
        return None
    result: dict[str, float] = {}
    for idx, name in enumerate(fields):
        try:
            result[name] = _to_float(m.group(idx + 1))
        except (ValueError, IndexError):
            pass
    return result if 'weight' in result else None


def parse_sms(content: str, template: str | None = None) -> dict | None:
    """Return dict with 'weight' (required) and optionally 'battery', 'temp', or None."""
    if template:
        return _parse_with_template(content, template)

    result: dict[str, float] = {}
    for field, rx in _DEFAULT:
        m = rx.search(content)
        if m:
            try:
                result[field] = _to_float(m.group(1))
            except ValueError:
                pass
    return result if 'weight' in result else None
