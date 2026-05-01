"""
One-shot import of Glenn's iCloud "Gettahome" contacts directly to Supabase.

Bypasses the CRM UI's vCard parser (which had an Apple-itemN-prefix bug)
and writes records straight to the contacts table via the service-role key.

Each contact gets:
  source       = "icloud_glenn"
  tags         = ["getahome"]
  status       = "new"
  temperature  = "warm"

Dedup is done in-memory by (lowercased-name, normalized-phone). Doesn't
dedup against existing rows — re-running will create duplicates of any
phone-only rows (Supabase upsert keys on email which these don't have).
"""
import os
import re
import sys
import json
import urllib.request
import urllib.error
from pathlib import Path

VCF_PATH = Path(__file__).parent / "glenn_getahome.vcf"
SUPABASE_URL = "https://jzivferpxlbegrxghqpr.supabase.co"
SERVICE_KEY = os.environ["SB_SERVICE_KEY"]
TAGS = ["getahome"]
SOURCE = "icloud_glenn"


def parse_vcards(text: str):
    # Unfold continuation lines
    text = re.sub(r"\r?\n[ \t]", "", text)
    cards = []
    cur = None
    for raw in text.split("\n"):
        line = raw.strip()
        if not line:
            continue
        if line.upper() == "BEGIN:VCARD":
            cur = {}
            continue
        if line.upper() == "END:VCARD":
            if cur:
                cards.append(cur)
            cur = None
            continue
        if cur is None:
            continue
        if ":" not in line:
            continue
        left, _, value = line.partition(":")
        segs = left.split(";")
        # Strip Apple itemN. grouping prefix
        prop = re.sub(r"^item\d+\.", "", segs[0], flags=re.IGNORECASE).upper()
        if prop in ("PHOTO", "X-ADDRESSING-GRAMMAR") or prop.startswith("X-"):
            continue
        cur.setdefault(prop, []).append(value.strip())
    return cards


def first(d, key):
    v = d.get(key) or []
    return v[0] if v else ""


def normalize_phone(s: str) -> str:
    if not s:
        return ""
    return re.sub(r"\s+", "", s)


def build_row(vc):
    fn = first(vc, "FN") or ""
    n = first(vc, "N")
    last, first_n = "", ""
    parts = n.split(";")
    if len(parts) >= 2:
        last, first_n = parts[0].strip(), parts[1].strip()
    name = fn.strip() or f"{first_n} {last}".strip()
    if not name:
        return None
    phone = normalize_phone(first(vc, "TEL"))
    org = first(vc, "ORG").split(";")[0].strip() or None
    return {
        "name": name,
        "full_name": name,
        "first_name": first_n or None,
        "phone": phone or None,
        "source": SOURCE,
        "status": "new",
        "temperature": "warm",
        "tags": TAGS,
        # iCloud "Gettahome" group ⇒ all of these are referrals; mark as warm
    }


def main():
    if not VCF_PATH.exists():
        print(f"vCard file not found: {VCF_PATH}", file=sys.stderr)
        sys.exit(1)
    text = VCF_PATH.read_text(encoding="utf-8")
    cards = parse_vcards(text)
    print(f"Parsed {len(cards)} VCARD blocks")

    rows, seen = [], set()
    skipped = 0
    for vc in cards:
        r = build_row(vc)
        if not r:
            skipped += 1
            continue
        key = (r["name"].lower().strip(), r.get("phone") or "")
        if key in seen:
            continue
        seen.add(key)
        rows.append(r)
    print(f"After dedup: {len(rows)} unique contacts (skipped {skipped} unnameable)")

    # Insert in batches of 100
    inserted, errors = 0, []
    for i in range(0, len(rows), 100):
        batch = rows[i : i + 100]
        body = json.dumps(batch).encode("utf-8")
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/contacts",
            data=body,
            method="POST",
            headers={
                "apikey": SERVICE_KEY,
                "Authorization": f"Bearer {SERVICE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                if 200 <= resp.status < 300:
                    inserted += len(batch)
                    print(f"  batch {i // 100 + 1}: +{len(batch)} ({inserted} total)")
                else:
                    errors.append(f"batch {i // 100 + 1}: HTTP {resp.status}")
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")[:500]
            errors.append(f"batch {i // 100 + 1}: HTTP {e.code} - {err_body}")
        except Exception as e:
            errors.append(f"batch {i // 100 + 1}: {e}")

    print()
    print(f"Inserted: {inserted}")
    if errors:
        print(f"Errors ({len(errors)}):")
        for e in errors:
            print(f"  - {e}")
    else:
        print("All batches succeeded.")


if __name__ == "__main__":
    main()
