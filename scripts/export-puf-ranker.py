#!/usr/bin/env python3
"""Export one pinned PUF checkpoint as passive JSON, without pickle execution.

This is a one-time, standard-library-only conversion tool, not an inference
server. It never invokes pickle.load, joblib.load, imported model code, or a
constructor named by the serialized file. Recognized pickle globals remain
tags; REDUCE and NEWOBJ are interpreted only as explicit numeric data formats.
The source files are read-only and output paths must not already exist.
"""

import argparse
from collections import Counter
import csv
from dataclasses import dataclass, field
import hashlib
import io
import json
import math
from pathlib import Path
import pickletools
import struct
import zipfile


CHECKPOINT_SHA256 = "c0fb39463be5468a2a20739a1838f4ed1a4405003b8914e71eec82984739c34e"
MODEL_SOURCE_SHA256 = "aefb98bd0c343982dbbc0ec2e44f3d52354794b1448586bf1bc43ce246645f69"
ORIGINAL_REFERENCE_SHA256 = "62851bee43beb3484bec54ab7b5d0e78f2aea96cf6dd452d6f2ee65eec843142"
REFERENCE_SHA256 = "2b981a33277b03de9a6542f27baf6c56626ec3f21c774f017cb5880ac05b32f9"
ALPHABET = "ACDEFGHIKLMNPQRSTVWY"
ROOT = "igem_module2/"
MEMBERS = {
    "checkpoint": ROOT + "puf_reuse/weights/PUF_ESM_Specificity_Ranker.joblib",
    "modelSource": ROOT + "puf_reuse/model.py",
    "reference": ROOT + "wiki/ablation_experiment/inputs/reference.json",
    "examples": ROOT + "puf_reuse/examples/example.fasta",
    "expected": ROOT + "puf_reuse/examples/expected_predictions.csv",
}
ALLOWED_GLOBALS = {
    ("sklearn.linear_model._ridge", "Ridge"),
    ("joblib.numpy_pickle", "NumpyArrayWrapper"),
    ("numpy", "ndarray"),
    ("numpy", "dtype"),
    ("numpy.core.multiarray", "scalar"),
    ("numpy._core.multiarray", "scalar"),
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha256(value):
    return hashlib.sha256(value).hexdigest()


@dataclass(frozen=True)
class GlobalTag:
    module: str
    name: str


@dataclass
class DataBox:
    kind: str
    args: tuple = ()
    state: object = field(default_factory=dict)


@dataclass
class NumericArray:
    shape: tuple
    dtype: str
    values: list


def numeric_format(dtype):
    require(isinstance(dtype, DataBox) and dtype.kind == "dtype", "Expected passive dtype")
    require(dtype.state == (3, "<", None, None, None, -1, -1, 0), "Unsupported dtype metadata")
    require(dtype.args in (("f8", False, True), ("i4", False, True)), "Unsupported numeric dtype")
    return {"f8": ("d", 8), "i4": ("i", 4)}[dtype.args[0]]


class PassiveJoblibReader:
    """Minimal data interpreter for the pinned protocol-4 joblib layout only."""

    def __init__(self, raw):
        require(sha256(raw) == CHECKPOINT_SHA256, "Checkpoint SHA-256 mismatch; refusing to parse")
        self.file = io.BytesIO(raw)
        self.size = len(raw)
        self.stack = []
        self.memo = {}
        self.mark = object()
        self.globals = set()
        self.opcodes = Counter()
        self.arrays = []
        self.frames = []

    def marked(self):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index] is self.mark:
                values = self.stack[index + 1:]
                del self.stack[index:]
                return values
        raise ValueError("Missing pickle mark")

    def array(self, wrapper):
        state = wrapper.state
        require(isinstance(state, dict), "Invalid array metadata")
        require(set(state) == {"subclass", "shape", "order", "dtype", "allow_mmap", "numpy_array_alignment_bytes"}, "Unexpected array fields")
        require(state["subclass"] == GlobalTag("numpy", "ndarray"), "Unexpected array subclass")
        require(state["order"] == "C" and state["allow_mmap"] is True, "Unexpected array layout")
        require(state["numpy_array_alignment_bytes"] == 16, "Unexpected array alignment")
        shape = state["shape"]
        require(isinstance(shape, tuple) and 1 <= len(shape) <= 2 and all(type(n) is int and 0 < n <= 20_000 for n in shape), "Invalid array shape")
        count = math.prod(shape)
        require(count <= 20_000, "Array exceeds bounded export size")
        code, item_size = numeric_format(state["dtype"])
        padding_byte = self.file.read(1)
        require(len(padding_byte) == 1, "Missing array padding length")
        padding = padding_byte[0]
        require(padding <= 16 and self.file.read(padding) == b"\xff" * padding, "Invalid array padding")
        offset = self.file.tell()
        require(offset % 16 == 0, "Unaligned array data")
        raw = self.file.read(count * item_size)
        require(len(raw) == count * item_size, "Truncated numeric array")
        values = list(struct.unpack("<" + str(count) + code, raw))
        require(all(math.isfinite(x) for x in values), "Nonfinite array value")
        dtype = state["dtype"].args[0]
        self.arrays.append({"offset": offset, "shape": list(shape), "dtype": dtype, "bytes": len(raw)})
        return NumericArray(shape, dtype, values)

    def load(self):
        # genops parses syntax only. Its stream is advanced over array bytes by
        # array(); no serialized opcode or global is ever dispatched as Python.
        for op, arg, position in pickletools.genops(self.file):
            name = op.name
            self.opcodes[name] += 1
            require(sum(self.opcodes.values()) <= 10_000, "Opcode budget exceeded")
            if name == "PROTO":
                require(position == 0 and arg == 4, "Expected protocol 4")
            elif name == "FRAME":
                require(0 <= arg <= self.size - self.file.tell(), "Invalid pickle frame")
                self.frames.append({"offset": self.file.tell(), "length": arg})
            elif name == "MARK":
                self.stack.append(self.mark)
            elif name == "EMPTY_DICT":
                self.stack.append({})
            elif name == "EMPTY_LIST":
                self.stack.append([])
            elif name == "EMPTY_TUPLE":
                self.stack.append(())
            elif name in ("SHORT_BINUNICODE", "BINUNICODE", "BINUNICODE8", "BININT", "BININT1", "BININT2", "BINFLOAT", "SHORT_BINBYTES", "BINBYTES"):
                self.stack.append(arg)
            elif name in ("NONE", "NEWTRUE", "NEWFALSE"):
                self.stack.append({"NONE": None, "NEWTRUE": True, "NEWFALSE": False}[name])
            elif name == "MEMOIZE":
                self.memo[len(self.memo)] = self.stack[-1]
            elif name in ("BINGET", "LONG_BINGET"):
                require(arg in self.memo, "Invalid memo index")
                self.stack.append(self.memo[arg])
            elif name == "STACK_GLOBAL":
                global_name, module = self.stack.pop(), self.stack.pop()
                require((module, global_name) in ALLOWED_GLOBALS, "Forbidden serialized global")
                self.globals.add(module + "." + global_name)
                self.stack.append(GlobalTag(module, global_name))
            elif name == "NEWOBJ":
                args, tag = self.stack.pop(), self.stack.pop()
                require(isinstance(tag, GlobalTag) and args == (), "Unexpected serialized constructor")
                require((tag.module, tag.name) in {("sklearn.linear_model._ridge", "Ridge"), ("joblib.numpy_pickle", "NumpyArrayWrapper")}, "Forbidden serialized constructor")
                self.stack.append(DataBox(tag.name))
            elif name == "REDUCE":
                args, tag = self.stack.pop(), self.stack.pop()
                require(isinstance(tag, GlobalTag) and isinstance(args, tuple), "Unexpected reduction")
                if tag == GlobalTag("numpy", "dtype"):
                    require(args in (("f8", False, True), ("i4", False, True)), "Unsupported dtype reduction")
                    self.stack.append(DataBox("dtype", args))
                elif tag.name == "scalar" and tag.module in ("numpy.core.multiarray", "numpy._core.multiarray"):
                    require(len(args) == 2 and isinstance(args[1], bytes), "Invalid numeric scalar")
                    code, size = numeric_format(args[0])
                    require(len(args[1]) == size, "Invalid scalar byte count")
                    self.stack.append(struct.unpack("<" + code, args[1])[0])
                else:
                    raise ValueError("Forbidden serialized reduction")
            elif name == "BUILD":
                state = self.stack.pop()
                value = self.stack[-1]
                require(isinstance(value, DataBox), "BUILD is limited to passive data containers")
                value.state = state
                if value.kind == "NumpyArrayWrapper":
                    self.stack[-1] = self.array(value)
                elif value.kind == "dtype":
                    numeric_format(value)
                else:
                    require(value.kind == "Ridge" and isinstance(state, dict), "Unsupported object state")
            elif name == "TUPLE":
                self.stack.append(tuple(self.marked()))
            elif name in ("TUPLE1", "TUPLE2", "TUPLE3"):
                count = int(name[-1])
                values = tuple(self.stack[-count:])
                del self.stack[-count:]
                self.stack.append(values)
            elif name == "SETITEMS":
                values = self.marked()
                require(isinstance(self.stack[-1], dict) and len(values) % 2 == 0, "Invalid dictionary state")
                for key, value in zip(values[::2], values[1::2]):
                    require(isinstance(key, (str, int)), "Unexpected dictionary key")
                    self.stack[-1][key] = value
            elif name == "SETITEM":
                value, key = self.stack.pop(), self.stack.pop()
                require(isinstance(self.stack[-1], dict) and isinstance(key, (str, int)), "Invalid dictionary item")
                self.stack[-1][key] = value
            elif name == "APPENDS":
                values = self.marked()
                require(isinstance(self.stack[-1], list), "Invalid list")
                self.stack[-1].extend(values)
            elif name == "APPEND":
                value = self.stack.pop()
                require(isinstance(self.stack[-1], list), "Invalid list item")
                self.stack[-1].append(value)
            elif name == "STOP":
                require(len(self.stack) == 1 and self.file.tell() == self.size, "Unexpected trailing data or stack state")
                return self.stack[0]
            else:
                raise ValueError("Unsupported opcode: " + name)
        raise ValueError("Missing STOP")


def finite_number(value, label):
    require(type(value) in (int, float) and math.isfinite(value), "Invalid " + label)
    return value


def predict_sequence(sequence, reference, logp, fits):
    require(len(sequence) == len(reference) and set(sequence) <= set(ALPHABET), "Invalid example protein")
    columns, score = [], 0.0
    for index, (wild, mutant) in enumerate(zip(reference, sequence)):
        if wild != mutant:
            a, b = ALPHABET.index(wild), ALPHABET.index(mutant)
            score += logp[index][b] - logp[index][a]
            columns.extend(sorted([(index * 20 + a, -1.0), (index * 20 + b, 1.0)]))
    outputs = {}
    for fit in fits:
        linear = 0.0
        for column, value in columns:
            linear += value * fit["oneHotCoefficients"][column]
        standardized = (score - fit["mean"]) / fit["std"] * fit["weight"]
        outputs[fit["assay"] + "_hat"] = linear + standardized * fit["esmCoefficient"] + fit["intercept"]
    outputs["ESM2_score"] = score
    outputs["S_hat"] = outputs["C388_hat"] - (outputs["C295_hat"] + outputs["C871_hat"]) / 2
    return outputs


def make_export(source):
    require(sha256(source["modelSource"]) == MODEL_SOURCE_SHA256, "Model source checksum mismatch")
    reader = PassiveJoblibReader(source["checkpoint"])
    bundle = reader.load()
    require(isinstance(bundle, dict), "Checkpoint must be a dictionary")
    reference = bundle["reference"]
    require(reference == json.loads(source["reference"])["reference"], "Reference sources disagree")
    require(len(reference) == 493 and reference[-1] == "G" and sha256(reference.encode()) == ORIGINAL_REFERENCE_SHA256, "Unexpected original reference")
    converted_reference = reference[:-1]
    require(sha256(converted_reference.encode()) == REFERENCE_SHA256, "Converted reference differs from web scaffold")
    array = bundle["score_logp"]
    require(isinstance(array, NumericArray) and array.shape == (493, 20) and array.dtype == "f8", "Expected float64 493×20 score cache")
    original_logp = [array.values[i * 20:(i + 1) * 20] for i in range(493)]
    require(len(bundle["fits"]) == 3, "Expected three assay fits")
    fits, original_fits = [], []
    for assay, stored in zip(("C295", "C388", "C871"), bundle["fits"]):
        model = stored["model"]
        require(isinstance(model, DataBox) and model.kind == "Ridge", "Expected passive Ridge state")
        state = model.state
        coef = state["coef_"]
        require(state["n_features_in_"] == 9861 and isinstance(coef, NumericArray) and coef.shape == (9861,) and coef.dtype == "f8", "Unexpected coefficient layout")
        require(stored["name"] == "Hsu_ESM2_OneHot_Ridge", "Unexpected fit architecture")
        dropped = coef.values[9840:9860]
        require(all(value == 0.0 for value in dropped), "Terminal coefficients are nonzero; scientific review required")
        fit = {"assay": assay, "name": stored["name"], "oneHotCoefficients": coef.values[:9840], "esmCoefficient": coef.values[9860], "intercept": finite_number(state["intercept_"], "intercept"), "droppedTerminalCoefficients": dropped}
        for key in ("mean", "std", "weight"):
            fit[key] = finite_number(stored[key], key)
        require(fit["std"] > 0, "Invalid stored standard deviation")
        fits.append(fit)
        original_fits.append({**fit, "oneHotCoefficients": coef.values[:9860]})
    examples, current = {}, None
    for line in source["examples"].decode().splitlines():
        if line.startswith(">"):
            current = line[1:].strip()
            require(current and current not in examples, "Invalid example ID")
            examples[current] = ""
        elif line.strip():
            require(current is not None, "Example FASTA header missing")
            examples[current] += line.strip()
    expected_rows = list(csv.DictReader(io.StringIO(source["expected"].decode())))
    require(len(examples) == len(expected_rows) == 3, "Expected exactly three independent archived examples")
    golden, max_error = [], 0.0
    for row in expected_rows:
        protein = examples[row["candidate_id"]]
        require(len(protein) == 493 and protein[-1] == reference[-1], "Example terminal residue differs; conversion is not valid")
        expected = {key: float(row[key]) for key in ("C295_hat", "C388_hat", "C871_hat", "S_hat", "ESM2_score")}
        original = predict_sequence(protein, reference, original_logp, original_fits)
        converted = predict_sequence(protein[:-1], converted_reference, original_logp[:492], fits)
        for key, value in expected.items():
            error = abs(original[key] - value)
            max_error = max(max_error, error)
            require(error <= 1e-12 and converted[key] == original[key], "Golden mismatch for " + row["candidate_id"] + ": " + key)
        golden.append({"id": row["candidate_id"], "protein": protein[:-1], "originalProtein493": protein, "expected": {**expected, "rank": int(row["predicted_rank"])}})
    provenance = {"sourceMembers": MEMBERS, "sourceSha256": {key: sha256(value) for key, value in source.items()}, "originalReferenceSha256": ORIGINAL_REFERENCE_SHA256, "modelSourceSha256": MODEL_SOURCE_SHA256, "serializedGlobalsInterpretedAsTags": sorted(reader.globals), "opcodeCounts": dict(sorted(reader.opcodes.items())), "numericArrays": reader.arrays, "frames": reader.frames, "reader": "stdlib-only passive pickletools interpreter; no pickle/joblib loading or serialized Python execution", "goldenMaxAbsoluteError": max_error}
    exported = {"schemaVersion": 1, "modelId": "module2-fixed492", "modelVersion": "checkpoint-c0fb39463be5-terminal493-removed-v1", "sourceCheckpointSha256": CHECKPOINT_SHA256, "compatibilityVersion": "drop-fixed-terminal-g-v1", "aaAlphabet": ALPHABET, "reference492": converted_reference, "originalReference493": reference, "referenceSha256": REFERENCE_SHA256, "originalReferenceSha256": ORIGINAL_REFERENCE_SHA256, "scoreLogp": {"dtype": "float64", "shape": [492, 20], "values": original_logp[:492]}, "fits": fits, "conversion": {"removedPosition1Based": 493, "removedResidue": "G", "originalOneHotFeatureCount": 9860, "oneHotFeatureCount": 9840, "originalEsmFeatureIndex": 9860, "allDroppedCoefficientsZero": True, "esmCacheContext": "Original 493-aa reference; first 492 rows retained exactly. ESM-2 was not rerun.", "retrained": False, "scoreNormalizationChanged": False}, "provenance": provenance}
    fixture = {"schemaVersion": 1, "modelId": exported["modelId"], "sourceCheckpointSha256": CHECKPOINT_SHA256, "compatibilityVersion": exported["compatibilityVersion"], "referenceSha256": REFERENCE_SHA256, "sourceExpectedCsvSha256": provenance["sourceSha256"]["expected"], "tolerance": 1e-12, "rows": golden}
    return exported, fixture


def main():
    repo = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=repo / "data/puf-ranker-492.json")
    parser.add_argument("--golden", type=Path, default=repo / "tests/fixtures/puf-ranker-golden.json")
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    if not args.check_only:
        require(not args.output.exists() and not args.golden.exists(), "Output already exists; refusing to overwrite")
    with zipfile.ZipFile(args.archive) as archive:
        source = {}
        for key, name in MEMBERS.items():
            require(archive.getinfo(name).file_size <= 1_000_000, "Source member exceeds bounded-read limit")
            source[key] = archive.read(name)
    exported, golden = make_export(source)
    encoded = json.dumps(exported, separators=(",", ":"), allow_nan=False) + "\n"
    require(json.loads(encoded) == exported, "JSON round-trip changed a coefficient")
    if not args.check_only:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.golden.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("x", encoding="utf-8", newline="\n") as handle:
            handle.write(encoded)
        with args.golden.open("x", encoding="utf-8", newline="\n") as handle:
            json.dump(golden, handle, indent=2, allow_nan=False)
            handle.write("\n")
    print(json.dumps({"checkedOnly": args.check_only, "checkpointSha256": CHECKPOINT_SHA256, "referenceSha256": REFERENCE_SHA256, "arrays": exported["provenance"]["numericArrays"], "globalsInterpretedAsTags": exported["provenance"]["serializedGlobalsInterpretedAsTags"], "goldenRows": len(golden["rows"]), "goldenMaxAbsoluteError": exported["provenance"]["goldenMaxAbsoluteError"], "jsonBytes": len(encoded.encode()), "allDroppedCoefficientsZero": True}, indent=2))


if __name__ == "__main__":
    main()
