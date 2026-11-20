#!/usr/bin/env python3
import argparse
import datetime as _dt
import json
import re
import zipfile
import xml.etree.ElementTree as ET


NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
}

CELL_RE = re.compile(r"([A-Z]+)([0-9]+)")


def col_to_index(col: str) -> int:
    idx = 0
    for ch in col:
        idx = idx * 26 + (ord(ch) - 64)
    return idx - 1


def normalize_value(v):
    if v is None:
        return ""
    if isinstance(v, str):
        s = v.strip()
        if s.upper() == "NIL":
            return ""
        return s
    return v


def try_float(v: str):
    try:
        return float(v)
    except Exception:
        return None


def excel_serial_to_date_iso(v: str):
    """
    Excel serial date (Windows): days since 1899-12-30.
    Return YYYY-MM-DD or None.
    """
    f = try_float(v)
    if f is None:
        # Allow already-ISO values
        s = normalize_value(v)
        if re.match(r"^\\d{4}-\\d{2}-\\d{2}$", s):
            return s
        return None
    if f <= 0:
        return None
    base = _dt.datetime(1899, 12, 30)
    d = base + _dt.timedelta(days=f)
    return d.date().isoformat()


def compute_status(end_date_iso, raw_status):
    raw = (raw_status or "").strip().lower()
    if end_date_iso:
        try:
            end_d = _dt.date.fromisoformat(end_date_iso)
            today = _dt.date.today()
            if end_d < today:
                return "expired"
            if (end_d - today).days <= 30:
                return "expiring"
            return "active"
        except Exception:
            pass
    if "active" in raw:
        return "active"
    if "expir" in raw:
        return "expiring"
    if "expired" in raw:
        return "expired"
    return "none"


def parse_xlsx_rows(xlsx_path: str):
    with zipfile.ZipFile(xlsx_path) as z:
        shared_strings = []
        try:
            sst = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in sst.findall("main:si", NS):
                # Handle rich text by concatenating all <t>
                texts = [t.text or "" for t in si.findall(".//main:t", NS)]
                shared_strings.append("".join(texts))
        except KeyError:
            shared_strings = []

        sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))

        rows = []
        max_col = 0
        for row in sheet.findall(".//main:sheetData/main:row", NS):
            r_idx = int(row.attrib.get("r", "0") or "0")
            values = {}
            for c in row.findall("main:c", NS):
                ref = c.attrib.get("r")
                if not ref:
                    continue
                m = CELL_RE.match(ref)
                if not m:
                    continue
                col_letters, _row_num = m.groups()
                col_idx = col_to_index(col_letters)
                max_col = max(max_col, col_idx)

                t = c.attrib.get("t")
                v_el = c.find("main:v", NS)
                if v_el is None:
                    continue
                v = v_el.text or ""
                if t == "s":
                    try:
                        v = shared_strings[int(v)]
                    except Exception:
                        pass
                values[col_idx] = v
            rows.append((r_idx, values))

        # Dense, ordered
        dense = []
        for r_idx, vals in rows:
            arr = [""] * (max_col + 1)
            for k, v in vals.items():
                arr[k] = v
            dense.append((r_idx, arr))
        dense.sort(key=lambda x: x[0])
        return dense


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx_path")
    args = ap.parse_args()

    dense_rows = parse_xlsx_rows(args.xlsx_path)
    if not dense_rows:
        print(json.dumps({"sheet": "Customers", "totalRows": 0, "rows": []}, ensure_ascii=False))
        return

    header = [normalize_value(v) for v in dense_rows[0][1]]
    header = [h if h else f"COL_{i+1}" for i, h in enumerate(header)]

    def get(row_dict, key):
        return normalize_value(row_dict.get(key, ""))

    out_rows = []
    for r_idx, arr in dense_rows[1:]:
        row_dict = {header[i]: normalize_value(arr[i]) for i in range(len(header))}

        customer_name = get(row_dict, "Customer Name*") or get(row_dict, "Customer Name")
        product = get(row_dict, "Product")
        licence_type = get(row_dict, "License Type")
        license_serial = get(row_dict, "License Serial No ") or get(row_dict, "License Serial No") or get(row_dict, "License Serial No")

        amc_status_raw = get(row_dict, "AMC Status")
        amc_start = excel_serial_to_date_iso(get(row_dict, "AMC Start Date"))
        amc_end = excel_serial_to_date_iso(get(row_dict, "AMC End Date"))
        amc_value_raw = get(row_dict, "AMC Value")
        amount = None
        if amc_value_raw:
            f = try_float(amc_value_raw.replace(",", ""))
            if f is not None:
                amount = f

        status = compute_status(amc_end, amc_status_raw)

        out_rows.append(
            {
                "sourceRow": r_idx,
                "sno": get(row_dict, "S.No") or get(row_dict, "S.No."),
                "customerName": customer_name,
                "contactName": get(row_dict, "Contact Name1*") or get(row_dict, "Contact Name1"),
                "mobile": get(row_dict, "Mobile*") or get(row_dict, "Mobile"),
                "email": get(row_dict, "Email"),
                "product": product,
                "licenceType": licence_type,
                "licenseSerialNo": license_serial,
                "amcStatusRaw": amc_status_raw,
                "status": status,
                "amcStartDate": amc_start,
                "amcEndDate": amc_end,
                "amount": amount,
                "agreementStatus": get(row_dict, "Agreement Status"),
                "customerType": get(row_dict, "Customer Type"),
                "release": get(row_dict, "Release"),
                "notes": get(row_dict, "Notes/Remarks"),
            }
        )

    print(
        json.dumps(
            {"sheet": "Customers", "totalRows": len(out_rows), "rows": out_rows},
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
