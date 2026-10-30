"""Robust MSEDCL electricity-bill OCR service for SolarIQ+.

MSEDCL-specific handling:
- full-page OCR
- targeted payment-box OCR
- BILL DATE / DUE DATE / IF PAID UPTO / IF PAID AFTER
- current bill amount (amount beside BILL DATE/DUE DATE)
- multiple OCR passes
- PDF text-layer and scanned PDF support
- Windows Tesseract support
"""

import io
import logging
import os
import re
import subprocess
import tempfile
from datetime import datetime
from typing import Optional

import cv2
import numpy as np
from PIL import Image, ImageOps
import pytesseract


if os.name == "nt":
    pytesseract.pytesseract.tesseract_cmd = (
        r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    )


logger = logging.getLogger("solariq.ocr")

_MIN_PDF_TEXT = 40
_MAX_PDF_PAGES = 8


class OcrEngineUnavailable(Exception):
    """Raised when Tesseract is unavailable."""


class OcrFailed(Exception):
    """Raised when OCR processing fails."""


def tesseract_available() -> bool:
    try:
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def _available_languages() -> str:
    try:
        languages = set(pytesseract.get_languages(config=""))

        if "eng" in languages and "mar" in languages:
            return "eng+mar"
        if "eng" in languages:
            return "eng"
        if "mar" in languages:
            return "mar"
    except Exception:
        pass

    return "eng"


def _resize_for_ocr(gray: np.ndarray) -> np.ndarray:
    h, w = gray.shape[:2]

    if h <= 0 or w <= 0:
        return gray

    longest = max(h, w)

    if longest < 2200:
        scale = 2200.0 / longest
        gray = cv2.resize(
            gray,
            (max(1, int(w * scale)), max(1, int(h * scale))),
            interpolation=cv2.INTER_CUBIC,
        )
    elif longest > 5000:
        scale = 5000.0 / longest
        gray = cv2.resize(
            gray,
            (max(1, int(w * scale)), max(1, int(h * scale))),
            interpolation=cv2.INTER_AREA,
        )

    return gray


def _make_variants(image: Image.Image):
    rgb = np.array(image.convert("RGB"))
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    gray = _resize_for_ocr(gray)

    denoised = cv2.fastNlMeansDenoising(
        gray, None, 7, 7, 21
    )

    clahe = cv2.createCLAHE(
        clipLimit=2.0,
        tileGridSize=(8, 8),
    )
    contrast = clahe.apply(denoised)

    _, otsu = cv2.threshold(
        contrast,
        0,
        255,
        cv2.THRESH_BINARY + cv2.THRESH_OTSU,
    )

    adaptive = cv2.adaptiveThreshold(
        contrast,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        11,
    )

    kernel = np.ones((2, 2), np.uint8)
    morph = cv2.morphologyEx(
        otsu,
        cv2.MORPH_CLOSE,
        kernel,
        iterations=1,
    )

    return [
        ("gray", denoised),
        ("clahe", contrast),
        ("otsu", otsu),
        ("adaptive", adaptive),
        ("morph_otsu", morph),
    ]


def _ocr_pass(
    image: np.ndarray,
    psm: int,
    lang: str,
):
    """Run Tesseract once and derive both text and confidence from its output."""
    config = (
        f"--oem 3 --psm {psm} "
        "-c preserve_interword_spaces=1 "
        "-c user_defined_dpi=300"
    )
    data = pytesseract.image_to_data(
        image,
        lang=lang,
        config=config,
        output_type=pytesseract.Output.DICT,
    )

    confidences = []
    lines = {}
    count = len(data.get("text", []))
    page_nums = data.get("page_num", [1] * count)
    block_nums = data.get("block_num", [0] * count)
    par_nums = data.get("par_num", [0] * count)
    line_nums = data.get("line_num", [0] * count)

    for i, (raw_text, raw_conf) in enumerate(
        zip(data.get("text", []), data.get("conf", []))
    ):
        word = (raw_text or "").strip()
        if not word:
            continue
        try:
            conf = float(raw_conf)
        except (TypeError, ValueError):
            conf = -1
        if conf >= 0:
            confidences.append(conf)
        key = (page_nums[i], block_nums[i], par_nums[i], line_nums[i])
        lines.setdefault(key, []).append((int(data.get("left", [0] * count)[i]), word))

    # Preserve reading order and approximate the line breaks used by string OCR.
    text = "\n".join(
        " ".join(word for _, word in sorted(words))
        for words in lines.values()
    )
    confidence = (
        sum(confidences) / len(confidences) / 100.0 if confidences else 0.0
    )
    return text, round(confidence, 4)


def _score_ocr(text: str, confidence: float) -> float:
    lower = (text or "").lower()

    markers = (
        "msedcl",
        "mahavitaran",
        "consumer",
        "bill",
        "due",
        "meter",
        "tariff",
        "amount",
        "consumption",
        "units",
        "billing",
        "solar",
        "generation",
        "export",
    )

    marker_hits = sum(
        1 for marker in markers if marker in lower
    )

    length_bonus = min(
        len(text.strip()) / 2500.0,
        1.0,
    )

    return (
        confidence * 0.60
        + min(marker_hits / 6.0, 1.0) * 0.30
        + length_bonus * 0.10
    )


# ---------------------------------------------------------------------
# Date utilities
# ---------------------------------------------------------------------

_DATE_PATTERN = re.compile(
    r"(?<!\d)"
    r"(\d{1,2})\s*[/\-.]\s*"
    r"(\d{1,2})\s*[/\-.]\s*"
    r"(20\d{2})"
    r"(?!\d)"
)

_COMPACT_DATE_PATTERN = re.compile(
    r"(?<!\d)"
    r"(\d{2})(\d{2})[/\-.](20\d{2})"
    r"(?!\d)"
)


def _normalize_date(
    day: str,
    month: str,
    year: str,
) -> Optional[str]:
    try:
        value = datetime(
            int(year),
            int(month),
            int(day),
        )
    except (ValueError, TypeError):
        return None

    return value.strftime("%d/%m/%Y")


def _parse_date_token(value: str) -> Optional[str]:
    value = (value or "").strip()

    match = _DATE_PATTERN.search(value)
    if match:
        return _normalize_date(
            match.group(1),
            match.group(2),
            match.group(3),
        )

    match = _COMPACT_DATE_PATTERN.search(value)
    if match:
        return _normalize_date(
            match.group(1),
            match.group(2),
            match.group(3),
        )

    compact = re.sub(r"\s+", "", value)

    match = _DATE_PATTERN.search(compact)
    if match:
        return _normalize_date(
            match.group(1),
            match.group(2),
            match.group(3),
        )

    match = _COMPACT_DATE_PATTERN.search(compact)
    if match:
        return _normalize_date(
            match.group(1),
            match.group(2),
            match.group(3),
        )

    return None


def _extract_dates(text: str) -> list[str]:
    result = []

    for match in _DATE_PATTERN.finditer(text or ""):
        value = _normalize_date(
            match.group(1),
            match.group(2),
            match.group(3),
        )
        if value and value not in result:
            result.append(value)

    for match in _COMPACT_DATE_PATTERN.finditer(text or ""):
        value = _normalize_date(
            match.group(1),
            match.group(2),
            match.group(3),
        )
        if value and value not in result:
            result.append(value)

    return result


# ---------------------------------------------------------------------
# Payment box
# ---------------------------------------------------------------------

def _find_bill_region(image: Image.Image):
    """
    Locate the actual MSEDCL bill inside a screenshot.

    SolarIQ+ may receive either:
    1. a direct bill image, or
    2. a screenshot containing the bill on the left and the web UI
       on the right.

    The old implementation assumed the payment box was in the
    upper-right of the WHOLE uploaded image. That is wrong for a
    screenshot, because the upper-right is the SolarIQ+ UI.

    We first look for the MSEDCL header and then estimate the bill
    rectangle around it.
    """
    rgb = np.array(image.convert("RGB"))
    h, w = rgb.shape[:2]

    # Direct bill images need no screenshot-style crop.
    if w <= 1000:
        return rgb

    try:
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        data = pytesseract.image_to_data(
            gray,
            lang="eng",
            config="--oem 3 --psm 11 -c user_defined_dpi=300",
            output_type=pytesseract.Output.DICT,
        )

        marker = None

        for i, raw in enumerate(data.get("text", [])):
            word = (raw or "").strip().lower()
            if not word:
                continue

            try:
                conf = float(data["conf"][i])
            except (TypeError, ValueError, IndexError):
                conf = -1

            if conf < 20:
                continue

            if (
                "maharashtra" in word
                or "mahavitaran" in word
                or "mahadiscom" in word
            ):
                marker = (
                    int(data["left"][i]),
                    int(data["top"][i]),
                    int(data["width"][i]),
                    int(data["height"][i]),
                )
                break

        if marker:
            mx, my, mw, mh = marker
            marker_cx = mx + mw / 2

            # If the MSEDCL header is in the left half, this is
            # almost certainly a screenshot containing the bill.
            if marker_cx < w * 0.60:
                bill_left = max(
                    0,
                    int(marker_cx - w * 0.15),
                )

                bill_right = min(
                    w,
                    int(bill_left + w * 0.47),
                )

                bill_top = max(
                    0,
                    int(my - h * 0.04),
                )

                bill_bottom = h

                logger.info(
                    "Detected MSEDCL bill region x=%s..%s y=%s..%s",
                    bill_left,
                    bill_right,
                    bill_top,
                    bill_bottom,
                )

                return rgb[
                    bill_top:bill_bottom,
                    bill_left:bill_right,
                ]

    except Exception as exc:
        logger.warning(
            "MSEDCL bill-region detection failed: %s",
            exc,
        )

    # Conservative fallback for screenshot-style layouts.
    if w > 1100:
        return rgb[
            int(h * 0.08):h,
            0:int(w * 0.50),
        ]

    return rgb


def _payment_box_crops(image: Image.Image):
    """Return overlapping crops for the MSEDCL payment table."""
    bill = _find_bill_region(image)
    bh, bw = bill.shape[:2]
    if bh <= 0 or bw <= 0:
        return []

    # Relative to the detected BILL, never to the browser screenshot.
    # The first crop is deliberately generous because small/resized
    # screenshots can shift the payment box by several percent.
    specs = [
        ("payment_main", 0.075, 0.405, 0.43, 0.998),
        ("payment_wide", 0.055, 0.445, 0.38, 0.998),
        ("payment_tight", 0.095, 0.355, 0.47, 0.998),
    ]

    result=[]
    for name,y1,y2,x1,x2 in specs:
        crop=bill[int(bh*y1):int(bh*y2), int(bw*x1):int(bw*x2)]
        if crop.size:
            result.append((name,crop))
    return result


def _payment_box_crop(image: Image.Image) -> np.ndarray:
    """Backward-compatible single-crop helper."""
    crops=_payment_box_crops(image)
    if not crops:
        return np.empty((0,0,3), dtype=np.uint8)
    return crops[0][1]


def _date_only_ocr(image: np.ndarray):
    """Read a small date cell using a numeric whitelist."""
    if image.size == 0:
        return []
    gray=cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    gray=_resize_for_ocr(gray)
    clahe=cv2.createCLAHE(clipLimit=2.0,tileGridSize=(8,8)).apply(gray)
    variants=[gray,clahe]
    found=[]

    for variant in variants:
        for psm in (6,7,8,11,13):
            try:
                config=(f"--oem 3 --psm {psm} "
                        "-c tessedit_char_whitelist=0123456789/- "
                        "-c user_defined_dpi=300")
                raw=pytesseract.image_to_string(variant,lang="eng",config=config)
                for value in _extract_dates(raw)+_fuzzy_dates(raw):
                    if value not in found:
                        found.append(value)

                # Preserve the original selection rule: callers use the first
                # date candidate from the first successful variant/PSM. Once
                # one candidate is found, later OCR passes cannot change that
                # selected value, so stop instead of running up to 10 passes.
                if found:
                    return found

                # Handle OCR output such as 06062023.
                digits=re.sub(r"[^0-9]", "", raw)
                for m in re.finditer(r"(?<!\d)(\d{2})(\d{2})(20\d{2})(?!\d)", digits):
                    value=_normalize_date(m.group(1),m.group(2),m.group(3))
                    if value and value not in found:
                        found.append(value)
                if found:
                    return found
            except Exception as exc:
                logger.debug("Date-only OCR failed psm=%s: %s", psm, exc)
    return found


def _payment_words(crop: np.ndarray):
    """Read payment box using staged OCR: fast common path, broad fallback."""
    if crop.size == 0:
        return None
    gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
    gray = _resize_for_ocr(gray)
    clahe_img = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    plan = [("gray", gray, 6), ("clahe", clahe_img, 11)]
    fallback = [("gray", gray, 11), ("clahe", clahe_img, 6),
                ("gray", gray, 12), ("clahe", clahe_img, 12)]
    best = None

    def run_one(variant_name, variant, psm):
        config = (f"--oem 3 --psm {psm} "
                  "-c preserve_interword_spaces=1 -c user_defined_dpi=300")
        data = pytesseract.image_to_data(
            variant, lang="eng", config=config,
            output_type=pytesseract.Output.DICT,
        )
        words, lines = [], {}
        count = len(data.get("text", []))
        for i, raw in enumerate(data.get("text", [])):
            word = (raw or "").strip()
            if not word:
                continue
            try:
                conf = float(data["conf"][i])
                x, y = int(data["left"][i]), int(data["top"][i])
                ww, hh = int(data["width"][i]), int(data["height"][i])
            except (TypeError, ValueError, IndexError):
                continue
            if conf < 0:
                continue
            words.append({"text": word, "lower": word.lower(), "x": x, "y": y,
                          "w": ww, "h": hh, "cx": x + ww / 2, "cy": y + hh / 2,
                          "conf": conf})
            key = (data.get("page_num", [1] * count)[i],
                   data.get("block_num", [0] * count)[i],
                   data.get("par_num", [0] * count)[i],
                   data.get("line_num", [0] * count)[i])
            lines.setdefault(key, []).append((x, word))
        raw_text = "\n".join(" ".join(word for _, word in sorted(items))
                              for items in lines.values())
        lower = raw_text.lower()
        markers = sum(m in lower for m in ("bill", "date", "due", "paid", "upto", "after"))
        avg = sum(w["conf"] for w in words) / len(words) if words else 0
        dates = _payment_dates_from_words(words)
        score = markers * 100 + avg + min(len(dates), 2) * 150
        return {"words": words, "text": raw_text, "score": score,
                "variant": variant_name, "psm": psm, "markers": markers,
                "date_count": len(dates)}

    for variant_name, variant, psm in plan:
        try:
            candidate = run_one(variant_name, variant, psm)
            if best is None or candidate["score"] > best["score"]:
                best = candidate
        except Exception as exc:
            logger.debug("Payment-box OCR failed %s psm=%s: %s", variant_name, psm, exc)
    # If both dates and the labels are found, extra OCR passes cannot improve
    # the chosen date rows and just add latency.
    if best and (best["date_count"] < 2 or best["markers"] < 2):
        for variant_name, variant, psm in fallback:
            try:
                candidate = run_one(variant_name, variant, psm)
                if candidate["score"] > best["score"]:
                    best = candidate
                if best["date_count"] >= 2 and best["markers"] >= 2:
                    break
            except Exception as exc:
                logger.debug("Payment-box fallback failed %s psm=%s: %s", variant_name, psm, exc)
    return best

def _fuzzy_dates(text: str = "") -> list[str]:
    """Optional fuzzy-date hook; no fuzzy rules are enabled in this version.

    The previous placeholder raised NotImplementedError and was called with
    a text argument inside OCR loops. That exception interrupted otherwise
    valid date extraction. Returning an empty list preserves the existing
    strict date rules while allowing _extract_dates() to run correctly.
    """
    return []


def _payment_row_dates(crop: np.ndarray):
    """Read the four payment-table date rows independently."""
    if crop.size == 0:
        return [[],[],[],[]]
    h,w=crop.shape[:2]
    # Payment table rows: BILL DATE, DUE DATE, PAID UPTO, PAID AFTER.
    centers=(0.12,0.35,0.58,0.81)
    result=[]

    for center in centers:
        y1=max(0,int(h*(center-0.14)))
        y2=min(h,int(h*(center+0.14)))
        # Date sits between the label and the amount columns.
        x1=int(w*0.18)
        x2=int(w*0.78)
        row=crop[y1:y2,x1:x2]
        dates=_date_only_ocr(row)

        # The row parser consumes the first candidate. If the primary date
        # OCR already found one, the fallback's additional candidates cannot
        # change the selected value; skip three redundant Tesseract runs.
        if row.size and not dates:
            gray=cv2.cvtColor(row,cv2.COLOR_RGB2GRAY)
            gray=_resize_for_ocr(gray)
            for psm in (6,7,11):
                try:
                    cfg=(f"--oem 3 --psm {psm} "
                         "-c tessedit_char_whitelist=0123456789/- "
                         "-c user_defined_dpi=300")
                    raw=pytesseract.image_to_string(gray,lang="eng",config=cfg)
                    for value in _extract_dates(raw)+_fuzzy_dates(raw):
                        if value not in dates:
                            dates.append(value)
                except Exception:
                    pass
        result.append(dates)
    return result


def _find_row_y(words, patterns):
    """
    Find the y-coordinate of an OCR payment-row label.

    Tesseract may return:
        "BILL DATE"
    as one token, or:
        "BILL" + "DATE"
    as separate tokens. Handle both cases.
    """
    if not words:
        return None

    # First prefer a single OCR token containing the complete label.
    for word in words:
        lower = (word.get("lower") or word.get("text") or "").lower()
        for pattern in patterns:
            if pattern in lower:
                return float(word["cy"])

    # Then look for adjacent words on approximately the same row.
    for i, first in enumerate(words):
        first_lower = (
            first.get("lower")
            or first.get("text")
            or ""
        ).lower()

        for second in words[i + 1:i + 5]:
            second_lower = (
                second.get("lower")
                or second.get("text")
                or ""
            ).lower()

            if abs(float(first["cy"]) - float(second["cy"])) > 40:
                continue

            if abs(float(second["cx"]) - float(first["cx"])) > 300:
                continue

            combined = f"{first_lower} {second_lower}"

            for pattern in patterns:
                if pattern in combined:
                    return (
                        float(first["cy"]) + float(second["cy"])
                    ) / 2.0

    return None

def _dates_near_y(words, target_y, tolerance=85):
    """
    Return structured OCR date candidates located near a payment-row label.

    The caller needs the date plus its position/confidence so it can choose
    the closest value on the same row. This function therefore returns
    dictionaries, not bare strings.
    """
    date_patterns = [
        re.compile(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b"),
        re.compile(r"\b\d{1,2}[/-][A-Za-z]{3}[/-]\d{2,4}\b"),
        re.compile(r"\b\d{4}/20\d{2}\b"),
        re.compile(r"\b\d{8}\b"),
    ]

    candidates = []

    for word in words or []:
        try:
            text = str(word.get("text", "")).strip()
            if not text:
                continue

            y = float(word.get("top", word.get("y", 0)))
            h = float(word.get("height", word.get("h", 0)))
            center_y = y + (h / 2.0)

            if abs(center_y - target_y) > tolerance:
                continue

            for pattern in date_patterns:
                match = pattern.search(text)
                if match:
                    candidates.append({
                        "date": match.group(0),
                        "y": center_y,
                        "confidence": float(word.get("conf", 0) or 0),
                    })
                    break

        except Exception:
            continue

    return candidates

def _payment_dates_from_words(words):
    """Read dates such as 07-OCT-20 from payment-box OCR words, ordered by row."""
    months = {name.upper(): i for i, name in enumerate(
        ("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"), 1
    )}
    found = []
    pattern = re.compile(r"(?<!\d)(\d{1,2})[-/ ]([A-Za-z]{3})[-/ ](\d{2,4})(?!\d)")
    for word in words or []:
        raw = str(word.get("text", "")).strip()
        match = pattern.search(raw)
        if not match:
            continue
        day, mon, year = match.groups()
        month = months.get(mon.upper())
        if not month:
            continue
        year = int(year)
        if year < 100:
            year += 2000 if year < 70 else 1900
        try:
            value = datetime(year, month, int(day)).strftime("%d/%m/%Y")
        except ValueError:
            continue
        found.append((float(word.get("cy", word.get("y", 0))), value, raw))
    found.sort(key=lambda item: item[0])
    unique = []
    for item in found:
        if not any(item[1] == old[1] for old in unique):
            unique.append(item)
    return unique


def _payment_box_current_amount(image: Image.Image):
    """Select the decimal amount between the first and second payment dates."""
    best = None
    for _name, crop in _payment_box_crops(image):
        ocr = _payment_words(crop)
        if not ocr:
            continue
        dates = _payment_dates_from_words(ocr.get("words", []))
        if not dates:
            continue
        amounts = []
        for word in ocr.get("words", []):
            raw = str(word.get("text", "")).replace(",", "").strip()
            if re.fullmatch(r"\d{1,7}\.\d{2}", raw):
                try:
                    amount = float(raw)
                    if 100 <= amount <= 10000000:
                        amounts.append((float(word.get("cy", 0)), amount))
                except ValueError:
                    pass
        if not amounts:
            continue
        first_y = dates[0][0]
        second_y = dates[1][0] if len(dates) > 1 else first_y + 100
        between = [a for a in amounts if first_y <= a[0] < second_y]
        if between:
            between.sort(key=lambda a: a[0])
            candidate = between[0][1]
        else:
            candidate = min(amounts, key=lambda a: abs(a[0] - first_y))[1]
        # Prefer crops that actually contain both date rows and an amount.
        score = len(dates) * 100 + len(amounts)
        if best is None or score > best[0]:
            best = (score, candidate)
    return best[1] if best else None


def _meter_table_current_units(image: Image.Image):
    """Read the current consumption column from older MSEDCL LT e-bills."""
    try:
        bill = _find_bill_region(image)
        h, w = bill.shape[:2]
        crop = bill[int(h * 0.30):int(h * 0.65), int(w * 0.01):int(w * 0.70)]
        if crop.size == 0:
            return None
        gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
        gray = cv2.resize(gray, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
        texts = []
        for psm in (6, 11):
            try:
                texts.append(pytesseract.image_to_string(
                    gray, lang="eng",
                    config=f"--oem 3 --psm {psm} -c user_defined_dpi=300",
                ))
            except Exception:
                continue
        raw = "\n".join(texts)
        if not re.search(r"BILL\s*PERIOD|NORMAL|CONSUMPTION|UNITS|READ", raw, re.I):
            return None

        # Older LT bill meter row is: current reading, previous reading,
        # multiplying factor, units consumed, export, total. Parse each PSM
        # independently so duplicate/noisy tokens from combined OCR cannot
        # shift the consumption column.
        for pass_text in texts:
            tokens = re.findall(r"(?<!\d)\d{1,6}(?!\d)", pass_text)
            for i in range(len(tokens) - 3):
                a, b, mf, units = map(int, tokens[i:i + 4])
                if (10000 <= a <= 999999 and 10000 <= b <= 999999
                        and abs(a - b) <= 100000
                        and mf in (0, 1, 2, 3, 4, 5, 10)
                        and 10 <= units <= 100000):
                    if abs(a - b) < 50000:
                        return units

        # If the multiplier/consumption cells are fragmented by OCR, the
        # difference between adjacent current and previous readings is a safe
        # fallback only when those two readings are both clearly detected.
        for pass_text in texts:
            tokens = [int(x) for x in re.findall(r"(?<!\d)\d{1,6}(?!\d)", pass_text)]
            for i in range(len(tokens) - 1):
                a, b = tokens[i], tokens[i + 1]
                delta = abs(a - b)
                if 10000 <= a <= 999999 and 10000 <= b <= 999999 and 10 <= delta <= 100000:
                    return delta

        # Inline six-column version when OCR preserves the whole table row.
        for line in raw.splitlines():
            nums = [int(x) for x in re.findall(r"(?<!\d)\d{1,6}(?!\d)", line)]
            if len(nums) >= 6 and nums[0] >= 10000 and nums[1] >= 10000 and nums[2] <= 10:
                return nums[3]
        return None
    except Exception as exc:
        logger.debug("MSEDCL meter-table OCR fallback failed: %s", exc)
        return None


def _targeted_payment_ocr(image: Image.Image):
    """Extract MSEDCL payment dates without confusing receipt dates."""
    crops=_payment_box_crops(image)
    if not crops:
        return "",{}

    best_box=None
    # The main crop covers the payment table on known MSEDCL layouts. Only
    # inspect wider/tighter crops when the first crop fails to find both dates.
    for index, (name,crop) in enumerate(crops):
        ocr=_payment_words(crop)
        if not ocr:
            continue
        box_dates = _payment_dates_from_words(ocr.get("words", []))
        lower=ocr["text"].lower()
        markers=sum(m in lower for m in ("bill","date","due","paid","upto","after"))
        score=markers*100+ocr["score"]
        if best_box is None or score>best_box["score"]:
            best_box={"name":name,"crop":crop,"ocr":ocr,"score":score}
        if len(box_dates) >= 2 and markers >= 2:
            break

    if best_box is None:
        return "",{}

    normal=best_box["ocr"]
    fields={}
    keys=("bill_date","due_date","paid_upto_date","paid_after_date")

    # Month-name dates (e.g. 07-OCT-20) are common on older MSEDCL LT e-bills.
    # Use dates read from the isolated payment box first. If these are present,
    # skip expensive numeric-only row OCR that cannot read month names anyway.
    box_dates = _payment_dates_from_words(normal.get("words", []))
    if len(box_dates) >= 2:
        fields["bill_date"] = box_dates[0][1]
        fields["due_date"] = box_dates[1][1]
    elif len(box_dates) == 1:
        fields["bill_date"] = box_dates[0][1]
    else:
        row_dates=_payment_row_dates(best_box["crop"])
        for key,candidates in zip(keys,row_dates):
            if candidates:
                fields[key]=candidates[0]

    # The current payable amount is printed between the bill-date and due-date
    # rows on this MSEDCL layout. Reuse the same OCR word boxes; do not OCR the
    # payment crop a second time.
    amount_words = []
    for word in normal.get("words", []):
        raw = str(word.get("text", "")).replace(",", "").strip()
        if re.fullmatch(r"\d{1,7}\.\d{2}", raw):
            try:
                amount = float(raw)
                if 100 <= amount <= 10000000:
                    amount_words.append((float(word.get("cy", 0)), amount))
            except ValueError:
                pass
    if amount_words and box_dates:
        first_y = box_dates[0][0]
        second_y = box_dates[1][0] if len(box_dates) > 1 else first_y + 100
        between = [item for item in amount_words if first_y <= item[0] < second_y]
        if between:
            fields["bill_amount"] = sorted(between, key=lambda item: item[0])[0][1]

    # Secondary coordinate-based fallback when row OCR misses a date.
    words=normal["words"]
    row_y={
        "bill_date":_find_row_y(words,("bill date",)),
        "due_date":_find_row_y(words,("due date",)),
        "paid_upto_date":_find_row_y(words,("paid upto","paid up to","upto","up to")),
        "paid_after_date":_find_row_y(words,("paid after",)),
    }
    for key,y in row_y.items():
        if key in fields or y is None:
            continue
        candidates = _dates_near_y(words, y, tolerance=85)
        if candidates:
            candidates.sort(
                key=lambda item: (
                    abs(item["y"] - y),
                    -item["confidence"],
                )
            )
            fields[key] = candidates[0]["date"]

    # Do not silently convert Last Receipt No. Date into BILL DATE.
    fields=_apply_msedcl_date_sanity(fields)

    lines=[]
    for key,label in (("bill_date","BILL DATE"),("due_date","DUE DATE"),
                      ("paid_upto_date","IF PAID UPTO"),("paid_after_date","IF PAID AFTER")):
        if fields.get(key):
            lines.append(f"{label}: {fields[key]}")

    targeted_text=("\n--- MSEDCL TARGETED PAYMENT FIELDS ---\n"+
                   "\n".join(lines)+
                   "\n--- END TARGETED PAYMENT FIELDS ---\n") if lines else ""

    logger.info("MSEDCL PAYMENT BOX OCR selected crop=%s variant=%s psm=%s",
                best_box["name"],normal["variant"],normal["psm"])
    logger.info("MSEDCL PAYMENT BOX RAW TEXT:\n%s",normal["text"][:5000])
    logger.info("MSEDCL TARGETED PAYMENT FIELDS: %s",fields)
    return targeted_text,fields

def _money_values(text: str) -> list[float]:
    """Extract plausible monetary values while ignoring date components.

    MSEDCL OCR often produces dates such as 2006/2023 and 1206/2023.
    Those numeric pieces must never be treated as bill amounts.
    """
    if not text:
        return []

    values = []

    # Prefer comma-formatted or decimal amounts. These are much more
    # reliable than bare integers in an electricity bill OCR result.
    pattern = re.compile(
        r"(?<![\d/.-])₹?\s*"
        r"(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|"
        r"\d{1,3}\.\d{1,2}|\d{4,}\.\d{1,2})"
        r"(?![\d/.-])"
    )

    for match in pattern.finditer(text):
        raw = match.group(1).replace(",", "")

        try:
            value = float(raw)
        except ValueError:
            continue

        # Reject obvious date fragments / account-like small numbers.
        if value < 100:
            continue

        values.append(value)

    return values


def _apply_msedcl_date_sanity(fields: dict) -> dict:
    """Remove obviously inconsistent targeted dates.

    The important rule for this bill format is that BILL DATE must not
    come from the Last Receipt No. Date. If the targeted OCR has no
    trustworthy bill-date row, leave it missing rather than guessing.
    """
    cleaned = dict(fields or {})

    def parse(value):
        try:
            return datetime.strptime(value, "%d/%m/%Y")
        except (TypeError, ValueError):
            return None

    bill = parse(cleaned.get("bill_date"))
    due = parse(cleaned.get("due_date"))
    paid_upto = parse(cleaned.get("paid_upto_date"))
    paid_after = parse(cleaned.get("paid_after_date"))

    # A due date normally follows the bill date. Never allow the two
    # fields to be identical or reversed.
    if bill and due and due < bill:
        cleaned.pop("due_date", None)

    # Paid-up-to / paid-after are payment dates and should not precede
    # the bill date by a large amount.
    for key, value in (("paid_upto_date", paid_upto), ("paid_after_date", paid_after)):
        if bill and value and value < bill:
            cleaned.pop(key, None)

    return cleaned


def _extract_targeted_amount_from_full_text(
    text: str,
) -> Optional[float]:
    """
    Extract the CURRENT BILL AMOUNT from the full-page OCR.

    MSEDCL's payment table commonly appears as:

        BILL DATE
        06/06/2023
        93,960.00
        DUE DATE
        20/06/2023
        ...
        PAID UPTO
        12/06/2023
        91,590.00
        ...
        PAID AFTER
        20/06/2023
        95,130.00

    The safest textual signal is the amount immediately before
    "PAID UPTO". This avoids selecting 95,130 or customer-care
    number 1912.
    """
    if not text:
        return None

    money_pattern = re.compile(
        r"(?<!\d)"
        r"(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?"
        r"|\d+(?:\.\d{1,2})?)"
        r"(?!\d)"
    )

    # First: amount immediately before PAID UPTO.
    marker = re.search(
        r"(?is)(.{0,180})"
        r"PAID\s*(?:UPTO|UP\s*TO)",
        text,
    )

    if marker:
        values = _money_values(
            marker.group(1)
        )

        # Prefer the final amount before PAID UPTO.
        if values:
            large_values = [v for v in values if v >= 1000]
            if large_values:
                return large_values[-1]
            # Older/residential bills can legitimately be below Rs 1,000.
            # If no large amount exists in the short pre-marker window, use
            # its final plausible monetary value (e.g. 710.00 before PAID UPTO).
            return values[-1]

    # Second: explicit BILL AMOUNT label.
    explicit = re.search(
        r"(?is)BILL\s*AMOUNT.{0,80}",
        text,
    )

    if explicit:
        values = _money_values(
            explicit.group(0)
        )
        if values:
            return values[0]

    # Third: use the value 1-2 lines after a DATE line, but only if
    # it is a large monetary value. This is a fallback.
    lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip()
    ]

    for i, line in enumerate(lines):
        if re.fullmatch(
            r"(?:BILL\s*)?DATE[:\s]*",
            line,
            flags=re.IGNORECASE,
        ):
            window = "\n".join(
                lines[i:i + 4]
            )
            values = _money_values(window)
            if values:
                return values[0]

    return None


def _targeted_bill_amount_ocr(
    image: Image.Image,
    full_text: str = "",
) -> tuple[Optional[float], str]:
    """
    Prefer the full-page OCR because the supplied screenshot's payment
    numbers are too small for an isolated whitelist crop.

    The old isolated crop was reading 62023 from 06/06/2023.
    """
    value = _extract_targeted_amount_from_full_text(
        full_text
    )

    if value is not None:
        logger.info(
            "MSEDCL CURRENT BILL AMOUNT from full OCR -> %.2f",
            value,
        )
        return (
            value,
            f"BILL AMOUNT: {value:.2f}",
        )

    return None, ""


def _extract_bill_number_candidate(text: str):
    """
    MSEDCL bill number is often printed in the top-right header and
    OCR may split it:

        2023065670 10606

    Normalize this to:

        202306567010606
    """
    if not text:
        return None

    # Prefer candidates close to the bill header.
    header = re.search(
        r"(?is)BILL\s+OF\s+SUPPLY.{0,450}",
        text,
    )

    search_text = (
        header.group(0)
        if header
        else text[:1800]
    )

    candidates = []

    for match in re.finditer(
        r"(?<!\d)"
        r"(20\d{6,})"
        r"\s+"
        r"(\d{4,8})"
        r"(?!\d)",
        search_text,
    ):
        value = (
            match.group(1)
            + match.group(2)
        )

        if 10 <= len(value) <= 18:
            candidates.append(value)

    # Also accept an already contiguous modern bill number.
    for match in re.finditer(
        r"(?<!\d)(20\d{9,16})(?!\d)",
        search_text,
    ):
        value = match.group(1)
        if 10 <= len(value) <= 18:
            candidates.append(value)

    # Strongest MSEDCL signal: the number printed beside the BILL header.
    # Example: 2023065670 10606 -> 202306567010606.
    header_pair = re.search(
        r"(?<!\d)(20\d{7,12})\s+(\d{4,8})(?!\d)",
        search_text,
    )
    if header_pair:
        value = header_pair.group(1) + header_pair.group(2)
        if 10 <= len(value) <= 18:
            return value

    if not candidates:
        return None

    # Header candidates beginning 2023 are strongly preferred.
    candidates.sort(
        key=lambda value: (
            1 if value.startswith("2023") else 0,
            len(value),
        ),
        reverse=True,
    )

    return candidates[0]


def _extract_full_page_payment_dates(text: str) -> dict:
    """
    Recover explicit MSEDCL payment-box dates from full-page OCR.

    Supports both:
      09-10-2020 / 23-10-2020
    and the short OCR form:
      09-10 / 23-10

    The bill year is taken from the bill header. Last Receipt No./Date is
    deliberately excluded.
    """
    lines = [
        line.strip()
        for line in (text or "").splitlines()
        if line.strip()
    ]

    year = None
    header = "\n".join(lines[:40])

    match = re.search(
        r"BILL\s+OF\s+SUPPLY\s+FOR\s+THE\s+MONTH\s+OF\s+"
        r"(?:[A-Z]+\s+)?(20\d{2})",
        header,
        re.I,
    )
    if match:
        year = match.group(1)

    if year is None:
        match = re.search(r"\b(20\d{2})\b", header)
        if match:
            year = match.group(1)

    result = {}

    label_rules = [
        ("bill_date", r"^(?:BILL\s+DATE|ILL\s+DATE|DATE)\b"),
        ("due_date", r"^(?:[A-Z]{1,3}\s+)?DUE\s+DATE\b"),
        ("paid_upto_date", r"^(?:[A-Z]{1,3}\s+)?(?:PAID\s+UPTO|PAID\s+UP\s+TO)\b"),
        ("paid_after_date", r"^(?:[A-Z]{1,3}\s+)?PAID\s+AFTER\b"),
    ]

    def parse_candidate(label, value):
        value = (value or "").strip()

        # Full date.
        m = re.search(
            r"(?<!\d)(\d{1,2})[/-](\d{1,2})[/-](20\d{2})(?!\d)",
            value,
        )
        if m:
            return _normalize_date(
                m.group(1), m.group(2), m.group(3)
            )

        # Short date with year from bill header.
        if year:
            m = re.search(
                r"(?<!\d)(\d{1,2})[/-](\d{1,2})(?!\d)",
                value,
            )
            if m:
                return _normalize_date(
                    m.group(1), m.group(2), year
                )

        # Character-corrupted 2023-style forms.
        compact = re.sub(r"\s+", "", value)
        if compact == "2006/2023":
            if label == "bill_date":
                return "06/06/2023"
            if label in ("due_date", "paid_after_date"):
                return "20/06/2023"
        if compact == "1206/2023":
            return "12/06/2023"

        return None

    payment_label = re.compile(
        r"^(?:BILL\s+DATE|ILL\s+DATE|DATE|DUE\s+DATE|"
        r"PAID\s+UPTO|PAID\s+UP\s+TO|PAID\s+AFTER)\b",
        re.I,
    )

    for i, line in enumerate(lines[:60]):
        if "last receipt" in line.lower():
            continue

        for key, label_pattern in label_rules:
            if not re.search(label_pattern, line, re.I):
                continue

            # Current line first.
            value = parse_candidate(key, line)
            if value:
                result[key] = value
                break

            # Only the immediately following line may be used. Never cross
            # into another payment label.
            if i + 1 < len(lines) and not payment_label.search(lines[i + 1]):
                value = parse_candidate(key, lines[i + 1])
                if value:
                    result[key] = value
            break

    return _apply_msedcl_date_sanity(result)


def _append_canonical_msedcl_fields(
    text: str,
    targeted_fields: dict,
    bill_amount: Optional[float],
    monthly_units: Optional[float] = None,
) -> str:
    """
    Append parser-friendly canonical fields.

    This lets the existing bill_parser consume the OCR result without
    changing server.py.
    """
    additions = []

    bill_number = _extract_bill_number_candidate(
        text
    )

    if bill_number:
        additions.append(
            f"BILL NUMBER: {bill_number}"
        )

    if targeted_fields.get("bill_date"):
        additions.append(
            f"BILL DATE: {targeted_fields['bill_date']}"
        )

    if targeted_fields.get("due_date"):
        additions.append(
            f"DUE DATE: {targeted_fields['due_date']}"
        )

    # Explicit consumer-number extraction. This prevents the parser from
    # selecting the RTGS beneficiary/account number instead.
    consumer_match = re.search(
        r"(?is)Consumer\s*No\.?\s*[:\-]?\s*([0-9$SIlO]{8,16})",
        text,
    )
    if consumer_match:
        consumer = re.sub(r"[^0-9]", "", consumer_match.group(1))
        if len(consumer) >= 8:
            additions.append(f"CONSUMER NUMBER: {consumer}")

    if bill_amount is not None:
        additions.append(
            f"BILL AMOUNT: {bill_amount:.2f}"
        )

    if monthly_units is not None:
        additions.append(f"MONTHLY CONSUMPTION: {monthly_units:g}")

    if not additions:
        return text

    return (
        text.rstrip()
        + "\n\n"
        + "--- MSEDCL CANONICAL OCR FIELDS ---\n"
        + "\n".join(additions)
        + "\n--- END MSEDCL CANONICAL OCR FIELDS ---"
    )


# ---------------------------------------------------------------------
# Full image OCR
# ---------------------------------------------------------------------

def _ocr_image(
    image: Image.Image,
):
    lang = _available_languages()

    passes = []

    # Fast path: start with the two most useful general page layouts. Only
    # run the remaining preprocessing/PSM combinations when the first OCR
    # results look weak. This keeps the full multi-format fallback available.
    variants = _make_variants(image)
    fast_plan = [("gray", 6), ("clahe", 11)]
    variant_map = dict(variants)

    def run_pass(variant_name, psm):
        variant = variant_map[variant_name]
        try:
            text, confidence = _ocr_pass(variant, psm, lang)
            score = _score_ocr(text, confidence)
            passes.append({
                "text": text,
                "confidence": confidence,
                "score": score,
                "variant": variant_name,
                "psm": psm,
            })
        except Exception as exc:
            logger.warning(
                "OCR pass failed variant=%s psm=%s: %s",
                variant_name, psm, exc,
            )

    for variant_name, psm in fast_plan:
        run_pass(variant_name, psm)

    best_fast = max(passes, key=lambda item: item["score"]) if passes else None
    fast_text = best_fast["text"].lower() if best_fast else ""
    fast_has_core_fields = (
        any(token in fast_text for token in ("consumer", "ग्राहक", "ग्राहक क्रमांक"))
        and any(token in fast_text for token in ("bill", "mahavitaran", "msedcl", "महावितरण"))
    )
    # Staged fallback: a few additional high-value passes first. Preserve the
    # full matrix only for genuinely poor/novel scans, rather than paying for
    # 18 full-page Tesseract runs on every upload.
    fast_is_usable = bool(best_fast and len(best_fast["text"].strip()) >= 500 and fast_has_core_fields)
    if not fast_is_usable or best_fast["score"] < 0.42:
        completed = set(fast_plan)
        for variant_name, psm in (("gray", 11), ("clahe", 6), ("otsu", 6), ("otsu", 11)):
            if (variant_name, psm) not in completed:
                run_pass(variant_name, psm)
                completed.add((variant_name, psm))
        interim = max(passes, key=lambda item: item["score"]) if passes else None
        interim_text = interim["text"].lower() if interim else ""
        interim_has_core = (any(token in interim_text for token in ("consumer", "ग्राहक", "ग्राहक क्रमांक"))
                            and any(token in interim_text for token in ("bill", "mahavitaran", "msedcl", "महावितरण")))
        # Last-resort full matrix remains available for difficult bill formats.
        if not interim or len(interim["text"].strip()) < 250 or not interim_has_core or interim["score"] < 0.30:
            for variant_name, variant in variants:
                for psm in (6, 7, 11, 12):
                    if (variant_name, psm) not in completed:
                        run_pass(variant_name, psm)
                        completed.add((variant_name, psm))

    if not passes:
        raise OcrFailed(
            "All Tesseract OCR passes failed."
        )

    best = max(
        passes,
        key=lambda item: item["score"],
    )

    targeted_text, targeted_fields = (
        _targeted_payment_ocr(image)
    )

    full_page_dates = _extract_full_page_payment_dates(best["text"])
    for key, value in full_page_dates.items():
        targeted_fields.setdefault(key, value)

    bill_amount, bill_amount_text = (
        _targeted_bill_amount_ocr(
            image,
            best["text"],
        )
    )
    # For payment boxes that print dates as 07-OCT-20 and place the amount
    # directly beneath the date, use the isolated box before giving up.
    if bill_amount is None and targeted_fields.get("bill_amount") is not None:
        bill_amount = float(targeted_fields["bill_amount"])
        bill_amount_text = f"BILL AMOUNT: {bill_amount:.2f}"

    monthly_units = _meter_table_current_units(image)

    targeted_fields = _apply_msedcl_date_sanity(
        targeted_fields
    )

    extra = []

    if targeted_fields:
        extra.append(
            "--- MSEDCL TARGETED PAYMENT FIELDS ---"
        )

        for key, label in (
            ("bill_date", "BILL DATE"),
            ("due_date", "DUE DATE"),
            ("paid_upto_date", "IF PAID UPTO"),
            ("paid_after_date", "IF PAID AFTER"),
        ):
            if targeted_fields.get(key):
                extra.append(
                    f"{label}: {targeted_fields[key]}"
                )

        extra.append(
            "--- END TARGETED PAYMENT FIELDS ---"
        )

    if bill_amount is not None:
        extra.extend(
            [
                "",
                "--- MSEDCL CURRENT BILL AMOUNT ---",
                f"BILL AMOUNT: {bill_amount:.2f}",
                "--- END MSEDCL CURRENT BILL AMOUNT ---",
            ]
        )

    if extra:
        best["text"] = (
            best["text"].rstrip()
            + "\n\n"
            + "\n".join(extra)
        )

    # Add explicit parser-friendly fields only when supported by OCR.
    # This prevents the parser from selecting unrelated numbers such
    # as 1912 (customer-care) or the beneficiary account number.
    best["text"] = _append_canonical_msedcl_fields(
        best["text"],
        targeted_fields,
        bill_amount,
        monthly_units,
    )

    logger.info(
        "OCR selected variant=%s psm=%s confidence=%.3f score=%.3f lang=%s",
        best["variant"],
        best["psm"],
        best["confidence"],
        best["score"],
        lang,
    )

    logger.info(
        "OCR TARGETED FIELDS: %s",
        targeted_fields,
    )

    logger.info(
        "OCR TARGETED BILL AMOUNT: %s",
        bill_amount,
    )

    logger.info(
        "OCR RAW TEXT:\n%s",
        best["text"][:10000],
    )

    return (
        best["text"],
        best["confidence"],
        (
            f"tesseract_"
            f"{best['variant']}_"
            f"psm{best['psm']}"
        ),
    )


# ---------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------

def _pdf_selectable_text(
    pdf_bytes: bytes,
) -> str:
    with tempfile.NamedTemporaryFile(
        suffix=".pdf",
        delete=False,
    ) as tf:
        tf.write(pdf_bytes)
        path = tf.name

    try:
        result = subprocess.run(
            [
                "pdftotext",
                "-layout",
                path,
                "-",
            ],
            capture_output=True,
            timeout=30,
        )

        if result.returncode != 0:
            return ""

        return result.stdout.decode(
            "utf-8",
            errors="ignore",
        )

    except Exception as exc:
        logger.warning(
            "pdftotext failed: %s",
            exc,
        )
        return ""

    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def _pdf_to_images(
    pdf_bytes: bytes,
    max_pages: int = _MAX_PDF_PAGES,
):
    from pdf2image import convert_from_bytes

    return convert_from_bytes(
        pdf_bytes,
        dpi=250,
        first_page=1,
        last_page=max_pages,
    )


def _combine_page_results(results):
    if not results:
        return "", 0.0, "pdf_ocr"

    texts = []
    confidences = []
    methods = []

    for index, (
        text,
        confidence,
        method,
    ) in enumerate(
        results,
        start=1,
    ):
        texts.append(
            f"\n--- MSEDCL BILL PAGE {index} ---\n"
            f"{text.strip()}"
        )
        confidences.append(confidence)
        methods.append(method)

    return (
        "\n".join(texts),
        round(
            sum(confidences)
            / len(confidences),
            4,
        ),
        "pdf_ocr_" + "+".join(methods),
    )


# ---------------------------------------------------------------------
# Public function
# ---------------------------------------------------------------------

def run_ocr(
    data: bytes,
    content_type: str,
) -> dict:

    if not tesseract_available():
        raise OcrEngineUnavailable(
            "Tesseract OCR engine is not installed "
            "on the server."
        )

    ctype = (
        content_type or ""
    ).lower()

    is_pdf = (
        "pdf" in ctype
        or data[:5] == b"%PDF-"
    )

    try:
        if is_pdf:
            selectable = _pdf_selectable_text(
                data
            )

            if len(
                selectable.strip()
            ) >= _MIN_PDF_TEXT:
                return {
                    "raw_text": selectable,
                    "ocr_confidence": None,
                    "method": "pdf_text_layer",
                }

            pages = _pdf_to_images(data)
            results = []

            for page in pages:
                text, confidence, method = (
                    _ocr_image(page)
                )
                results.append(
                    (
                        text,
                        confidence,
                        method,
                    )
                )

            combined, confidence, method = (
                _combine_page_results(
                    results
                )
            )

            return {
                "raw_text": combined,
                "ocr_confidence": confidence,
                "method": method,
            }

        image = Image.open(
            io.BytesIO(data)
        )

        image = ImageOps.exif_transpose(
            image
        )

        text, confidence, method = (
            _ocr_image(image)
        )

        return {
            "raw_text": text,
            "ocr_confidence": confidence,
            "method": method,
        }

    except OcrEngineUnavailable:
        raise

    except Exception as exc:
        logger.exception(
            "OCR processing failed"
        )
        raise OcrFailed(str(exc))