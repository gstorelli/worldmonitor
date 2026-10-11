"""Filter a full TARIC measures export (xlsx) to the CN codes of the thesis strategic goods.

Usage: python filter_taric.py <taric_measures.xlsx> <out.csv>
The export of 5 October 2026 was supplied by the author (TARIC consultation, European
Commission); the filtered file is out/taric_measures_20261005_thesis_goods.csv.
TARIC is not downloaded automatically: there is no stable public API.
"""
import csv
import sys

import openpyxl

PREFIXES = ("1001", "2603", "2604", "2709", "2710", "2711", "3102", "3105", "720260",
            "7403", "7501", "7502", "7601", "8542")


def main(src, dst):
    wb = openpyxl.load_workbook(src, read_only=True)
    n, header = 0, None
    with open(dst, "w", newline="") as f:
        w = csv.writer(f)
        for ws in wb.worksheets:
            for i, row in enumerate(ws.iter_rows(values_only=True)):
                if i == 0:
                    if header is None:
                        header = row
                        w.writerow(header)
                    continue
                if row and row[0] and str(row[0]).startswith(PREFIXES):
                    w.writerow(row)
                    n += 1
    print(f"taric: {n} measures kept")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
