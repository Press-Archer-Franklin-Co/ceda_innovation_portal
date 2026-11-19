"""Phone number normalisation to E.164 (``+26771234567``).

Botswana numbers are 8 digits with no trunk prefix, so a bare 8-digit number is
treated as local and gets ``+267``. Numbers that already carry a country code
(``+…``, ``00…`` or ``267…``) are kept as they are.
"""

from __future__ import annotations

import re

DEFAULT_COUNTRY_CODE = "267"
BOTSWANA_LOCAL_LENGTH = 8
_E164_RE = re.compile(r"^\+[1-9]\d{7,14}$")
_STRIP_RE = re.compile(r"[\s\-().]")


class InvalidPhoneNumber(ValueError):
    pass


def normalize_phone(value: str | None, *, default_country_code: str = DEFAULT_COUNTRY_CODE) -> str:
    """Return ``value`` in E.164 form or raise ``InvalidPhoneNumber``."""
    if value is None:
        raise InvalidPhoneNumber("Enter a phone number.")
    raw = _STRIP_RE.sub("", str(value).strip())
    if not raw:
        raise InvalidPhoneNumber("Enter a phone number.")
    if raw.startswith("00"):
        raw = "+" + raw[2:]
    if raw.startswith("+"):
        digits = raw[1:]
    else:
        digits = raw
        if len(digits) == BOTSWANA_LOCAL_LENGTH and default_country_code == DEFAULT_COUNTRY_CODE:
            digits = default_country_code + digits
        elif not digits.startswith(default_country_code):
            digits = default_country_code + digits.lstrip("0")
    if not digits.isdigit():
        raise InvalidPhoneNumber("A phone number can only contain digits and a leading +.")
    candidate = f"+{digits}"
    if not _E164_RE.match(candidate):
        raise InvalidPhoneNumber("Enter a valid phone number, for example +267 71 234 567.")
    if candidate.startswith("+267") and len(candidate) != 4 + BOTSWANA_LOCAL_LENGTH:
        raise InvalidPhoneNumber("Botswana numbers have 8 digits after +267.")
    return candidate


def try_normalize_phone(value: str | None) -> str | None:
    try:
        return normalize_phone(value)
    except InvalidPhoneNumber:
        return None


def mask_phone(phone: str) -> str:
    if not phone or len(phone) < 6:
        return phone
    return f"{phone[:4]}{'*' * (len(phone) - 7)}{phone[-3:]}"
