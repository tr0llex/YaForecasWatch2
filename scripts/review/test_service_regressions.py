"""Run production service functions with deterministic host mocks.

These tests cover state transitions, not firmware ABI or integration.
"""
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]



def function(source, name):
    match = re.search(r"^(?:static )?(?:void|int|uint32_t) " + name + r"\([^\n]*\) \{", source, re.M)
    if not match:
        raise AssertionError("Missing production function: " + name)
    start = match.start()
    opening = source.index("{", start)
    depth = 1
    end = opening + 1
    while depth:
        depth += (source[end] == "{") - (source[end] == "}")
        end += 1
    return source[start:end]


def run_c(code):
    with tempfile.TemporaryDirectory() as directory:
        source = Path(directory, "test.c")
        binary = Path(directory, "test")
        source.write_text(code)
        subprocess.run(["cc", "-std=c11", str(source), "-o", str(binary)], check=True)
        subprocess.run([str(binary)], check=True)
